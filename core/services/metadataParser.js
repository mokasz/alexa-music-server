const mm = require('music-metadata');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { createSearchableText } = require('../utils/textNormalizer');

/**
 * Extract metadata from MP3 file
 * @param {string} filePath - Absolute path to MP3 file
 * @returns {Promise<Object|null>} Metadata object or null if parsing fails
 */
async function extractMetadata(filePath) {
  try {
    const metadata = await mm.parseFile(filePath);
    const common = metadata.common;
    const format = metadata.format;

    // Extract title from metadata or filename
    const fileName = path.basename(filePath, path.extname(filePath));
    const title = common.title || fileName;

    // Extract artist
    const artist = common.artist || common.albumartist || 'Unknown Artist';

    // Extract album
    const album = common.album || 'Unknown Album';

    // Extract duration in seconds
    const duration = format.duration ? Math.round(format.duration) : 0;

    // Generate unique ID
    const id = uuidv4();

    return {
      id,
      title,
      artist,
      album,
      year: common.year || null,
      genre: common.genre ? common.genre[0] : null,
      duration,
      filePath,
      fileSize: format.size || 0,
      bitrate: format.bitrate || 0,
      sampleRate: format.sampleRate || 0,
      format: format.codec || 'mp3',
      addedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Failed to parse metadata for ${filePath}:`, error.message);

    // Return basic info if metadata parsing fails
    const fileName = path.basename(filePath, path.extname(filePath));
    return {
      id: uuidv4(),
      title: fileName,
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      year: null,
      genre: null,
      duration: 0,
      filePath,
      fileSize: 0,
      bitrate: 0,
      sampleRate: 0,
      format: 'mp3',
      addedAt: new Date().toISOString()
    };
  }
}

module.exports = {
  extractMetadata,
  createSearchableText
};
