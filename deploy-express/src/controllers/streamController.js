const fs = require('fs');
const path = require('path');
const musicLibrary = require('../services/musicLibrary');
const logger = require('../utils/logger');

/**
 * Stream MP3 audio file
 * Supports HTTP Range requests for seeking
 */
async function streamAudio(req, res) {
  try {
    const { trackId } = req.params;

    // Find track in library
    const track = musicLibrary.findById(trackId);

    if (!track) {
      logger.warn(`Track not found: ${trackId}`);
      return res.status(404).json({ error: 'Track not found' });
    }

    const filePath = track.filePath;

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      logger.error(`File not found: ${filePath}`);
      return res.status(404).json({ error: 'File not found' });
    }

    // Get file stats
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    logger.info(`Streaming ${track.title} - ${track.artist} (${trackId})`);

    if (range) {
      // Handle Range request (for seeking in audio)
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).send('Requested range not satisfiable');
        return;
      }

      const file = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600'
      });

      file.pipe(res);

      file.on('error', (error) => {
        logger.error(`Stream error for ${trackId}:`, error.message);
        res.end();
      });
    } else {
      // Full file streaming
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600'
      });

      const file = fs.createReadStream(filePath);
      file.pipe(res);

      file.on('error', (error) => {
        logger.error(`Stream error for ${trackId}:`, error.message);
        res.end();
      });
    }
  } catch (error) {
    logger.error('Stream controller error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get track metadata
 */
function getTrackMetadata(req, res) {
  try {
    const { trackId } = req.params;
    const track = musicLibrary.findById(trackId);

    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    // Return metadata without file path (security)
    const metadata = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      year: track.year,
      genre: track.genre,
      duration: track.duration
    };

    res.json(metadata);
  } catch (error) {
    logger.error('Get metadata error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  streamAudio,
  getTrackMetadata
};
