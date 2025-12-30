const alexaVerifier = require('alexa-verifier');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Alexa Request Signature Verification Middleware
 * Implements Amazon's required cryptographic validation
 *
 * Amazon Documentation:
 * https://developer.amazon.com/docs/custom-skills/host-a-custom-skill-as-a-web-service.html
 */
function verifyAlexaRequest(req, res, next) {
  // Development mode exception (only if explicitly disabled)
  if (!config.alexa.verifySignature && config.server.env !== 'production') {
    logger.warn('⚠️  Alexa signature verification is DISABLED - development mode only');
    return next();
  }

  // Production: Always verify
  const certUrl = req.headers['signaturecertchainurl'];
  const signature = req.headers['signature'];
  const requestBody = JSON.stringify(req.body);

  // Check required headers
  if (!certUrl || !signature) {
    logger.warn('❌ Missing Alexa signature headers', {
      hasCertUrl: !!certUrl,
      hasSignature: !!signature,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    return res.status(400).json({
      error: 'Missing signature headers',
      message: 'This endpoint requires Alexa authentication'
    });
  }

  // Cryptographic signature verification using alexa-verifier library
  // This library:
  // 1. Validates SignatureCertChainUrl format
  // 2. Downloads and caches the certificate
  // 3. Verifies certificate chain validity
  // 4. Checks echo-api.amazon.com in Subject Alternative Names
  // 5. Decrypts signature and compares with request hash
  alexaVerifier(certUrl, signature, requestBody, (error) => {
    if (error) {
      logger.error('❌ Alexa signature verification failed', {
        error: error.message,
        certUrl: certUrl,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      return res.status(401).json({
        error: 'Invalid request signature',
        message: 'Authentication failed'
      });
    }

    // Additional validation: Timestamp
    const alexaRequest = req.body;
    const timestamp = alexaRequest.request?.timestamp;

    if (timestamp) {
      const requestTime = new Date(timestamp).getTime();
      const now = Date.now();
      const timeDifference = Math.abs(now - requestTime);

      // Amazon requires 150-second tolerance for clock skew and network latency
      if (timeDifference > 150000) {
        logger.warn('⚠️  Request timestamp too old', {
          timeDifference: `${timeDifference}ms`,
          timestamp: timestamp,
          ip: req.ip
        });
        return res.status(400).json({
          error: 'Request timestamp too old',
          message: 'Request has expired'
        });
      }
    }

    // Additional validation: Skill ID
    if (config.alexa.skillId) {
      const applicationId = alexaRequest.session?.application?.applicationId ||
                           alexaRequest.context?.System?.application?.applicationId;

      if (applicationId !== config.alexa.skillId) {
        logger.warn('⚠️  Skill ID mismatch', {
          expected: config.alexa.skillId,
          received: applicationId,
          ip: req.ip
        });
        return res.status(403).json({
          error: 'Unauthorized skill',
          message: 'This request is for a different skill'
        });
      }
    }

    // All validations passed
    logger.info('✅ Alexa request verified successfully', {
      requestType: alexaRequest.request?.type,
      intentName: alexaRequest.request?.intent?.name,
      sessionId: alexaRequest.session?.sessionId,
      applicationId: alexaRequest.session?.application?.applicationId
    });

    next();
  });
}

module.exports = { verifyAlexaRequest };
