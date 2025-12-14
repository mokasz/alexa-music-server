const logger = require('../utils/logger');

/**
 * Playlist Manager - Manages playback queues for different sessions
 */
class PlaylistManager {
  constructor() {
    // Store session data: sessionId -> {queue, currentIndex, etc}
    this.sessions = new Map();
  }

  /**
   * Create or update a session with a playlist
   * @param {string} sessionId - Alexa session ID
   * @param {Array} trackIds - Array of track IDs
   * @param {number} startIndex - Starting index (default 0)
   */
  createSession(sessionId, trackIds, startIndex = 0) {
    if (!trackIds || trackIds.length === 0) {
      throw new Error('Track IDs array cannot be empty');
    }

    this.sessions.set(sessionId, {
      queue: [...trackIds],
      currentIndex: startIndex,
      shuffle: false,
      repeat: false,
      createdAt: Date.now()
    });

    logger.info(`Created session ${sessionId} with ${trackIds.length} tracks`);
  }

  /**
   * Get current track ID for a session
   * @param {string} sessionId
   * @returns {string|null} Current track ID
   */
  getCurrentTrack(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return session.queue[session.currentIndex] || null;
  }

  /**
   * Move to next track
   * @param {string} sessionId
   * @returns {string|null} Next track ID
   */
  nextTrack(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (session.currentIndex < session.queue.length - 1) {
      session.currentIndex++;
      return session.queue[session.currentIndex];
    } else if (session.repeat) {
      // If repeat is enabled, go back to start
      session.currentIndex = 0;
      return session.queue[session.currentIndex];
    }

    return null; // End of queue
  }

  /**
   * Move to previous track
   * @param {string} sessionId
   * @returns {string|null} Previous track ID
   */
  previousTrack(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (session.currentIndex > 0) {
      session.currentIndex--;
      return session.queue[session.currentIndex];
    } else if (session.repeat) {
      // If repeat is enabled, go to end
      session.currentIndex = session.queue.length - 1;
      return session.queue[session.currentIndex];
    }

    return null; // Already at start
  }

  /**
   * Get the entire queue for a session
   * @param {string} sessionId
   * @returns {Array|null} Queue of track IDs
   */
  getQueue(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? session.queue : null;
  }

  /**
   * Check if there's a next track
   * @param {string} sessionId
   * @returns {boolean}
   */
  hasNextTrack(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    return session.currentIndex < session.queue.length - 1 || session.repeat;
  }

  /**
   * Check if there's a previous track
   * @param {string} sessionId
   * @returns {boolean}
   */
  hasPreviousTrack(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    return session.currentIndex > 0 || session.repeat;
  }

  /**
   * Enable/disable shuffle mode
   * @param {string} sessionId
   * @param {boolean} enabled
   */
  setShuffle(sessionId, enabled) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.shuffle = enabled;

    if (enabled) {
      // Shuffle the remaining queue
      const currentTrack = session.queue[session.currentIndex];
      const remaining = session.queue.slice(session.currentIndex + 1);

      // Fisher-Yates shuffle
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }

      session.queue = [
        ...session.queue.slice(0, session.currentIndex + 1),
        ...remaining
      ];
    }

    logger.info(`Shuffle ${enabled ? 'enabled' : 'disabled'} for session ${sessionId}`);
  }

  /**
   * Enable/disable repeat mode
   * @param {string} sessionId
   * @param {boolean} enabled
   */
  setRepeat(sessionId, enabled) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.repeat = enabled;
    logger.info(`Repeat ${enabled ? 'enabled' : 'disabled'} for session ${sessionId}`);
  }

  /**
   * Get session info
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getSessionInfo(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      queueLength: session.queue.length,
      currentIndex: session.currentIndex,
      shuffle: session.shuffle,
      repeat: session.repeat,
      hasNext: this.hasNextTrack(sessionId),
      hasPrevious: this.hasPreviousTrack(sessionId)
    };
  }

  /**
   * Delete a session
   * @param {string} sessionId
   */
  deleteSession(sessionId) {
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      logger.info(`Deleted session ${sessionId}`);
    }
  }

  /**
   * Clean up old sessions (older than 1 hour)
   */
  cleanupOldSessions() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    let deletedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.createdAt < oneHourAgo) {
        this.sessions.delete(sessionId);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} old sessions`);
    }
  }
}

// Export singleton instance
const playlistManager = new PlaylistManager();

// Clean up old sessions every 30 minutes
setInterval(() => {
  playlistManager.cleanupOldSessions();
}, 30 * 60 * 1000);

module.exports = playlistManager;
