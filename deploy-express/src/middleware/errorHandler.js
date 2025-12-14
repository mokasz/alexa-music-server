const logger = require('../utils/logger');

/**
 * Express error handling middleware
 */
function errorHandler(err, req, res, next) {
  // Log the error
  logger.error('Express error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Default error
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
    message = 'Not Found';
  }

  // Don't expose internal errors in production
  if (statusCode === 500 && process.env.NODE_ENV === 'production') {
    message = 'Internal Server Error';
  }

  res.status(statusCode).json({
    error: {
      message,
      status: statusCode
    }
  });
}

/**
 * 404 handler
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: {
      message: 'Not Found',
      status: 404,
      path: req.path
    }
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
