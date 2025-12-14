const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Verify Alexa request (basic verification)
 * For production, use ask-sdk-express-adapter for full signature verification
 */
function verifyAlexaRequest(req, res, next) {
  // Skip verification in development mode
  if (!config.alexa.verifySignature) {
    return next();
  }

  try {
    const requestBody = req.body;

    // Log request type for debugging
    const requestType = requestBody?.request?.type;
    logger.info(`Alexa request type: ${requestType}`);

    // Check if request has required Alexa structure
    // Note: AudioPlayer events don't have session, only request and context
    if (!requestBody || !requestBody.version || (!requestBody.session && !requestBody.context)) {
      logger.warn('Invalid Alexa request structure', {
        hasBody: !!requestBody,
        hasVersion: !!requestBody?.version,
        hasSession: !!requestBody?.session,
        hasContext: !!requestBody?.context
      });
      return res.status(400).json({ error: 'Invalid request' });
    }

    // Verify application ID if configured
    if (config.alexa.skillId) {
      const applicationId = requestBody.session?.application?.applicationId ||
                           requestBody.context?.System?.application?.applicationId;

      if (applicationId !== config.alexa.skillId) {
        logger.warn(`Skill ID mismatch: expected ${config.alexa.skillId}, got ${applicationId}`);
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    // Check timestamp to prevent replay attacks (requests older than 150 seconds)
    const timestamp = requestBody.request?.timestamp;
    if (timestamp) {
      const requestTime = new Date(timestamp).getTime();
      const now = Date.now();
      const timeDifference = Math.abs(now - requestTime);

      if (timeDifference > 150000) { // 150 seconds
        logger.warn(`Request timestamp too old: ${timeDifference}ms`);
        return res.status(400).json({ error: 'Request timestamp too old' });
      }
    }

    next();
  } catch (error) {
    logger.error('Alexa verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  verifyAlexaRequest
};
