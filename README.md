# 🎵 Alexa Music Server - Cloudflare Workers Edition

完全無料で運用できる、自分の音楽・音声コンテンツをAmazon Echoで再生するためのカスタムAlexaスキルです。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)](https://workers.cloudflare.com/)

## ✨ 特徴

- **🎓 自分のコンテンツを再生**: 学習教材、オーディオブック、レア音源など
- **💰 完全無料**: Cloudflare Workers + Google Drive無料枠のみ
- **🌐 サーバー不要**: 自宅PCを24時間稼働させる必要なし
- **⚡ 低レイテンシ**: エッジで動作
- **🔊 日本語対応**: ひらがな・カタカナの検索正規化
- **📱 簡単管理**: Google Driveでファイル管理

## 🎯 ユースケース

- 📚 子供の学習用音声教材（塾の講義録音など）
- 🎵 CDから取り込んだレア音源
- 📖 オーディオブックや語学教材
- 🎙️ 家族の録音やポッドキャスト

「アレクサ、〇〇を開いて」→「△△を再生」

## 🚀 クイックスタート

詳細なセットアップ手順は [SETUP.md](SETUP.md) を参照してください。

```bash
# 1. クローン
git clone https://github.com/yourusername/alexa-music-server.git
cd alexa-music-server

# 2. 依存関係インストール
npm install && cd deploy-workers && npm install

# 3. 設定ファイル作成
cp .env.example .env
cp deploy-workers/wrangler.toml.example deploy-workers/wrangler.toml

# 4. セットアップ（詳細はSETUP.mdを参照）
# - Google Drive API設定
# - Cloudflare Workers KV作成
# - Alexaスキル作成

# 5. デプロイ
cd deploy-workers && npm run deploy
```

## 📖 ドキュメント

| ドキュメント | 説明 |
|------------|------|
| [SETUP.md](SETUP.md) | **詳細なセットアップガイド** |
| [CLAUDE.md](CLAUDE.md) | プロジェクト全体の技術ドキュメント |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | トラブルシューティング |
| [deploy-workers/README-CONVERT.md](deploy-workers/README-CONVERT.md) | M4A→MP3変換 |

## 💰 コスト

**完全無料！**

- ✅ Cloudflare Workers: 100,000 requests/day
- ✅ Workers KV: 100,000 reads/day  
- ✅ Google Drive: 15GB

## 🤝 コントリビューション

プルリクエスト歓迎！[CONTRIBUTING.md](CONTRIBUTING.md) をご確認ください。

## 📝 ライセンス

MIT License - [LICENSE](LICENSE) 参照

---

Made with ❤️ for making Echo play your own content
