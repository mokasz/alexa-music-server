/**
 * Playlist Manager Durable Object Adapter
 *
 * Implements PlaylistManagerInterface using Cloudflare Durable Objects
 * Provides automatic position tracking with 30-second interval using Alarms
 */

export class PlaylistManagerDurableAdapter {
  /**
   * @param {DurableObjectNamespace} durableObjectNamespace - Durable Object namespace binding
   * @param {KVNamespace} kvNamespace - KV namespace for backup (optional)
   */
  constructor(durableObjectNamespace, kvNamespace = null) {
    this.namespace = durableObjectNamespace;
    this.kv = kvNamespace;
  }

  /**
   * Get Durable Object stub for a session
   * @private
   * @param {string} sessionId - Session/Device ID
   * @returns {DurableObjectStub} Durable Object stub
   */
  _getStub(sessionId) {
    // Generate consistent ID from sessionId
    const id = this.namespace.idFromName(sessionId);
    return this.namespace.get(id);
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

    const stub = this._getStub(sessionId);

    const response = await stub.fetch('https://fake-host/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, trackIds, currentIndex })
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`);
    }

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

    try {
      const stub = this._getStub(sessionId);

      const response = await stub.fetch('https://fake-host/session', {
        method: 'GET'
      });

      if (!response.ok) {
        console.log(`Session ${sessionId} not found or error`);
        return null;
      }

      const session = await response.json();

      // Check if session is actually initialized
      if (!session.sessionId) {
        return null;
      }

      return session;

    } catch (error) {
      console.error(`Error getting session ${sessionId}:`, error.message);
      return null;
    }
  }

  /**
   * Update current track index
   * @param {string} sessionId - Session/Device ID
   * @param {number} index - New track index
   * @returns {Promise<void>}
   */
  async updateCurrentIndex(sessionId, index) {
    const stub = this._getStub(sessionId);

    const response = await stub.fetch('https://fake-host/update-index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index })
    });

    if (!response.ok) {
      throw new Error(`Failed to update index: ${response.statusText}`);
    }
  }

  /**
   * Get current track ID
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<string|null>} Track ID or null
   */
  async getCurrentTrack(sessionId) {
    const stub = this._getStub(sessionId);

    const response = await stub.fetch('https://fake-host/current-track', {
      method: 'GET'
    });

    if (!response.ok) {
      return null;
    }

    const { trackId } = await response.json();
    return trackId;
  }

  /**
   * Check if there is a next track
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<boolean>} True if has next track
   */
  async hasNextTrack(sessionId) {
    const stub = this._getStub(sessionId);

    const response = await stub.fetch('https://fake-host/has-next', {
      method: 'GET'
    });

    if (!response.ok) {
      return false;
    }

    const { hasNext } = await response.json();
    return hasNext;
  }

  /**
   * Get next track ID without advancing
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<string|null>} Next track ID or null
   */
  async getNextTrack(sessionId) {
    const stub = this._getStub(sessionId);

    const response = await stub.fetch('https://fake-host/next-track', {
      method: 'GET'
    });

    if (!response.ok) {
      return null;
    }

    const { trackId } = await response.json();
    return trackId;
  }

  /**
   * Move to next track
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<string|null>} Next track ID or null
   */
  async nextTrack(sessionId) {
    const stub = this._getStub(sessionId);

    const response = await stub.fetch('https://fake-host/next', {
      method: 'POST'
    });

    if (!response.ok) {
      return null;
    }

    const { trackId } = await response.json();
    return trackId;
  }

  /**
   * Move to previous track
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<string|null>} Previous track ID or null
   */
  async previousTrack(sessionId) {
    const stub = this._getStub(sessionId);

    const response = await stub.fetch('https://fake-host/previous', {
      method: 'POST'
    });

    if (!response.ok) {
      return null;
    }

    const { trackId } = await response.json();
    return trackId;
  }

  /**
   * Update playback position and state
   * @param {string} sessionId - Session/Device ID
   * @param {number} offsetInMilliseconds - Playback position in milliseconds
   * @param {string} playbackState - Current state (PLAYING, PAUSED, STOPPED, IDLE)
   * @returns {Promise<void>}
   */
  async updatePlaybackPosition(sessionId, offsetInMilliseconds, playbackState) {
    const stub = this._getStub(sessionId);

    const response = await stub.fetch('https://fake-host/update-position', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offsetInMilliseconds, playbackState })
    });

    if (!response.ok) {
      console.warn(`Failed to update position for ${sessionId}: ${response.statusText}`);
    }

    console.log(`Updated position for ${sessionId}: ${offsetInMilliseconds}ms (${playbackState})`);
  }

  /**
   * Get playback position
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<Object>} Object with offsetInMilliseconds and playbackState
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
   * @param {string} state - Playback state
   * @returns {Promise<void>}
   */
  async setPlaybackState(sessionId, state) {
    const stub = this._getStub(sessionId);

    const response = await stub.fetch('https://fake-host/set-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playbackState: state })
    });

    if (!response.ok) {
      console.warn(`Failed to set state for ${sessionId}: ${response.statusText}`);
    }
  }

  /**
   * Reset retry count
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<void>}
   */
  async resetRetryCount(sessionId) {
    const stub = this._getStub(sessionId);

    const response = await stub.fetch('https://fake-host/reset-retry', {
      method: 'POST'
    });

    if (!response.ok) {
      console.warn(`Failed to reset retry count for ${sessionId}: ${response.statusText}`);
    }
  }

  /**
   * Increment retry count
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<void>}
   */
  async incrementRetryCount(sessionId) {
    const stub = this._getStub(sessionId);

    const response = await stub.fetch('https://fake-host/increment-retry', {
      method: 'POST'
    });

    if (!response.ok) {
      console.warn(`Failed to increment retry count for ${sessionId}: ${response.statusText}`);
    }
  }

  /**
   * Record error
   * @param {string} sessionId - Session/Device ID
   * @param {Object} error - Error object
   * @returns {Promise<void>}
   */
  async recordError(sessionId, error) {
    const stub = this._getStub(sessionId);

    const response = await stub.fetch('https://fake-host/record-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(error)
    });

    if (!response.ok) {
      console.warn(`Failed to record error for ${sessionId}: ${response.statusText}`);
    }
  }

  /**
   * Record playback start (triggers 30-second alarm)
   * @param {string} sessionId - Session/Device ID
   * @param {number} offsetInMilliseconds - Starting position
   * @returns {Promise<void>}
   */
  async recordPlaybackStart(sessionId, offsetInMilliseconds) {
    const stub = this._getStub(sessionId);

    const response = await stub.fetch('https://fake-host/record-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offsetInMilliseconds })
    });

    if (!response.ok) {
      console.warn(`Failed to record playback start for ${sessionId}: ${response.statusText}`);
    }

    console.log(`Recorded playback start: ${offsetInMilliseconds}ms at ${new Date().toISOString()} (session: ${sessionId})`);
  }

  /**
   * Estimate current playback position
   * @param {string} sessionId - Session/Device ID
   * @returns {Promise<number>} Estimated position in milliseconds
   */
  async estimatePlaybackPosition(sessionId) {
    const stub = this._getStub(sessionId);

    const response = await stub.fetch('https://fake-host/estimate-position', {
      method: 'GET'
    });

    if (!response.ok) {
      console.warn(`Failed to estimate position for ${sessionId}: ${response.statusText}`);
      return 0;
    }

    const { offsetInMilliseconds } = await response.json();

    console.log(`Estimated position for ${sessionId}: ${offsetInMilliseconds}ms`);

    return offsetInMilliseconds;
  }
}
