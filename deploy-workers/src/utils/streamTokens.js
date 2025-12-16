/**
 * JWT Stream Token utilities for Cloudflare Workers
 * Uses Web Crypto API (HMAC-SHA256)
 */

/**
 * Generate JWT token using Web Crypto API
 * @param {string} trackId - Track ID to authorize
 * @param {string} skillId - Alexa skill ID
 * @param {string} secret - JWT secret
 * @param {number} expiresIn - Expiration in seconds (default: 3600)
 * @returns {Promise<string>} JWT token
 */
export async function generateStreamToken(trackId, skillId, secret, expiresIn = 3600) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    trackId,
    skillId,
    type: 'stream',
    iat: now,
    exp: now + expiresIn,
    iss: 'alexa-music-workers',
    sub: trackId
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  // Create signature
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await signHS256(signatureInput, secret);

  return `${signatureInput}.${signature}`;
}

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @param {string} secret - JWT secret
 * @returns {Promise<object|null>} Decoded payload if valid, null if invalid
 */
export async function verifyStreamToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('Invalid token format');
      return null;
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    // Verify signature
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = await signHS256(signatureInput, secret);

    if (signature !== expectedSignature) {
      console.warn('Token signature mismatch');
      return null;
    }

    // Decode payload
    const payload = JSON.parse(base64UrlDecode(encodedPayload));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.warn('Token expired', {
        exp: payload.exp,
        now: now,
        diff: now - payload.exp
      });
      return null;
    }

    // Check type
    if (payload.type !== 'stream') {
      console.warn('Invalid token type', { type: payload.type });
      return null;
    }

    return payload;
  } catch (error) {
    console.error('Token verification error', error);
    return null;
  }
}

/**
 * Sign data using HMAC-SHA256
 * @param {string} data - Data to sign
 * @param {string} secret - Secret key
 * @returns {Promise<string>} Base64 URL-encoded signature
 */
async function signHS256(data, secret) {
  const encoder = new TextEncoder();

  // Import secret key
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Sign data
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data)
  );

  return base64UrlEncode(signature);
}

/**
 * Base64 URL encode
 * @param {string|ArrayBuffer} input - Input to encode
 * @returns {string} Base64 URL-encoded string
 */
function base64UrlEncode(input) {
  let base64;

  if (typeof input === 'string') {
    // String input
    base64 = btoa(unescape(encodeURIComponent(input)));
  } else {
    // ArrayBuffer input
    const bytes = new Uint8Array(input);
    const binary = String.fromCharCode(...bytes);
    base64 = btoa(binary);
  }

  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64 URL decode
 * @param {string} input - Base64 URL-encoded string
 * @returns {string} Decoded string
 */
function base64UrlDecode(input) {
  // Add padding
  const pad = input.length % 4;
  if (pad) {
    input += '='.repeat(4 - pad);
  }

  // Replace URL-safe characters
  const base64 = input
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  return decodeURIComponent(escape(atob(base64)));
}
