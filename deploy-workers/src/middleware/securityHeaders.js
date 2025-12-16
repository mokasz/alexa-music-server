/**
 * Security Headers Middleware for Cloudflare Workers
 * Adds security-related HTTP headers to all responses
 */

/**
 * Add security headers to response
 * @param {Response} response - Original response
 * @param {Request} request - Original request
 * @returns {Response} Response with security headers
 */
export function addSecurityHeaders(response, request) {
  const headers = new Headers(response.headers);

  // Prevent MIME type sniffing
  headers.set('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  headers.set('X-Frame-Options', 'DENY');

  // Enable XSS protection (legacy, but still useful)
  headers.set('X-XSS-Protection', '1; mode=block');

  // Control referrer information
  headers.set('Referrer-Policy', 'no-referrer');

  // Restrict dangerous browser features
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // HSTS for HTTPS enforcement (1 year)
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // Content Security Policy for /alexa endpoint
  const url = new URL(request.url);
  if (url.pathname === '/alexa') {
    headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}
