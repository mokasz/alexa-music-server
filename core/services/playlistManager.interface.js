/**
 * Playlist Manager Interface
 * Abstract interface for playlist/session management implementations
 */
class PlaylistManagerInterface {
  /**
   * Create a new playlist session
   * @param {string} sessionId - Session/Device ID
   * @param {Array<string>} trackIds - Array of track IDs
   * @param {number} currentIndex - Current track index
   * @returns {Promise<void>|void}
   */
  async createSession(sessionId, trackIds, currentIndex = 0) {
    throw new Error('Method not implemented: createSession');
  }

  /**
   * Get playlist session
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<Object|null>} Session object or null
   */
  async getSession(sessionId) {
    throw new Error('Method not implemented: getSession');
  }

  /**
   * Update current track index
   * @param {string} sessionId - Session/Device ID
   * @param {number} index - New track index
   * @returns {Promise<void>|void}
   */
  async updateCurrentIndex(sessionId, index) {
    throw new Error('Method not implemented: updateCurrentIndex');
  }

  /**
   * Get next track ID
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<string|null>} Next track ID or null
   */
  async getNextTrack(sessionId) {
    throw new Error('Method not implemented: getNextTrack');
  }

  /**
   * Get previous track ID
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<string|null>} Previous track ID or null
   */
  async getPreviousTrack(sessionId) {
    throw new Error('Method not implemented: getPreviousTrack');
  }

  /**
   * Delete session
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<void>|void}
   */
  async deleteSession(sessionId) {
    throw new Error('Method not implemented: deleteSession');
  }
}

module.exports = PlaylistManagerInterface;
