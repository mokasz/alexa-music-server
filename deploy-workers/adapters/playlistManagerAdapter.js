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
  constructor(kvNamespace, sessionTTL = 2592000) { // 30日間（2592000秒）
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
      updatedAt: new Date().toISOString(),

      // 新規: 再生位置追跡
      offsetInMilliseconds: 0,
      playbackState: 'IDLE', // PLAYING, PAUSED, STOPPED, IDLE
      currentToken: trackIds[currentIndex],
      lastPlaybackTimestamp: new Date().toISOString(),

      // 新規: エラーリカバリー
      retryCount: 0,
      lastError: null,

      // 新規: 再生位置推定用（早送り/巻き戻し機能）
      playbackStartedAt: null,  // ISO timestamp when playback started
      playbackStartOffset: 0     // offsetInMilliseconds when playback started
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

  /**
   * Update playback position and state
   * @param {string} sessionId - Session/Device ID
   * @param {number} offsetInMilliseconds - Playback position in milliseconds
   * @param {string} playbackState - Current state (PLAYING, PAUSED, STOPPED, IDLE)
   * @returns {Promise<void>}
   */
  async updatePlaybackPosition(sessionId, offsetInMilliseconds, playbackState) {
    const session = await this.getSession(sessionId);

    if (!session) {
      console.warn(`Cannot update position: session ${sessionId} not found`);
      return;
    }

    session.offsetInMilliseconds = offsetInMilliseconds;
    session.playbackState = playbackState;
    session.lastPlaybackTimestamp = new Date().toISOString();
    session.updatedAt = new Date().toISOString();

    await this._saveSession(session);

    console.log(`Updated position for ${sessionId}: ${offsetInMilliseconds}ms (${playbackState})`);
  }

  /**
   * Get playback position
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<Object>} { offsetInMilliseconds, playbackState }
   */
  async getPlaybackPosition(sessionId) {
    const session = await this.getSession(sessionId);

    if (!session) {
      return { offsetInMilliseconds: 0, playbackState: 'IDLE' };
    }

    return {
      offsetInMilliseconds: session.offsetInMilliseconds || 0,
      playbackState: session.playbackState || 'IDLE'
    };
  }

  /**
   * Set playback state
   * @param {string} sessionId - Session/Device ID
   * @param {string} state - PLAYING, PAUSED, STOPPED, IDLE
   * @returns {Promise<void>}
   */
  async setPlaybackState(sessionId, state) {
    const session = await this.getSession(sessionId);

    if (!session) {
      console.warn(`Cannot set state: session ${sessionId} not found`);
      return;
    }

    session.playbackState = state;
    session.lastPlaybackTimestamp = new Date().toISOString();
    session.updatedAt = new Date().toISOString();

    await this._saveSession(session);
  }

  /**
   * Increment retry count for failed streams
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<void>}
   */
  async incrementRetryCount(sessionId) {
    const session = await this.getSession(sessionId);

    if (!session) {
      return;
    }

    session.retryCount = (session.retryCount || 0) + 1;
    session.updatedAt = new Date().toISOString();

    await this._saveSession(session);
  }

  /**
   * Reset retry count
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<void>}
   */
  async resetRetryCount(sessionId) {
    const session = await this.getSession(sessionId);

    if (!session) {
      return;
    }

    session.retryCount = 0;
    session.lastError = null;
    session.updatedAt = new Date().toISOString();

    await this._saveSession(session);
  }

  /**
   * Record error details
   * @param {string} sessionId - Session/Device ID
   * @param {Object} error - Error details
   * @returns {Promise<void>}
   */
  async recordError(sessionId, error) {
    const session = await this.getSession(sessionId);

    if (!session) {
      return;
    }

    session.lastError = error;
    session.updatedAt = new Date().toISOString();

    await this._saveSession(session);
  }

  /**
   * Check if next track exists
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<boolean>}
   */
  async hasNextTrack(sessionId) {
    const session = await this.getSession(sessionId);

    if (!session) {
      return false;
    }

    return (session.currentIndex + 1) < session.trackIds.length;
  }

  /**
   * Save session to KV (internal helper)
   * @private
   * @param {Object} session - Session object
   * @returns {Promise<void>}
   */
  async _saveSession(session) {
    const putOptions = this.sessionTTL
      ? { expirationTtl: this.sessionTTL }
      : {};

    await this.kv.put(
      this._getSessionKey(session.sessionId),
      JSON.stringify(session),
      putOptions
    );
  }

  /**
   * Record playback start time and offset (for position estimation)
   * Used for fast forward/rewind functionality
   * @param {string} sessionId - Session/Device ID
   * @param {number} offsetInMilliseconds - Starting offset
   * @returns {Promise<void>}
   */
  async recordPlaybackStart(sessionId, offsetInMilliseconds) {
    const session = await this.getSession(sessionId);

    if (!session) {
      console.warn(`Cannot record playback start: session ${sessionId} not found`);
      return;
    }

    session.playbackStartedAt = new Date().toISOString();
    session.playbackStartOffset = offsetInMilliseconds;
    session.updatedAt = new Date().toISOString();

    await this._saveSession(session);

    console.log(`Recorded playback start: ${offsetInMilliseconds}ms at ${session.playbackStartedAt} (session: ${sessionId})`);
  }

  /**
   * Estimate current playback position based on elapsed time
   * Used for fast forward/rewind functionality
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<number>} Estimated position in milliseconds
   */
  async estimatePlaybackPosition(sessionId) {
    const session = await this.getSession(sessionId);

    if (!session) {
      console.warn(`Cannot estimate position: session ${sessionId} not found`);
      return 0;
    }

    // If no playback start time recorded, use saved offset
    if (!session.playbackStartedAt) {
      const savedOffset = session.offsetInMilliseconds || 0;
      console.log(`No playback start time, using saved offset: ${savedOffset}ms`);
      return savedOffset;
    }

    // Calculate elapsed time since playback started
    const startTime = new Date(session.playbackStartedAt).getTime();
    const now = Date.now();
    const elapsed = now - startTime;

    // Estimate position: startOffset + elapsed time
    const estimatedPosition = session.playbackStartOffset + elapsed;

    console.log(`Estimated position: ${estimatedPosition}ms (start: ${session.playbackStartOffset}ms, elapsed: ${elapsed}ms)`);

    // Ensure non-negative
    return Math.max(0, estimatedPosition);
  }
}

export default PlaylistManagerKVAdapter;
