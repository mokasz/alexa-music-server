const logger = require('../utils/logger');
const sessionStorage = require('./sessionStorage');

/**
 * Playlist Manager - Manages playback queues for different sessions
 *
 * 拡張機能:
 * - 再生位置トラッキング（offsetInMilliseconds）
 * - 再生状態管理（PLAYING, PAUSED, STOPPED, IDLE）
 * - 位置推定機能（早送り/巻き戻し用）
 * - ファイルベースの永続化（SessionStorage連携）
 */
class PlaylistManager {
  constructor() {
    // Store session data: sessionId -> {queue, currentIndex, etc}
    this.sessions = new Map();
    this.isInitialized = false;
  }

  /**
   * SessionStorageからデータを読み込んで初期化
   */
  async initialize() {
    if (this.isInitialized) return;

    await sessionStorage.load();

    // SessionStorageからセッションデータを復元
    const storedSessions = sessionStorage.getSessions();
    for (const [sessionId, sessionData] of storedSessions.entries()) {
      this.sessions.set(sessionId, sessionData);
    }

    logger.info(`PlaylistManager initialized with ${this.sessions.size} session(s)`);
    this.isInitialized = true;
  }

  /**
   * セッションをSessionStorageに同期
   */
  _syncToStorage(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      sessionStorage.setSession(sessionId, session);
    }
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

    const now = Date.now();

    this.sessions.set(sessionId, {
      queue: [...trackIds],
      currentIndex: startIndex,
      shuffle: false,
      repeat: false,

      // ⭐ 位置情報フィールド（新規追加）
      offsetInMilliseconds: 0,
      playbackState: 'IDLE',  // PLAYING, PAUSED, STOPPED, IDLE
      currentToken: null,
      lastPlaybackTimestamp: now,

      // ⭐ 位置推定用フィールド（新規追加）
      playbackStartedAt: null,
      playbackStartOffset: 0,

      // ⭐ エラーリカバリー（新規追加）
      retryCount: 0,
      lastError: null,

      createdAt: now,
      updatedAt: now
    });

    this._syncToStorage(sessionId);
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
      sessionStorage.deleteSession(sessionId);
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
        sessionStorage.deleteSession(sessionId);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} old sessions`);
    }
  }

  // ========================================
  // ⭐ 新規追加: 位置情報管理メソッド
  // ========================================

  /**
   * セッションを取得
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * 再生位置と状態を更新
   * @param {string} sessionId
   * @param {number} offsetInMilliseconds
   * @param {string} playbackState - PLAYING, PAUSED, STOPPED, IDLE
   */
  updatePlaybackPosition(sessionId, offsetInMilliseconds, playbackState) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`Cannot update playback position: session ${sessionId} not found`);
      return;
    }

    session.offsetInMilliseconds = offsetInMilliseconds;
    session.playbackState = playbackState;
    session.lastPlaybackTimestamp = Date.now();
    session.updatedAt = Date.now();

    this._syncToStorage(sessionId);
    logger.debug(`Updated playback position for ${sessionId}: ${offsetInMilliseconds}ms (${playbackState})`);
  }

  /**
   * 再生開始を記録（位置推定用）
   * @param {string} sessionId
   * @param {number} offsetInMilliseconds
   */
  recordPlaybackStart(sessionId, offsetInMilliseconds) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`Cannot record playback start: session ${sessionId} not found`);
      return;
    }

    session.playbackStartedAt = new Date().toISOString();
    session.playbackStartOffset = offsetInMilliseconds;
    session.offsetInMilliseconds = offsetInMilliseconds;
    session.playbackState = 'PLAYING';
    session.lastPlaybackTimestamp = Date.now();
    session.updatedAt = Date.now();

    this._syncToStorage(sessionId);
    logger.debug(`Recorded playback start for ${sessionId}: ${offsetInMilliseconds}ms`);
  }

  /**
   * 現在の再生位置を推定
   * 参考: deploy-workers/src/SessionDurableObject.js:318-331
   *
   * @param {string} sessionId
   * @returns {number} 推定された再生位置（ミリ秒）
   */
  estimatePlaybackPosition(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return 0;
    }

    // PLAYINGステート以外は保存された位置を返す
    if (session.playbackState !== 'PLAYING') {
      return session.offsetInMilliseconds || 0;
    }

    // 再生開始時刻が記録されていない場合は保存された位置を返す
    if (!session.playbackStartedAt) {
      return session.offsetInMilliseconds || 0;
    }

    // 経過時間から現在位置を推定
    const startTime = new Date(session.playbackStartedAt).getTime();
    const now = Date.now();
    const elapsed = now - startTime;
    const estimatedPosition = session.playbackStartOffset + elapsed;

    // 負の値にならないようガード
    return Math.max(0, estimatedPosition);
  }

  /**
   * 再生状態のみを更新
   * @param {string} sessionId
   * @param {string} state - PLAYING, PAUSED, STOPPED, IDLE
   */
  setPlaybackState(sessionId, state) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`Cannot set playback state: session ${sessionId} not found`);
      return;
    }

    session.playbackState = state;
    session.lastPlaybackTimestamp = Date.now();
    session.updatedAt = Date.now();

    this._syncToStorage(sessionId);
    logger.debug(`Set playback state for ${sessionId}: ${state}`);
  }

  /**
   * リトライカウントをリセット
   * @param {string} sessionId
   */
  resetRetryCount(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.retryCount = 0;
    session.lastError = null;
    session.updatedAt = Date.now();

    this._syncToStorage(sessionId);
  }

  /**
   * リトライカウントを増加
   * @param {string} sessionId
   * @returns {number} 新しいリトライカウント
   */
  incrementRetryCount(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return 0;

    session.retryCount = (session.retryCount || 0) + 1;
    session.updatedAt = Date.now();

    this._syncToStorage(sessionId);
    return session.retryCount;
  }

  /**
   * エラーを記録
   * @param {string} sessionId
   * @param {Object} error
   */
  recordError(sessionId, error) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.lastError = {
      type: error.type || 'UNKNOWN',
      message: error.message || 'Unknown error',
      timestamp: new Date().toISOString()
    };
    session.updatedAt = Date.now();

    this._syncToStorage(sessionId);
    logger.error(`Recorded error for ${sessionId}: ${error.type} - ${error.message}`);
  }

  /**
   * 現在のトークンを設定
   * @param {string} sessionId
   * @param {string} token
   */
  setCurrentToken(sessionId, token) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.currentToken = token;
    session.updatedAt = Date.now();

    this._syncToStorage(sessionId);
  }
}

// Export singleton instance
const playlistManager = new PlaylistManager();

// Clean up old sessions every 30 minutes
setInterval(() => {
  playlistManager.cleanupOldSessions();
}, 30 * 60 * 1000);

module.exports = playlistManager;
