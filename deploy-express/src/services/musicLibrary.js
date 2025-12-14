const fs = require('fs').promises;
const path = require('path');
const NodeCache = require('node-cache');
const config = require('../config/config');
const logger = require('../utils/logger');
const { scanDirectory, checkDirectoryAccess } = require('../utils/fileScanner');
const { extractMetadata, createSearchableText } = require('@alexa-music/core/services/metadataParser');
const { normalizeString } = require('@alexa-music/core/utils/textNormalizer');

class MusicLibrary {
  constructor() {
    this.tracks = [];
    this.cache = new NodeCache({
      stdTTL: config.cache.ttl,
      checkperiod: config.cache.checkperiod
    });
    this.databasePath = path.resolve(config.music.databasePath);
    this.isLoaded = false;
  }

  /**
   * Initialize the music library
   */
  async initialize() {
    try {
      // Check if music directory exists
      const dirExists = await checkDirectoryAccess(config.music.directory);
      if (!dirExists) {
        throw new Error(`Music directory not found or not accessible: ${config.music.directory}`);
      }

      // Load existing database if available
      await this.loadDatabase();

      // Scan on startup if configured
      if (config.music.scanOnStartup && this.tracks.length === 0) {
        logger.info('No music library found. Scanning directory...');
        await this.scanMusicDirectory();
      }

      this.isLoaded = true;
      logger.info(`Music library initialized with ${this.tracks.length} tracks`);
    } catch (error) {
      logger.error('Failed to initialize music library:', error.message);
      throw error;
    }
  }

  /**
   * Scan music directory and extract metadata
   */
  async scanMusicDirectory() {
    try {
      logger.info(`Scanning music directory: ${config.music.directory}`);

      const files = await scanDirectory(
        config.music.directory,
        config.music.supportedFormats,
        (filePath, count) => {
          if (count % 10 === 0) {
            logger.info(`Found ${count} music files...`);
          }
        }
      );

      logger.info(`Found ${files.length} music files. Extracting metadata...`);

      const tracks = [];
      for (let i = 0; i < files.length; i++) {
        const filePath = files[i];

        try {
          const metadata = await extractMetadata(filePath);
          if (metadata) {
            // Add searchable text
            metadata.searchableText = createSearchableText(metadata);
            tracks.push(metadata);
          }

          if ((i + 1) % 10 === 0) {
            logger.info(`Processed ${i + 1}/${files.length} files...`);
          }
        } catch (error) {
          logger.error(`Failed to process ${filePath}:`, error.message);
        }
      }

      this.tracks = tracks;
      await this.saveDatabase();

      logger.info(`Successfully scanned ${tracks.length} tracks`);
      return tracks.length;
    } catch (error) {
      logger.error('Failed to scan music directory:', error.message);
      throw error;
    }
  }

  /**
   * Load database from JSON file
   */
  async loadDatabase() {
    try {
      const data = await fs.readFile(this.databasePath, 'utf8');
      const db = JSON.parse(data);

      this.tracks = db.tracks || [];
      logger.info(`Loaded ${this.tracks.length} tracks from database`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('No existing database found. Will create new one after scanning.');
        this.tracks = [];
      } else {
        logger.error('Failed to load database:', error.message);
        this.tracks = [];
      }
    }
  }

  /**
   * Save database to JSON file
   */
  async saveDatabase() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.databasePath);
      await fs.mkdir(dataDir, { recursive: true });

      const db = {
        tracks: this.tracks,
        lastScan: new Date().toISOString(),
        totalTracks: this.tracks.length
      };

      await fs.writeFile(this.databasePath, JSON.stringify(db, null, 2), 'utf8');
      logger.info(`Saved ${this.tracks.length} tracks to database`);
    } catch (error) {
      logger.error('Failed to save database:', error.message);
      throw error;
    }
  }

  /**
   * Search tracks by query string
   * @param {string} query - Search query
   * @returns {Array} Matching tracks
   */
  searchTracks(query) {
    if (!query || query.trim() === '') {
      return [];
    }

    // Check cache first
    const cacheKey = `search:${normalizeString(query)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const normalizedQuery = normalizeString(query);
    const results = [];

    // Exact matches first
    const exactMatches = this.tracks.filter(track => {
      const titleMatch = normalizeString(track.title) === normalizedQuery;
      const artistMatch = normalizeString(track.artist) === normalizedQuery;
      return titleMatch || artistMatch;
    });

    // Partial matches
    const partialMatches = this.tracks.filter(track => {
      if (exactMatches.includes(track)) return false;

      const searchableText = track.searchableText || createSearchableText(track);
      return searchableText.includes(normalizedQuery);
    });

    results.push(...exactMatches, ...partialMatches);

    // Cache results
    this.cache.set(cacheKey, results);

    return results.slice(0, 20); // Limit to 20 results
  }

  /**
   * Find track by ID
   * @param {string} trackId - Track ID
   * @returns {Object|null} Track object or null
   */
  findById(trackId) {
    return this.tracks.find(track => track.id === trackId) || null;
  }

  /**
   * Get all tracks
   * @returns {Array} All tracks
   */
  getAllTracks() {
    return this.tracks;
  }

  /**
   * Get random tracks
   * @param {number} count - Number of tracks to return
   * @returns {Array} Random tracks
   */
  getRandomTracks(count = 10) {
    const shuffled = [...this.tracks].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  /**
   * Get library statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const totalDuration = this.tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
    const totalSize = this.tracks.reduce((sum, track) => sum + (track.fileSize || 0), 0);

    const artists = new Set(this.tracks.map(t => t.artist));
    const albums = new Set(this.tracks.map(t => t.album));

    return {
      totalTracks: this.tracks.length,
      totalDuration: Math.round(totalDuration),
      totalSize,
      uniqueArtists: artists.size,
      uniqueAlbums: albums.size,
      averageDuration: this.tracks.length > 0 ? Math.round(totalDuration / this.tracks.length) : 0
    };
  }
}

// Export singleton instance
module.exports = new MusicLibrary();
