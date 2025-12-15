const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

/**
 * SessionStorage - ファイルベースのセッションデータ永続化
 *
 * 機能:
 * - JSONファイルへのセッションデータの保存と読み込み
 * - デバウンス付き自動保存（500ms）
 * - 複数セッションの管理
 */
class SessionStorage {
  constructor(filePath = null) {
    this.filePath = filePath || path.join(__dirname, '../../../data/playback-sessions.json');
    this.sessions = new Map();
    this.saveTimeout = null;
    this.isLoaded = false;
  }

  /**
   * JSONファイルからセッションデータを読み込み
   */
  async load() {
    try {
      // ファイルが存在するか確認
      try {
        await fs.access(this.filePath);
      } catch (error) {
        // ファイルが存在しない場合は空のデータで初期化
        logger.info(`Session file not found, creating new: ${this.filePath}`);
        await this.save();
        this.isLoaded = true;
        return;
      }

      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data);

      // Mapオブジェクトに変換
      if (parsed.sessions) {
        Object.entries(parsed.sessions).forEach(([id, session]) => {
          this.sessions.set(id, session);
        });
      }

      this.isLoaded = true;
      logger.info(`Loaded ${this.sessions.size} session(s) from ${this.filePath}`);
    } catch (error) {
      logger.error(`Failed to load session file: ${error.message}`);
      // エラーが発生しても空の状態で続行
      this.isLoaded = true;
    }
  }

  /**
   * セッションデータをJSONファイルに保存
   */
  async save() {
    try {
      // ディレクトリが存在しない場合は作成
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      // MapをObjectに変換
      const sessionsObject = Object.fromEntries(this.sessions);

      const data = {
        sessions: sessionsObject,
        lastUpdated: new Date().toISOString()
      };

      // 一時ファイルに書き込んでからrenameする（atomic write）
      const tempPath = `${this.filePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tempPath, this.filePath);

      logger.debug(`Saved ${this.sessions.size} session(s) to ${this.filePath}`);
    } catch (error) {
      logger.error(`Failed to save session file: ${error.message}`);
    }
  }

  /**
   * デバウンス付き自動保存
   * 複数の変更をまとめて保存（500ms後）
   */
  scheduleSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.save();
      this.saveTimeout = null;
    }, 500);
  }

  /**
   * 全セッションを取得
   */
  getSessions() {
    return this.sessions;
  }

  /**
   * 特定のセッションを取得
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * セッションを設定
   */
  setSession(sessionId, sessionData) {
    this.sessions.set(sessionId, sessionData);
    this.scheduleSave();
  }

  /**
   * セッションを削除
   */
  deleteSession(sessionId) {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      this.scheduleSave();
    }
    return deleted;
  }

  /**
   * 全セッションをクリア
   */
  clear() {
    this.sessions.clear();
    this.scheduleSave();
  }

  /**
   * セッション数を取得
   */
  size() {
    return this.sessions.size;
  }

  /**
   * 古いセッションを削除
   * @param {number} maxAgeMs - セッションの最大有効期限（ミリ秒）
   */
  cleanupOldSessions(maxAgeMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    let deletedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - (session.updatedAt || session.createdAt || 0);
      if (age > maxAgeMs) {
        this.sessions.delete(sessionId);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} old session(s)`);
      this.scheduleSave();
    }

    return deletedCount;
  }

  /**
   * 強制的に即座に保存（通常はscheduleSaveを使用）
   */
  async saveNow() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    await this.save();
  }
}

// シングルトンインスタンス
const sessionStorage = new SessionStorage();

module.exports = sessionStorage;
