# クイックスタート - 次回再開時用ガイド

**最終更新**: 2025-12-15

## 📋 現在の状態

### ✅ 実装完了済み

1. **Express + Cloudflare Tunnel** - 現行システム（稼働中）
2. **Cloudflare Workers** - 新システム（稼働中）
3. **Durable Objects** - 30秒間隔の自動位置記録（**最新実装**）

### 🚀 デプロイ済みURL

- **Workers**: https://alexa-music-workers.swiftzhu.workers.dev
- **Alexa Skill Endpoint**: https://alexa-music.moerin.com/alexa（Express版使用中）

---

## 🔄 次回作業再開時の手順

### 1. 現在の動作確認

```bash
# Workers が稼働中か確認
curl https://alexa-music-workers.swiftzhu.workers.dev/health

# ログ監視（別ターミナル）
cd /Users/shiwei.zhu/Claude/alexa-music-server/deploy-workers
npm run tail
```

### 2. Echo実機でテスト

```
「アレクサ、モカモカを開いて」
「江戸時代初期を再生」
```

**ログで確認すべきこと:**
- `[Alarm] Scheduled` - 30秒後にalarmがスケジュールされた
- 30秒後: `[Alarm] Triggered` - alarmが発火
- `[Alarm] Updated position` - 位置が更新された
- `[Alarm] Next alarm scheduled` - 次のalarmがスケジュールされた

### 3. 異常終了テスト（必要に応じて）

1. 再生中にEchoの電源を切る
2. 30秒以上待つ
3. Echoを再起動
4. 「アレクサ、再開」
5. **期待結果**: 最後のalarm位置（最大30秒の誤差）から再生

---

## 📁 重要なファイル

### ドキュメント

- **STATUS.md** - プロジェクト全体のステータス（最も重要）
- **CLAUDE.md** - Claude Code向けのプロジェクトガイド
- **deploy-workers/README.md** - Workers実装の詳細
- **プランファイル**: `/Users/shiwei.zhu/.claude/plans/adaptive-questing-rivest.md`

### 実装ファイル（Durable Objects）

**新規作成:**
- `deploy-workers/src/SessionDurableObject.js` - Durable Objectクラス（alarm機能）
- `deploy-workers/adapters/playlistManagerDurableAdapter.js` - アダプター

**変更ファイル:**
- `deploy-workers/wrangler.toml` - Durable Objects設定
- `deploy-workers/src/index.js` - バインディング使用
- `deploy-workers/src/alexaHandlers.js` - ResumeIntent改善

---

## 🛠️ よく使うコマンド

### Workers開発

```bash
cd /Users/shiwei.zhu/Claude/alexa-music-server/deploy-workers

# ローカル開発
npm run dev

# デプロイ
npm run deploy

# ログ監視
npm run tail

# KV確認
npx wrangler kv:key list --namespace-id=29af5a6de5be45c188828a14d84cad6d
npx wrangler kv:key get --namespace-id=29af5a6de5be45c188828a14d84cad6d "music-library"
```

### Express開発（現行システム）

```bash
cd /Users/shiwei.zhu/Claude/alexa-music-server

# サーバー起動
npm start

# 音楽スキャン
npm run scan

# Tunnel起動
cloudflared tunnel run alexa-music-tunnel
```

---

## 🔍 トラブルシューティング

### Alarmが発火しない

**確認事項:**
1. デプロイが成功しているか: `npm run deploy`
2. wrangler.tomlにDurable Objects設定があるか
3. ログで `[Alarm] Scheduled` が表示されているか

**対処:**
```bash
# 再デプロイ
cd deploy-workers
npm run deploy

# ログ確認
npm run tail
```

### KV Write制限超過

**症状:** `Error: KV write limit exceeded (1000/day)`

**原因:** 30秒ごとのalarmで2,880回/日のKV write（1セッション）

**対処:**
1. KV writeを減らす（Durable Object storageのみ使用）
2. 有料プラン検討（$5/月）

**コード変更箇所:**
`deploy-workers/src/SessionDurableObject.js` の `alarm()` メソッド内:
```javascript
// KV backupをコメントアウト
// if (this.env.SESSIONS) {
//   await this.env.SESSIONS.put(...);
// }
```

---

## 📊 アーキテクチャ概要

```
┌─────────────┐
│ Amazon Echo │
└──────┬──────┘
       │ Voice Command: "アレクサ、モカモカを開いて"
       ↓
┌────────────────┐
│ Alexa Service  │
└────────┬───────┘
         │ POST /alexa (JSON)
         ↓
┌─────────────────────┐
│ Cloudflare Workers  │
│ (Global CDN)        │
└──────┬──────────────┘
       │
       ├─→ Music Library KV (音楽メタデータ)
       │
       ├─→ Durable Object (SessionDurableObject)
       │   │
       │   ├─→ 30秒ごとのAlarm
       │   ├─→ 位置推定 & 保存
       │   └─→ Durable Object Storage + KV backup
       │
       └─→ Google Drive (MP3ストリーミング)
```

---

## 🎯 次の改善案（オプション）

### 1. Alexaスキルエンドポイント変更

現在: Express版（`https://alexa-music.moerin.com/alexa`）
→ Workers版（`https://alexa-music-workers.swiftzhu.workers.dev/alexa`）に変更

**手順:**
1. Amazon Developer Console → スキル「モカモカ」
2. ビルド → エンドポイント
3. HTTPSエンドポイントを変更
4. Expressサーバー・Tunnel停止

### 2. KV Write最適化

Durable Object storageのみ使用し、KV backupを削除してwrite回数削減

### 3. Alarm間隔の調整

現在30秒 → 必要に応じて15秒または60秒に変更可能

**変更箇所:**
`deploy-workers/src/SessionDurableObject.js`:
```javascript
// Line 215, 230
await this.state.storage.setAlarm(Date.now() + 30000); // 30秒
```

---

## 📞 サポート情報

**プロジェクトディレクトリ:**
```
/Users/shiwei.zhu/Claude/alexa-music-server/
├── deploy-express/     # Express版（現行システム）
├── deploy-workers/     # Workers版（Durable Objects実装済み）
├── STATUS.md           # 📋 プロジェクトステータス（必読）
├── CLAUDE.md           # Claude Code向けガイド
└── QUICKSTART.md       # このファイル
```

**ログファイル:**
- Express: `/Users/shiwei.zhu/Claude/alexa-music-server/logs/app.log`
- Workers: `npm run tail`（リアルタイム）

**設定ファイル:**
- `.env` - Express環境変数
- `wrangler.toml` - Workers設定
- `~/.cloudflared/config.yml` - Tunnel設定

---

**作成日**: 2025-12-15
**最終テスト**: 2025-12-15（デプロイ成功）
**次回テスト推奨**: Echo実機での異常終了テスト
