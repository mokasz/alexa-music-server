require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config/config');
const logger = require('./utils/logger');
const musicLibrary = require('./services/musicLibrary');
const playlistManager = require('./services/playlistManager');         // ⭐ 新規追加
const positionTracker = require('./services/positionTracker');         // ⭐ 新規追加
const { handleAlexaRequest } = require('./controllers/alexaController');
const { streamAudio, getTrackMetadata } = require('./controllers/streamController');
const { verifyAlexaRequest } = require('./middleware/alexaVerification');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable for audio streaming
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  const stats = musicLibrary.getStats();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.server.env,
    musicLibrary: {
      loaded: musicLibrary.isLoaded,
      totalTracks: stats.totalTracks
    }
  });
});

// Music library info endpoint
app.get('/library/info', (req, res) => {
  try {
    const stats = musicLibrary.getStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error getting library info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search endpoint (for testing)
app.get('/search', (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const results = musicLibrary.searchTracks(q);
    res.json({
      query: q,
      count: results.length,
      results: results.slice(0, 10).map(track => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration
      }))
    });
  } catch (error) {
    logger.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Track metadata endpoint
app.get('/track/:trackId', getTrackMetadata);

// Audio streaming endpoint
app.get('/stream/:trackId', streamAudio);

// Alexa skill endpoint (with verification)
app.post('/alexa', verifyAlexaRequest, handleAlexaRequest);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Initialize and start server
async function startServer() {
  try {
    logger.info('Starting Alexa Music Server...');
    logger.info(`Environment: ${config.server.env}`);
    logger.info(`Music Directory: ${config.music.directory}`);

    // Initialize music library
    logger.info('Initializing music library...');
    await musicLibrary.initialize();

    // ⭐ Initialize playlist manager (load sessions from storage)
    logger.info('Initializing playlist manager...');
    await playlistManager.initialize();

    // Start Express server
    const server = app.listen(config.server.port, () => {
      logger.info(`Server running on port ${config.server.port}`);
      logger.info(`Public URL: ${config.server.publicUrl}`);
      logger.info('===================================');
      logger.info('Alexa Music Server is ready!');
      logger.info('===================================');
      logger.info('Endpoints:');
      logger.info(`  - Health Check: ${config.server.publicUrl}/health`);
      logger.info(`  - Alexa Skill:  ${config.server.publicUrl}/alexa`);
      logger.info(`  - Streaming:    ${config.server.publicUrl}/stream/:trackId`);
      logger.info('===================================');

      const stats = musicLibrary.getStats();
      if (stats.totalTracks === 0) {
        logger.warn('⚠️  Music library is empty!');
        logger.warn('   Run "npm run scan" to scan your music directory');
      } else {
        logger.info(`📚 Music library loaded: ${stats.totalTracks} tracks`);
        logger.info(`   ${stats.uniqueArtists} artists, ${stats.uniqueAlbums} albums`);
      }
      logger.info('===================================');

      // ⭐ Start position tracker (auto-save every 30s)
      positionTracker.start();
      logger.info('✅ Position tracker started (auto-save every 30s)');
      logger.info('===================================');
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received. Shutting down gracefully...');
      positionTracker.stop();  // ⭐ 停止して最終保存
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received. Shutting down gracefully...');
      positionTracker.stop();  // ⭐ 停止して最終保存
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
