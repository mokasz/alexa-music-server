/**
 * Cloudflare Workers Entry Point for Alexa Music Skill
 *
 * Handles Alexa skill requests using Workers KV for data storage
 * and Google Drive for music file streaming
 */

import Alexa from 'ask-sdk-core';
import { MusicLibraryKVAdapter } from '../adapters/musicLibraryAdapter.js';
import { PlaylistManagerKVAdapter } from '../adapters/playlistManagerAdapter.js';
import { alexaHandlers, ErrorHandler } from './alexaHandlers.js';

/**
 * Build Alexa Skill with KV adapters
 * @param {KVNamespace} musicDB - KV namespace for music library
 * @param {KVNamespace} sessions - KV namespace for session management
 * @returns {Object} Alexa skill
 */
function buildAlexaSkill(musicDB, sessions) {
  // Initialize adapters
  const musicLibrary = new MusicLibraryKVAdapter(musicDB);
  const playlistManager = new PlaylistManagerKVAdapter(sessions, 86400); // 24 hour TTL

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
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    // Health check endpoint
    if (path === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'alexa-music-workers',
          timestamp: new Date().toISOString()
        }),
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Stream endpoint - proxy audio from Google Drive
    if (path.startsWith('/stream/') && request.method === 'GET') {
      const trackId = path.replace('/stream/', '');

      try {
        // Get music library
        const libraryData = await env.MUSIC_DB.get('music-library', 'json');
        if (!libraryData || !libraryData.tracks) {
          return new Response('Music library not found', { status: 404 });
        }

        // Find track
        const track = libraryData.tracks.find(t => t.id === trackId);
        if (!track || !track.streamUrl) {
          return new Response('Track not found', { status: 404 });
        }

        console.log(`Streaming: ${track.title} (${trackId})`);

        // Fetch from Google Drive with Range header support
        const driveHeaders = new Headers();
        const rangeHeader = request.headers.get('range');
        if (rangeHeader) {
          driveHeaders.set('Range', rangeHeader);
        }

        const driveResponse = await fetch(track.streamUrl, {
          headers: driveHeaders,
          redirect: 'follow'
        });

        if (!driveResponse.ok) {
          console.error(`Google Drive fetch failed: ${driveResponse.status}`);
          return new Response('Failed to fetch audio', { status: 502 });
        }

        // Proxy response with proper headers
        const headers = new Headers();
        headers.set('Content-Type', 'audio/mpeg');
        headers.set('Accept-Ranges', 'bytes');
        headers.set('Cache-Control', 'public, max-age=3600');

        // Copy Content-Length and Content-Range from Drive response
        const contentLength = driveResponse.headers.get('content-length');
        if (contentLength) {
          headers.set('Content-Length', contentLength);
        }

        const contentRange = driveResponse.headers.get('content-range');
        if (contentRange) {
          headers.set('Content-Range', contentRange);
        }

        return new Response(driveResponse.body, {
          status: driveResponse.status,
          headers: headers
        });

      } catch (error) {
        console.error('Stream error:', error.message);
        return new Response('Internal server error', { status: 500 });
      }
    }

    // Alexa skill endpoint
    if (path === '/alexa' && request.method === 'POST') {
      try {
        // Parse request body
        const alexaRequest = await request.json();

        console.log(`Alexa Request: ${alexaRequest.request.type}`);

        // Build skill with KV adapters
        const { skill, musicLibrary, playlistManager } = buildAlexaSkill(
          env.MUSIC_DB,
          env.SESSIONS
        );

        // Initialize music library (loads from KV)
        await musicLibrary.initialize();

        // Inject adapters into request envelope context
        alexaRequest.context = alexaRequest.context || {};
        alexaRequest.context.env = {
          musicLibrary,
          playlistManager
        };

        // Invoke Alexa skill
        const alexaResponse = await skill.invoke(alexaRequest);

        console.log(`Alexa Response: ${JSON.stringify(alexaResponse)}`);

        // Return response
        return new Response(JSON.stringify(alexaResponse), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });

      } catch (error) {
        console.error('Alexa request error:', error);

        return new Response(
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
      }
    }

    // 404 Not Found for other paths
    return new Response('Not Found', { status: 404 });
  }
};
