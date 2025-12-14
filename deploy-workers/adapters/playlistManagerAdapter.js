/**
 * Playlist Manager KV Adapter
 *
 * Implements PlaylistManagerInterface for Cloudflare Workers KV
 * Manages playback sessions with automatic expiration using KV TTL
 */

export class PlaylistManagerKVAdapter {
  /**
   * @param {KVNamespace} kvNamespace - Cloudflare Workers KV namespace binding for sessions
   * @param {number} sessionTTL - Session TTL in seconds (default: 24 hours)
   */
  constructor(kvNamespace, sessionTTL = 86400) {
    this.kv = kvNamespace;
    this.sessionTTL = sessionTTL;
  }

  /**
   * Create a new playlist session
   * @param {string} sessionId - Session/Device ID
   * @param {Array<string>} trackIds - Array of track IDs
   * @param {number} currentIndex - Current track index
   * @returns {Promise<void>}
   */
  async createSession(sessionId, trackIds, currentIndex = 0) {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      throw new Error('Track IDs must be a non-empty array');
    }

    const session = {
      sessionId,
      trackIds,
      currentIndex,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store session in KV with TTL
    await this.kv.put(
      this._getSessionKey(sessionId),
      JSON.stringify(session),
      { expirationTtl: this.sessionTTL }
    );

    console.log(`Created session ${sessionId} with ${trackIds.length} tracks`);
  }

  /**
   * Get playlist session
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<Object|null>} Session object or null
   */
  async getSession(sessionId) {
    if (!sessionId) {
      return null;
    }

    const sessionData = await this.kv.get(this._getSessionKey(sessionId), 'json');

    if (!sessionData) {
      console.log(`Session ${sessionId} not found or expired`);
      return null;
    }

    return sessionData;
  }

  /**
   * Update current track index
   * @param {string} sessionId - Session/Device ID
   * @param {number} index - New track index
   * @returns {Promise<void>}
   */
  async updateCurrentIndex(sessionId, index) {
    const session = await this.getSession(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (index < 0 || index >= session.trackIds.length) {
      throw new Error(`Invalid track index: ${index}`);
    }

    session.currentIndex = index;
    session.updatedAt = new Date().toISOString();

    // Update session in KV (refresh TTL)
    await this.kv.put(
      this._getSessionKey(sessionId),
      JSON.stringify(session),
      { expirationTtl: this.sessionTTL }
    );

    console.log(`Updated session ${sessionId} index to ${index}`);
  }

  /**
   * Get next track ID
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<string|null>} Next track ID or null
   */
  async getNextTrack(sessionId) {
    const session = await this.getSession(sessionId);

    if (!session) {
      return null;
    }

    const nextIndex = session.currentIndex + 1;

    if (nextIndex >= session.trackIds.length) {
      console.log(`No next track for session ${sessionId} (end of playlist)`);
      return null;
    }

    // Update index
    await this.updateCurrentIndex(sessionId, nextIndex);

    return session.trackIds[nextIndex];
  }

  /**
   * Get previous track ID
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<string|null>} Previous track ID or null
   */
  async getPreviousTrack(sessionId) {
    const session = await this.getSession(sessionId);

    if (!session) {
      return null;
    }

    const prevIndex = session.currentIndex - 1;

    if (prevIndex < 0) {
      console.log(`No previous track for session ${sessionId} (start of playlist)`);
      return null;
    }

    // Update index
    await this.updateCurrentIndex(sessionId, prevIndex);

    return session.trackIds[prevIndex];
  }

  /**
   * Get current track ID
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<string|null>} Current track ID or null
   */
  async getCurrentTrack(sessionId) {
    const session = await this.getSession(sessionId);

    if (!session) {
      return null;
    }

    return session.trackIds[session.currentIndex] || null;
  }

  /**
   * Delete session
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<void>}
   */
  async deleteSession(sessionId) {
    await this.kv.delete(this._getSessionKey(sessionId));
    console.log(`Deleted session ${sessionId}`);
  }

  /**
   * Get all session IDs (for debugging/admin purposes)
   * Note: KV list operations have limits, use cautiously in production
   * @returns {Promise<Array<string>>} Array of session IDs
   */
  async getAllSessionIds() {
    const list = await this.kv.list({ prefix: 'session:' });
    return list.keys.map(key => key.name.replace('session:', ''));
  }

  /**
   * Check if session exists
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<boolean>} True if session exists
   */
  async hasSession(sessionId) {
    const session = await this.getSession(sessionId);
    return session !== null;
  }

  /**
   * Get session key for KV storage
   * @private
   * @param {string} sessionId - Session ID
   * @returns {string} KV key
   */
  _getSessionKey(sessionId) {
    return `session:${sessionId}`;
  }

  /**
   * Set custom session TTL
   * @param {number} ttl - TTL in seconds
   */
  setSessionTTL(ttl) {
    this.sessionTTL = ttl;
  }

  /**
   * Get current session TTL
   * @returns {number} TTL in seconds
   */
  getSessionTTL() {
    return this.sessionTTL;
  }
}

export default PlaylistManagerKVAdapter;
