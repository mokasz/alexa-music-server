/**
 * Music Library Interface
 * Abstract interface for music library implementations
 */
class MusicLibraryInterface {
  /**
   * Initialize the music library
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('Method not implemented: initialize');
  }

  /**
   * Search for tracks by query
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of matching tracks
   */
  async searchTracks(query) {
    throw new Error('Method not implemented: searchTracks');
  }

  /**
   * Find track by ID
   * @param {string} trackId - Track ID
   * @returns {Promise<Object|null>} Track object or null if not found
   */
  async findById(trackId) {
    throw new Error('Method not implemented: findById');
  }

  /**
   * Get library statistics
   * @returns {Promise<Object>|Object} Library statistics
   */
  getStats() {
    throw new Error('Method not implemented: getStats');
  }

  /**
   * Get all tracks
   * @returns {Promise<Array>|Array} All tracks
   */
  getAllTracks() {
    throw new Error('Method not implemented: getAllTracks');
  }
}

module.exports = MusicLibraryInterface;
