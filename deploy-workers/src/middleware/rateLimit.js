/**
 * Rate Limiting Middleware for Cloudflare Workers
 * Uses KV namespace to track request counts per IP
 */

/**
 * Check if request should be rate limited
 * @param {Request} request - Incoming request
 * @param {KVNamespace} kvNamespace - KV namespace for tracking
 * @param {Object} options - Rate limit options
 * @returns {Promise<Object>} { allowed: boolean, remaining: number }
 */
export async function rateLimitCheck(request, kvNamespace, options = {}) {
  const {
    limit = 20, // requests per window
    window = 60, // window in seconds
    keyPrefix = 'ratelimit'
  } = options;

  // Get client IP
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = `${keyPrefix}:${ip}`;

  try {
    // Get current count
    const currentValue = await kvNamespace.get(key);

    if (!currentValue) {
      // First request in window
      await kvNamespace.put(key, '1', { expirationTtl: window });
      return { allowed: true, remaining: limit - 1 };
    }

    const count = parseInt(currentValue);

    if (count >= limit) {
      // Rate limit exceeded
      console.warn('⚠️  Rate limit exceeded', { ip, count, limit });
      return { allowed: false, remaining: 0 };
    }

    // Increment counter
    await kvNamespace.put(key, String(count + 1), { expirationTtl: window });
    return { allowed: true, remaining: limit - count - 1 };

  } catch (error) {
    console.error('Rate limit check error:', error);
    // On error, allow the request (fail open)
    return { allowed: true, remaining: limit };
  }
}

/**
 * Create rate limit middleware for specific endpoint
 * @param {KVNamespace} kvNamespace - KV namespace
 * @param {Object} options - Rate limit options
 * @returns {Function} Middleware function
 */
export function createRateLimiter(kvNamespace, options) {
  return async function(request) {
    const result = await rateLimitCheck(request, kvNamespace, options);

    if (!result.allowed) {
      return new Response('Rate limit exceeded. Please try again later.', {
        status: 429,
        headers: {
          'Content-Type': 'text/plain',
          'Retry-After': String(options.window || 60),
          'X-RateLimit-Limit': String(options.limit || 20),
          'X-RateLimit-Remaining': '0'
        }
      });
    }

    return null; // Continue to next handler
  };
}
