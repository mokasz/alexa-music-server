/**
 * Rate Limiting Middleware for Cloudflare Workers
 * Uses in-memory cache to track request counts per IP
 *
 * HIGH-001 FIX: Switched from KV to in-memory to avoid KV write limits
 * Trade-off: Rate limits reset on cold starts (acceptable for most use cases)
 */

// Global in-memory cache (persists across requests in same Worker instance)
const rateLimitCache = new Map();

// Cleanup old entries periodically to prevent memory leaks
function cleanupOldEntries() {
  const now = Date.now();
  for (const [key, value] of rateLimitCache.entries()) {
    // Remove entries older than 5 minutes
    if (now - value.timestamp > 300000) {
      rateLimitCache.delete(key);
    }
  }
}

/**
 * Check if request should be rate limited
 * @param {Request} request - Incoming request
 * @param {KVNamespace} kvNamespace - KV namespace (not used, kept for compatibility)
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
  const now = Date.now();
  const windowMs = window * 1000;
  const key = `${keyPrefix}:${ip}`;

  try {
    // Check in-memory cache (no KV access - solves HIGH-001)
    const cached = rateLimitCache.get(key);

    if (cached && (now - cached.timestamp) < windowMs) {
      // Within same time window
      if (cached.count >= limit) {
        // Rate limit exceeded
        console.warn('⚠️  Rate limit exceeded', { ip, count: cached.count, limit });
        return { allowed: false, remaining: 0 };
      }

      // Increment counter
      cached.count++;
      return { allowed: true, remaining: limit - cached.count };
    }

    // New window - reset counter
    rateLimitCache.set(key, { count: 1, timestamp: now });

    // Periodic cleanup (every ~100 requests)
    if (Math.random() < 0.01) {
      cleanupOldEntries();
    }

    return { allowed: true, remaining: limit - 1 };

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
