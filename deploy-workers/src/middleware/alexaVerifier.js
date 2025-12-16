/**
 * Alexa Request Signature Verification for Cloudflare Workers
 * Uses Web Crypto API for certificate validation
 *
 * Amazon Documentation:
 * https://developer.amazon.com/docs/custom-skills/host-a-custom-skill-as-a-web-service.html
 */

const CERT_CACHE_TTL = 3600; // 1 hour

export class AlexaVerifier {
  constructor(certCacheKV) {
    this.certCache = certCacheKV; // KV namespace for caching
  }

  /**
   * Main verification method
   * @param {Request} request - Cloudflare Request object
   * @param {string} requestBody - Stringified request body
   * @param {string} skillId - Expected Alexa Skill ID
   * @returns {Promise<boolean>}
   */
  async verify(request, requestBody, skillId = null) {
    const certUrl = request.headers.get('SignatureCertChainUrl');
    // Support both SHA-256 (recommended) and SHA-1 (legacy) signatures
    const signature = request.headers.get('Signature-256') || request.headers.get('Signature');
    const signatureType = request.headers.get('Signature-256') ? 'SHA-256' : 'SHA-1';

    console.log(`🔐 Using ${signatureType} signature verification`);

    if (!certUrl || !signature) {
      throw new Error('Missing signature headers');
    }

    // Step 1: Validate certificate URL format
    if (!this.isValidCertUrl(certUrl)) {
      throw new Error('Invalid certificate URL format');
    }

    // Step 2: Download certificate (with caching)
    const certPem = await this.getCertificate(certUrl);

    // Step 3: Extract public key
    const publicKey = await this.extractPublicKey(certPem);

    // Step 4: Verify signature
    const isValid = await this.verifySignature(
      publicKey,
      signature,
      requestBody
    );

    if (!isValid) {
      throw new Error('Invalid signature');
    }

    // Step 5: Verify timestamp
    const alexaRequest = JSON.parse(requestBody);
    this.verifyTimestamp(alexaRequest);

    // Step 6: Verify skill ID
    if (skillId) {
      this.verifySkillId(alexaRequest, skillId);
    }

    return true;
  }

  /**
   * Validate certificate URL per Amazon spec
   * https://developer.amazon.com/docs/custom-skills/host-a-custom-skill-as-a-web-service.html#checking-the-signature-of-the-request
   */
  isValidCertUrl(url) {
    try {
      const parsed = new URL(url);

      // Must be HTTPS
      if (parsed.protocol !== 'https:') return false;

      // Must be from s3.amazonaws.com or s3.amazonaws.com-[region]
      const validHosts = [
        's3.amazonaws.com',
        's3.amazonaws.com-global'
      ];

      const isValidHost = validHosts.some(host =>
        parsed.hostname === host || parsed.hostname.startsWith('s3.amazonaws.com-')
      );

      if (!isValidHost) return false;

      // Path must start with /echo.api/
      if (!parsed.pathname.startsWith('/echo.api/')) return false;

      // Port must be 443 (or default for HTTPS)
      if (parsed.port && parsed.port !== '443') return false;

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Download and cache certificate
   */
  async getCertificate(certUrl) {
    // Check cache
    if (this.certCache) {
      const cached = await this.certCache.get(certUrl);
      if (cached) {
        console.log('✅ Certificate cache hit', { certUrl });
        return cached;
      }
    }

    // Download certificate
    console.log('📥 Downloading certificate', { certUrl });
    const response = await fetch(certUrl);

    if (!response.ok) {
      throw new Error(`Certificate download failed: ${response.status}`);
    }

    const certPem = await response.text();

    // Validate PEM format
    if (!certPem.includes('-----BEGIN CERTIFICATE-----')) {
      throw new Error('Invalid certificate format');
    }

    // Cache certificate
    if (this.certCache) {
      await this.certCache.put(certUrl, certPem, {
        expirationTtl: CERT_CACHE_TTL
      });
      console.log('💾 Certificate cached', { certUrl });
    }

    return certPem;
  }

  /**
   * Extract public key from PEM certificate using @peculiar/x509
   */
  async extractPublicKey(certPem) {
    try {
      // Import X509Certificate from @peculiar/x509
      const { X509Certificate } = await import('@peculiar/x509');

      // Parse the certificate
      const cert = new X509Certificate(certPem);

      // Export the public key as ArrayBuffer
      const publicKeyArrayBuffer = await cert.publicKey.export('spki');

      // Import it as a CryptoKey for verification
      const publicKey = await crypto.subtle.importKey(
        'spki',
        publicKeyArrayBuffer,
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256' // Amazon recommends SHA-256 (Signature-256 header)
        },
        false,
        ['verify']
      );

      console.log('✅ Public key extracted with SHA-256');
      return publicKey;
    } catch (error) {
      console.error('❌ Failed to extract public key', error);
      throw new Error('Certificate parsing failed: ' + error.message);
    }
  }

  /**
   * Verify RSA-SHA256 signature
   */
  async verifySignature(publicKey, signatureBase64, requestBody) {
    try {
      // Decode signature from base64
      const signatureBuffer = this.base64ToArrayBuffer(signatureBase64);

      // Convert request body to ArrayBuffer
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(requestBody);

      // Verify using RSA-SHA256
      const isValid = await crypto.subtle.verify(
        {
          name: 'RSASSA-PKCS1-v1_5'
        },
        publicKey,
        signatureBuffer,
        dataBuffer
      );

      return isValid;
    } catch (error) {
      console.error('❌ Signature verification failed', error);
      return false;
    }
  }

  /**
   * Verify request timestamp (150-second window)
   */
  verifyTimestamp(alexaRequest) {
    const timestamp = alexaRequest.request?.timestamp;

    if (!timestamp) {
      throw new Error('Missing request timestamp');
    }

    const requestTime = new Date(timestamp).getTime();
    const now = Date.now();
    const timeDifference = Math.abs(now - requestTime);

    // Amazon specification: 150 seconds
    if (timeDifference > 150000) {
      throw new Error(`Request timestamp too old: ${timeDifference}ms`);
    }
  }

  /**
   * Verify skill ID matches
   */
  verifySkillId(alexaRequest, expectedSkillId) {
    const applicationId =
      alexaRequest.session?.application?.applicationId ||
      alexaRequest.context?.System?.application?.applicationId;

    if (applicationId !== expectedSkillId) {
      throw new Error(`Skill ID mismatch: expected ${expectedSkillId}, got ${applicationId}`);
    }
  }

  /**
   * Base64 to ArrayBuffer conversion
   */
  base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

/**
 * Helper function to verify an Alexa request
 * @param {Request} request - Cloudflare Request object
 * @param {string} requestBody - Stringified request body
 * @param {KVNamespace} certCache - KV namespace for certificate caching
 * @param {string} skillId - Expected skill ID
 * @param {boolean} verifySignature - Whether to verify signature (default: true)
 * @returns {Promise<void>} Throws error if verification fails
 */
export async function verifyAlexaRequest(request, requestBody, certCache, skillId, verifySignature = true) {
  // Skip verification if disabled
  if (!verifySignature) {
    console.warn('⚠️  Alexa signature verification is DISABLED');
    return;
  }

  const verifier = new AlexaVerifier(certCache);

  try {
    await verifier.verify(request, requestBody, skillId);
    console.log('✅ Alexa request verified successfully with SHA-256');
  } catch (error) {
    console.error('❌ Alexa verification failed:', error.message);
    throw error;
  }
}
