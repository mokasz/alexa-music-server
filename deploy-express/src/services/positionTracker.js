const logger = require('../utils/logger');
const playlistManager = require('./playlistManager');

/**
 * PositionTracker - 定期的に再生位置を自動保存
 *
 * Workers実装のDurable Objects Alarmsの代替機能
 * 参考: deploy-workers/src/SessionDurableObject.js:169-210
 *
 * 機能:
 * - 30秒間隔でsetIntervalを実行
 * - PLAYINGステートのセッションの位置を推定して保存
 * - Graceful shutdownに対応（stop()メソッド）
 */
class PositionTracker {
  constructor(intervalMs = 30000) {
    this.intervalMs = intervalMs;  // デフォルト30秒
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * 定期記録を開始
   */
  start() {
    if (this.isRunning) {
      logger.warn('PositionTracker is already running');
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.saveAllPositions();
    }, this.intervalMs);

    logger.info(`PositionTracker started (interval: ${this.intervalMs / 1000}s)`);
  }

  /**
   * 定期記録を停止
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    logger.info('PositionTracker stopped');
  }

  /**
   * 全セッションの位置を推定して保存
   */
  async saveAllPositions() {
    try {
      const sessions = playlistManager.sessions;
      let savedCount = 0;

      for (const [sessionId, session] of sessions.entries()) {
        // PLAYINGステートのセッションのみ処理
        if (session.playbackState === 'PLAYING') {
          const estimatedPosition = playlistManager.estimatePlaybackPosition(sessionId);

          // 位置を更新（状態はPLAYINGのまま）
          playlistManager.updatePlaybackPosition(sessionId, estimatedPosition, 'PLAYING');
          savedCount++;

          logger.debug(`[PositionTracker] Auto-saved position for ${sessionId}: ${estimatedPosition}ms`);
        }
      }

      if (savedCount > 0) {
        logger.info(`[PositionTracker] Auto-saved ${savedCount} session(s)`);
      }
    } catch (error) {
      logger.error(`[PositionTracker] Error saving positions: ${error.message}`);
    }
  }

  /**
   * 強制的に即座に全セッションを保存
   */
  async saveNow() {
    logger.info('[PositionTracker] Manual save triggered');
    await this.saveAllPositions();
  }
}

// シングルトンインスタンス
const positionTracker = new PositionTracker();

module.exports = positionTracker;
