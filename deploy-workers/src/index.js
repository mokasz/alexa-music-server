/**
 * Cloudflare Workers Entry Point for Alexa Music Skill
 *
 * Handles Alexa skill requests using Workers KV for data storage
 * and Google Drive for music file streaming
 */

import Alexa from 'ask-sdk-core';
import { MusicLibraryKVAdapter } from '../adapters/musicLibraryAdapter.js';
import { PlaylistManagerDurableAdapter } from '../adapters/playlistManagerDurableAdapter.js';
import { alexaHandlers, ErrorHandler } from './alexaHandlers.js';
import { SessionDurableObject } from './SessionDurableObject.js';
import { verifyAlexaRequest } from './middleware/alexaVerifier.js';
import { verifyStreamToken } from './utils/streamTokens.js';
import { addSecurityHeaders } from './middleware/securityHeaders.js';
import { rateLimitCheck } from './middleware/rateLimit.js';

/**
 * Build Alexa Skill with Durable Objects
 * @param {KVNamespace} musicDB - KV namespace for music library
 * @param {DurableObjectNamespace} sessionsDO - Durable Object namespace for session management
 * @param {KVNamespace} sessionsKV - KV namespace for backup (optional)
 * @returns {Object} Alexa skill
 */
function buildAlexaSkill(musicDB, sessionsDO, sessionsKV = null) {
  // Initialize adapters
  const musicLibrary = new MusicLibraryKVAdapter(musicDB);
  const playlistManager = new PlaylistManagerDurableAdapter(sessionsDO, sessionsKV);

  // Build skill
  const skill = Alexa.SkillBuilders.custom()
    .addRequestHandlers(...alexaHandlers)
    .addErrorHandlers(ErrorHandler)
    .create();

  return { skill, musicLibrary, playlistManager };
}

/**
 * Handle CORS preflight requests
 * @param {Request} request - Request object
 * @returns {Response} CORS response
 */
function handleCORS(request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };

  return new Response(null, {
    status: 204,
    headers
  });
}

/**
 * Cloudflare Workers fetch handler
 * @param {Request} request - Incoming request
 * @param {Object} env - Environment bindings (KV namespaces, secrets, etc.)
 * @param {Object} ctx - Execution context
 * @returns {Promise<Response>} Response
 */
