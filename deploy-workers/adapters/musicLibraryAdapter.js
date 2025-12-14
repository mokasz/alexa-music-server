/**
 * Music Library KV Adapter
 *
 * Implements MusicLibraryInterface for Cloudflare Workers KV
 * Provides read-only access to music library data stored in Workers KV
 */

import { normalizeString } from '@alexa-music/core/utils/textNormalizer';

export class MusicLibraryKVAdapter {
  /**
   * @param {KVNamespace} kvNamespace - Cloudflare Workers KV namespace binding
   */
  constructor(kvNamespace) {
    this.kv = kvNamespace;
    this.library = null;
    this.isLoaded = false;
  }

  /**
   * Initialize the music library from KV
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Load music library from KV
      const libraryData = await this.kv.get('music-library', 'json');

      if (!libraryData) {
        throw new Error('Music library not found in KV. Please run sync-music script.');
      }

      this.library = libraryData;
      this.isLoaded = true;

      console.log(`Music library loaded: ${this.library.tracks?.length || 0} tracks`);
    } catch (error) {
      console.error('Failed to initialize music library:', error);
      throw error;
    }
  }

  /**
   * Search for tracks by query
   * Uses normalized text search for Japanese text support
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of matching tracks
   */
  async searchTracks(query) {
    if (!this.isLoaded) {
      await this.initialize();
    }

    if (!query || typeof query !== 'string') {
      return [];
    }

    const normalizedQuery = normalizeString(query.toLowerCase());
    const tracks = this.library.tracks || [];

    // Search in searchableText field (pre-normalized)
    const results = tracks.filter(track => {
      const searchableText = track.searchableText || '';
      return searchableText.includes(normalizedQuery);
    });

    // Sort by relevance (title matches first, then artist, then album)
    results.sort((a, b) => {
      const aTitle = normalizeString((a.title || '').toLowerCase());
      const bTitle = normalizeString((b.title || '').toLowerCase());

      const aTitleMatch = aTitle.includes(normalizedQuery);
      const bTitleMatch = bTitle.includes(normalizedQuery);

      if (aTitleMatch && !bTitleMatch) return -1;
      if (!aTitleMatch && bTitleMatch) return 1;

      return 0;
    });

    return results;
  }

  /**
   * Find track by ID
   * @param {string} trackId - Track ID
   * @returns {Promise<Object|null>} Track object or null if not found
   */
  async findById(trackId) {
    if (!this.isLoaded) {
      await this.initialize();
    }

    const tracks = this.library.tracks || [];
    return tracks.find(track => track.id === trackId) || null;
  }

  /**
   * Get library statistics
   * @returns {Object} Library statistics
   */
  getStats() {
    if (!this.isLoaded) {
      return {
        totalTracks: 0,
        uniqueArtists: 0,
        uniqueAlbums: 0,
        totalDuration: 0,
        totalSize: 0,
        averageDuration: 0
      };
    }

    const tracks = this.library.tracks || [];

    const artists = new Set();
    const albums = new Set();
    let totalDuration = 0;
    let totalSize = 0;

    tracks.forEach(track => {
      if (track.artist) artists.add(track.artist);
      if (track.album) albums.add(track.album);
      if (track.duration) totalDuration += track.duration;
      if (track.fileSize) totalSize += track.fileSize;
    });

    return {
      totalTracks: tracks.length,
      uniqueArtists: artists.size,
      uniqueAlbums: albums.size,
      totalDuration: Math.round(totalDuration),
      totalSize: totalSize,
      averageDuration: tracks.length > 0 ? Math.round(totalDuration / tracks.length) : 0
    };
  }

  /**
   * Get all tracks
   * @returns {Array} All tracks
   */
  getAllTracks() {
    if (!this.isLoaded) {
      return [];
    }

    return this.library.tracks || [];
  }

  /**
   * Get library metadata
   * @returns {Object} Library metadata (last updated, version, etc.)
   */
  getMetadata() {
    if (!this.isLoaded) {
      return null;
    }

    return this.library.metadata || {};
  }

  /**
   * Refresh library data from KV
   * Useful for updating cache after KV changes
   * @returns {Promise<void>}
   */
  async refresh() {
    this.isLoaded = false;
    await this.initialize();
  }

  /**
   * Check if library is loaded
   * @returns {boolean}
   */
  isReady() {
    return this.isLoaded;
  }
}

export default MusicLibraryKVAdapter;
