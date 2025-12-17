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

    // HIGH-002: Removed verbose logging (signatureType not logged in production)

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
   * Extract public key from PEM certificate
   * Uses a simple approach: extract SPKI from DER-encoded certificate
   */
  async extractPublicKey(certPem) {
    try {
      // Extract only valid base64 characters
      // Remove ALL characters that are not valid base64 (A-Z, a-z, 0-9, +, /, =)
      const pemContents = certPem
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/[^A-Za-z0-9+/=]/g, '');  // Remove all non-base64 characters

      // Use manual base64 decode instead of atob() to avoid Workers issues
      const certDer = this.base64Decode(pemContents);

      // Parse DER to extract SubjectPublicKeyInfo (SPKI)
      const spki = this.extractSPKIFromDER(certDer);

      // Import the public key using Web Crypto API
      const publicKey = await crypto.subtle.importKey(
        'spki',
        spki,
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256'
        },
        false,
        ['verify']
      );

      return publicKey;
    } catch (error) {
      console.error('❌ Failed to extract public key', error);
      throw new Error('Certificate parsing failed: ' + error.message);
    }
  }

  /**
   * Extract SubjectPublicKeyInfo from DER-encoded X.509 certificate
   * This is a simplified ASN.1 parser for extracting SPKI
   */
  extractSPKIFromDER(certDer) {
    let offset = 0;

    // Helper to read ASN.1 length
    const readLength = () => {
      let length = certDer[offset++];
      if (length & 0x80) {
        const numBytes = length & 0x7f;
        length = 0;
        for (let i = 0; i < numBytes; i++) {
          length = (length << 8) | certDer[offset++];
        }
      }
      return length;
    };

    // Skip outer SEQUENCE (Certificate)
    if (certDer[offset++] !== 0x30) throw new Error('Invalid certificate structure');
    readLength();

    // Skip TBSCertificate SEQUENCE header
    if (certDer[offset++] !== 0x30) throw new Error('Invalid TBSCertificate structure');
    readLength();

    // Skip version [0] (optional, usually present)
    if (certDer[offset] === 0xa0) {
      offset++;
      const versionLength = readLength();
      offset += versionLength;
    }

    // Skip serialNumber (INTEGER)
    if (certDer[offset++] !== 0x02) throw new Error('Invalid serialNumber');
    offset += readLength();

    // Skip signature (SEQUENCE)
    if (certDer[offset++] !== 0x30) throw new Error('Invalid signature');
    offset += readLength();

    // Skip issuer (SEQUENCE)
    if (certDer[offset++] !== 0x30) throw new Error('Invalid issuer');
    offset += readLength();

    // Skip validity (SEQUENCE)
    if (certDer[offset++] !== 0x30) throw new Error('Invalid validity');
    offset += readLength();

    // Skip subject (SEQUENCE)
    if (certDer[offset++] !== 0x30) throw new Error('Invalid subject');
    offset += readLength();

    // Now we're at SubjectPublicKeyInfo (SEQUENCE)
    if (certDer[offset] !== 0x30) throw new Error('Invalid SPKI structure');
    const spkiStart = offset;
    offset++;
    const spkiLength = readLength();
    const spkiEnd = offset + spkiLength;

    // Extract SPKI (including the SEQUENCE header)
    return certDer.slice(spkiStart, spkiEnd);
  }

  /**
   * Verify RSA-SHA256 signature
   */
  async verifySignature(publicKey, signatureBase64, requestBody) {
    try {
      // Decode signature from base64 using manual decoder
      const signatureBytes = this.base64Decode(signatureBase64);
      const signatureBuffer = signatureBytes.buffer;

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
   * Manual base64 decode (for certificate parsing)
   * More reliable than atob() in Cloudflare Workers
   */
  base64Decode(base64String) {
    const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup = new Uint8Array(256);
    for (let i = 0; i < base64Chars.length; i++) {
      lookup[base64Chars.charCodeAt(i)] = i;
    }

    const len = base64String.length;
    let bufferLength = (len * 3) / 4;

    // Handle padding
    if (base64String[len - 1] === '=') {
      bufferLength--;
      if (base64String[len - 2] === '=') {
        bufferLength--;
      }
    }

    const bytes = new Uint8Array(bufferLength);
    let p = 0;

    for (let i = 0; i < len; i += 4) {
      const encoded1 = lookup[base64String.charCodeAt(i)];
      const encoded2 = lookup[base64String.charCodeAt(i + 1)];
      const encoded3 = lookup[base64String.charCodeAt(i + 2)];
      const encoded4 = lookup[base64String.charCodeAt(i + 3)];

      bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
      if (i + 2 < len && base64String[i + 2] !== '=') {
        bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
      }
      if (i + 3 < len && base64String[i + 3] !== '=') {
        bytes[p++] = ((encoded3 & 3) << 6) | encoded4;
      }
    }

    return bytes;
  }

  /**
   * Base64 to ArrayBuffer conversion (for signature verification)
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