export default {
  async fetch(request, env, ctx) {
    // CRITICAL-001: Validate JWT_SECRET at startup
    if (!env.JWT_SECRET) {
      console.error('❌ CRITICAL: JWT_SECRET is not set');
      return new Response('Service configuration error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    // HIGH-002: Control verbose logging based on environment
    // TEMPORARY: Force DEBUG mode to diagnose recurring 401 error
    const DEBUG = true; // env.NODE_ENV !== 'production';

    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    // Health check endpoint
    if (path === '/health') {
      const response = new Response(
        JSON.stringify({
          status: 'ok',
          service: 'alexa-music-workers',
          timestamp: new Date().toISOString()
        }),
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
      return addSecurityHeaders(response, request);
    }

    // Stream endpoint - proxy audio from Google Drive
    if (path.startsWith('/stream/') && request.method === 'GET') {
      const trackId = path.replace('/stream/', '');

      try {
        // Rate limiting for streams
        const rateLimitResult = await rateLimitCheck(request, env.CERT_CACHE, {
          limit: 100, // 100 requests per minute (generous for music streaming)
          window: 60,
          keyPrefix: 'ratelimit:stream'
        });

        if (!rateLimitResult.allowed) {
          console.warn('⚠️  Rate limit exceeded for /stream', {
            ip: request.headers.get('CF-Connecting-IP'),
            trackId
          });
          const response = new Response('Rate limit exceeded. Please try again later.', {
            status: 429,
            headers: {
              'Content-Type': 'text/plain',
              'Retry-After': '60'
            }
          });
          return addSecurityHeaders(response, request);
        }

        // JWT Token validation
        const token = url.searchParams.get('token');

        if (!token) {
          console.warn('❌ Stream request without token', { trackId });
          const response = new Response('Missing authentication token', {
            status: 401,
            headers: { 'Content-Type': 'text/plain' }
          });
          return addSecurityHeaders(response, request);
        }

        // Verify token
        const decoded = await verifyStreamToken(token, env.JWT_SECRET);
        if (!decoded) {
          console.warn('❌ Invalid stream token', { trackId });
          const response = new Response('Invalid or expired token', {
            status: 403,
            headers: { 'Content-Type': 'text/plain' }
          });
          return addSecurityHeaders(response, request);
        }

        // Verify token is for the requested track
        if (decoded.trackId !== trackId) {
          console.warn('❌ Token/track ID mismatch', {
            tokenTrackId: decoded.trackId,
            requestedTrackId: trackId
          });
          const response = new Response('Token/track mismatch', {
            status: 403,
            headers: { 'Content-Type': 'text/plain' }
          });
          return addSecurityHeaders(response, request);
        }

        // HIGH-002: Only log in debug mode
        if (DEBUG) {
          console.log('✅ Stream token validated', { trackId });
        }
        // Get music library
        const libraryData = await env.MUSIC_DB.get('music-library', 'json');
        if (!libraryData || !libraryData.tracks) {
          const response = new Response('Music library not found', {
            status: 404,
            headers: { 'Content-Type': 'text/plain' }
          });
          return addSecurityHeaders(response, request);
        }

        // Find track
        const track = libraryData.tracks.find(t => t.id === trackId);
        if (!track || !track.streamUrl) {
          const response = new Response('Track not found', {
            status: 404,
            headers: { 'Content-Type': 'text/plain' }
          });
          return addSecurityHeaders(response, request);
        }

        // HIGH-002: Only log detailed streaming info in debug mode
        const rangeHeader = request.headers.get('range');
        if (DEBUG) {
          console.log(`ストリーミング中: ${track.title} (${trackId})`, {
            range: rangeHeader || 'フルファイル',
            fileSize: track.fileSize || '不明',
            timestamp: new Date().toISOString()
          });
        }

        // Google Drive fetchにタイムアウト/リトライロジック追加
        const driveHeaders = new Headers();
        if (rangeHeader) {
          driveHeaders.set('Range', rangeHeader);
        }

        let driveResponse;
        let retryCount = 0;
        const maxRetries = 2;

        while (retryCount <= maxRetries) {
          try {
            // 30秒タイムアウトを追加
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            driveResponse = await fetch(track.streamUrl, {
              headers: driveHeaders,
              redirect: 'follow',
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (driveResponse.ok) {
              break; // 成功
            }

            console.warn(`Google Drive取得失敗: ${driveResponse.status}, リトライ ${retryCount + 1}/${maxRetries}`);
            retryCount++;

            if (retryCount <= maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // 指数バックオフ
            }

          } catch (error) {
            console.error(`Google Drive取得エラー（試行 ${retryCount + 1}）:`, error.message);
            retryCount++;

            if (retryCount > maxRetries) {
              const response = new Response('リトライ後もオーディオ取得失敗', {
                status: 502,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
              });
              return addSecurityHeaders(response, request);
            }

            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          }
        }

        if (!driveResponse || !driveResponse.ok) {
          console.error(`Google Drive取得失敗（${maxRetries}回リトライ後）`);
          const response = new Response('オーディオ取得失敗', {
            status: 502,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
          return addSecurityHeaders(response, request);
        }

        // Proxy response with proper headers
        const headers = new Headers();
        headers.set('Content-Type', 'audio/mpeg');
        headers.set('Accept-Ranges', 'bytes');

        // キャッシュヘッダーの改善: Rangeレスポンスはキャッシュしない
        if (rangeHeader) {
          headers.set('Cache-Control', 'no-cache');
        } else {
          headers.set('Cache-Control', 'public, max-age=3600');
        }

        // Copy Content-Length and Content-Range from Drive response
        const contentLength = driveResponse.headers.get('content-length');
        if (contentLength) {
          headers.set('Content-Length', contentLength);
        }

        const contentRange = driveResponse.headers.get('content-range');
        if (contentRange) {
          headers.set('Content-Range', contentRange);
        }

        const streamResponse = new Response(driveResponse.body, {
          status: driveResponse.status,
          headers: headers
        });
        return addSecurityHeaders(streamResponse, request);

      } catch (error) {
        console.error('Stream error:', error.message);
        const response = new Response('Internal server error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' }
        });
        return addSecurityHeaders(response, request);
      }
    }

    // Alexa skill endpoint
    if (path === '/alexa' && request.method === 'POST') {
      try {
        // HIGH-003: Request size limit validation
        const MAX_REQUEST_SIZE = 10 * 1024; // 10 KB (Alexa requests typically <5 KB)
        const contentLength = parseInt(request.headers.get('content-length') || '0');

        if (contentLength > MAX_REQUEST_SIZE) {
          console.warn('⚠️  Request too large', {
            size: contentLength,
            ip: request.headers.get('CF-Connecting-IP')
          });
          return new Response('Request too large', {
            status: 413,
            headers: { 'Content-Type': 'text/plain' }
          });
        }

        // Rate limiting
        const rateLimitResult = await rateLimitCheck(request, env.CERT_CACHE, {
          limit: 60, // 60 requests per minute
          window: 60,
          keyPrefix: 'ratelimit:alexa'
        });

        if (!rateLimitResult.allowed) {
          console.warn('⚠️  Rate limit exceeded for /alexa', {
            ip: request.headers.get('CF-Connecting-IP')
          });
          const response = new Response('Rate limit exceeded. Please try again later.', {
            status: 429,
            headers: {
              'Content-Type': 'text/plain',
              'Retry-After': '60'
            }
          });
          return addSecurityHeaders(response, request);
        }

        // Get request body as text first (needed for signature verification)
        const requestBody = await request.text();

        // HIGH-003: Validate actual body size
        if (requestBody.length > MAX_REQUEST_SIZE) {
          console.warn('⚠️  Request body too large', {
            size: requestBody.length,
            ip: request.headers.get('CF-Connecting-IP')
          });
          return new Response('Request too large', {
            status: 413,
            headers: { 'Content-Type': 'text/plain' }
          });
        }

        // Verify Alexa signature
        const verifySignature = env.ALEXA_VERIFY_SIGNATURE === 'true';
        if (verifySignature) {
          try {
            await verifyAlexaRequest(
              request,
              requestBody,
              env.CERT_CACHE,
              env.ALEXA_SKILL_ID,
              true
            );
          } catch (error) {
            console.error('❌ Alexa signature verification failed:', error.message);
            // CRITICAL-002: No CORS headers for /alexa (server-to-server)
            const response = new Response(
              JSON.stringify({
                version: '1.0',
                response: {
                  outputSpeech: {
                    type: 'PlainText',
                    text: 'リクエストの認証に失敗しました。'
                  },
                  shouldEndSession: true
                }
              }),
              {
                status: 401,
                headers: {
                  'Content-Type': 'application/json'
                }
              }
            );
            return addSecurityHeaders(response, request);
          }
        }

        // Parse request body
        const alexaRequest = JSON.parse(requestBody);

        // HIGH-002: Only log request details in debug mode
        if (DEBUG) {
          if (alexaRequest.request.type === 'IntentRequest') {
            console.log(`Alexa Request: ${alexaRequest.request.type} - ${alexaRequest.request.intent.name}`);
          } else {
            console.log(`Alexa Request: ${alexaRequest.request.type}`);
          }
        }

        // Build skill with Durable Objects
        const { skill, musicLibrary, playlistManager } = buildAlexaSkill(
          env.MUSIC_DB,
          env.SESSIONS_DO,
          env.SESSIONS // KV as backup
        );

        // Initialize music library (loads from KV)
        await musicLibrary.initialize();

        // Inject adapters and security settings into request envelope context
        alexaRequest.context = alexaRequest.context || {};
        alexaRequest.context.env = {
          musicLibrary,
          playlistManager,
          jwtSecret: env.JWT_SECRET,
          skillId: env.ALEXA_SKILL_ID,
          publicUrl: env.PUBLIC_URL || 'https://alexa-music-workers.swiftzhu.workers.dev'
        };

        // Invoke Alexa skill
        const alexaResponse = await skill.invoke(alexaRequest);

        // HIGH-002: Only log response details in debug mode
        if (DEBUG) {
          console.log(`Alexa Response: ${JSON.stringify(alexaResponse)}`);
        }

        // CRITICAL-002: No CORS headers for /alexa (server-to-server)
        const response = new Response(JSON.stringify(alexaResponse), {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        return addSecurityHeaders(response, request);

      } catch (error) {
        console.error('Alexa request error:', error);

        const response = new Response(
          JSON.stringify({
            version: '1.0',
            response: {
              outputSpeech: {
                type: 'PlainText',
                text: 'すみません、エラーが発生しました。'
              },
              shouldEndSession: true
            }
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          }
        );
        return addSecurityHeaders(response, request);
      }
    }

    // 404 Not Found for other paths
    const notFoundResponse = new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' }
    });
    return addSecurityHeaders(notFoundResponse, request);
  }
};

// Export Durable Object class (required for Cloudflare Workers)
export { SessionDurableObject };
