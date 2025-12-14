# 📖 セットアップガイド

このガイドでは、Alexa Music Serverを最初からセットアップする手順を説明します。

## 📋 必要なもの

### アカウント

- [ ] Amazon Developer Account (無料)
- [ ] Cloudflare Account (無料)
- [ ] Google Cloud Platform Account (無料)
- [ ] Google Drive (15GB無料)

### ツール

- [ ] Node.js >= 18.0.0
- [ ] npm or yarn
- [ ] ffmpeg (M4A→MP3変換用)
- [ ] Git

## 🚀 ステップ1: リポジトリのクローン

```bash
git clone https://github.com/yourusername/alexa-music-server.git
cd alexa-music-server
```

## 📦 ステップ2: 依存関係のインストール

```bash
# Rootプロジェクト
npm install

# Express server (ローカルテスト用)
cd deploy-express
npm install

# Cloudflare Workers (本番環境)
cd ../deploy-workers
npm install
```

## ☁️ ステップ3: Google Drive APIのセットアップ

### 3.1 Google Cloud Consoleでプロジェクト作成

1. https://console.cloud.google.com/ にアクセス
2. 新しいプロジェクトを作成
   - プロジェクト名: `alexa-music-server`
3. プロジェクトを選択

### 3.2 Drive APIを有効化

1. 「APIとサービス」→「ライブラリ」
2. 「Google Drive API」を検索
3. 「有効にする」をクリック

### 3.3 Service Accountを作成

1. 「APIとサービス」→「認証情報」
2. 「認証情報を作成」→「サービスアカウント」
3. 名前: `alexa-music-drive`
4. ロール: なし（読み取り専用で十分）
5. 「完了」をクリック

### 3.4 JSONキーをダウンロード

1. 作成したService Accountをクリック
2. 「キー」タブ
3. 「鍵を追加」→「新しい鍵を作成」
4. JSON形式を選択
5. ダウンロードしたファイルを`deploy-workers/config/google-drive-credentials.json`に保存

### 3.5 Google Driveフォルダを共有

1. Google Driveで音楽用フォルダを作成（例: `Music`）
2. フォルダのIDをコピー
   - URLから: `https://drive.google.com/drive/folders/[FOLDER_ID]`
3. フォルダを右クリック→「共有」
4. Service Accountのメールアドレスを追加（`alexa-music-drive@PROJECT_ID.iam.gserviceaccount.com`）
5. 権限: 「閲覧者」
6. 「共有」をクリック

### 3.6 設定ファイルを作成

```bash
cd deploy-workers/config
cp google-drive-config.json.example google-drive-config.json
```

`google-drive-config.json`を編集：

```json
{
  "credentialsPath": "./google-drive-credentials.json",
  "folderId": "YOUR_FOLDER_ID_HERE",
  "apiSettings": {
    "version": "v3",
    "scopes": ["https://www.googleapis.com/auth/drive.readonly"]
  }
}
```

## ⚡ ステップ4: Cloudflare Workersのセットアップ

### 4.1 Cloudflareにログイン

```bash
cd deploy-workers
npx wrangler login
```

ブラウザが開くので、Cloudflareアカウントでログイン。

### 4.2 Workers KV Namespaceを作成

```bash
# 音楽ライブラリ用
npx wrangler kv:namespace create MUSIC_DB

# セッション管理用
npx wrangler kv:namespace create SESSIONS
```

出力されるNamespace IDをメモ：
```
✅ MUSIC_DB created with id: 29af5a6de5be45c188828a14d84cad6d
✅ SESSIONS created with id: 4725a7e7a1ec44219db4f4a0fe7679b5
```

### 4.3 wrangler.tomlを設定

```bash
cp wrangler.toml.example wrangler.toml
```

`wrangler.toml`を編集：

```toml
name = "alexa-music-workers"
main = "src/index.js"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "MUSIC_DB"
id = "YOUR_MUSIC_DB_NAMESPACE_ID"  # ← ここを更新

[[kv_namespaces]]
binding = "SESSIONS"
id = "YOUR_SESSIONS_NAMESPACE_ID"  # ← ここを更新
```

### 4.4 Workers Subdomainを確認

Cloudflare Dashboard → Workers & Pages → Subdomain を確認。

例: `your-subdomain.workers.dev`

## 🎤 ステップ5: Alexaスキルの作成

### 5.1 Amazon Developer Consoleにアクセス

https://developer.amazon.com/alexa/console/ask

### 5.2 新しいスキルを作成

1. 「スキルを作成」
2. 名前: `モカモカ`（または好きな名前）
3. プライマリロケール: `日本語（JP）`
4. モデル: `カスタム`
5. ホスティング: `ユーザー定義のプロビジョニング`
6. 「スキルを作成」

### 5.3 対話モデルをインポート

1. 左メニュー → JSONエディター
2. `alexa-skill/interactionModel.json`の内容をコピー&ペースト
3. 「モデルを保存」
4. 「モデルをビルド」（数分かかります）

### 5.4 エンドポイントを設定

1. 左メニュー → エンドポイント
2. サービスエンドポイントのタイプ: `HTTPS`
3. デフォルトの地域: `https://YOUR_SUBDOMAIN.workers.dev/alexa`
4. SSL証明書のタイプ: `ワイルドカード証明書のサブドメイン`
5. 「エンドポイントを保存」

### 5.5 Distribution (配布)タブを完成

**重要**: 実機（Echo）でテストするには必須！

1. 「Distribution」タブ
2. すべての必須項目を入力：
   - スキルの説明（簡単でOK）
   - カテゴリー: 音楽とオーディオ
   - プライバシーポリシー: 不要（個人利用）
   - 利用規約: 不要
3. 「プライバシーとコンプライアンス」:
   - すべての質問に回答（個人利用なら「いいえ」でOK）
4. 「配布を保存」

### 5.6 テストを有効化

1. 「テスト」タブ
2. 「開発中」を選択
3. シミュレーターでテスト可能に

## 🎵 ステップ6: 音楽ファイルの準備

### 6.1 Google Driveにアップロード

1. Google Driveの音楽フォルダを開く
2. MP3ファイルをアップロード
   - または、M4Aファイル（後でMP3に変換）

### 6.2 M4A→MP3変換（オプション）

ffmpegがインストール済みであることを確認：

```bash
ffmpeg -version
```

変換実行：

```bash
cd deploy-workers
npm run convert
```

変換されたMP3は`converted-audio/`に保存されます。

### 6.3 フォルダ共有設定

音楽フォルダ全体を公開：

1. フォルダを右クリック→「共有」
2. 「リンクを知っている全員」に変更
3. 権限: 「閲覧者」
4. 「完了」

## 🔄 ステップ7: 音楽ライブラリの同期

### 7.1 ローカル音楽ライブラリをスキャン（オプション）

ローカルテスト用：

```bash
cd deploy-express
cp .env.example .env
# .envのMUSIC_DIRを設定
npm run scan
```

### 7.2 Google Drive File IDsを抽出

```bash
cd deploy-workers
node scripts/extract-drive-ids.js
```

出力:
```
✅ Matched: 奈良時代.mp3
✅ Matched: 平安時代.mp3
✅ Matched: 江戸時代初期.mp3
```

### 7.3 Workers KVに同期

```bash
npm run sync-music
```

確認:
```bash
npx wrangler kv:key get \
  --namespace-id=YOUR_MUSIC_DB_ID \
  "music-library" | jq '.metadata'
```

## 🚢 ステップ8: デプロイ

```bash
cd deploy-workers
npm run deploy
```

成功すると：
```
✅ Deployed alexa-music-workers
   https://YOUR_SUBDOMAIN.workers.dev
```

### 健全性チェック

```bash
curl https://YOUR_SUBDOMAIN.workers.dev/health
```

期待される出力:
```json
{
  "status": "ok",
  "service": "alexa-music-workers",
  "timestamp": "2025-12-14T..."
}
```

## 🧪 ステップ9: テスト

### シミュレーターテスト

1. Amazon Developer Console → テストタブ
2. 入力: 「モカモカを開いて」
3. 応答: 「はい、何を再生しますか」
4. 入力: 「奈良時代を再生」
5. 応答: 「奈良時代を再生します。」

**注意**: シミュレーターでは音声は再生されません（正常）。

### 実機テスト (Amazon Echo)

1. Distribution タブが完成していることを確認
2. 5分〜24時間待つ（スキルの反映待ち）
3. Echoに話しかける:
   - 「アレクサ、モカモカを開いて」
   - 「奈良時代を再生」

**期待される動作**: 音楽が再生される！🎉

### トラブルシューティング

音楽が再生されない場合:

1. **Workersログを確認**:
   ```bash
   npx wrangler tail
   ```

2. **ストリーミングエンドポイントをテスト**:
   ```bash
   # Track IDを取得
   TRACK_ID=$(npx wrangler kv:key get \
     --namespace-id=YOUR_ID "music-library" | jq -r '.tracks[0].id')
   
   # ストリーミングテスト
   curl -I https://YOUR_SUBDOMAIN.workers.dev/stream/$TRACK_ID
   ```

3. **Google Driveファイルが公開されているか確認**

詳細は [TROUBLESHOOTING.md](TROUBLESHOOTING.md) を参照。

## ✅ 完了！

おめでとうございます！Alexa Music Serverのセットアップが完了しました。

### 次のステップ

- 新しい曲を追加: [README-CONVERT.md](deploy-workers/README-CONVERT.md)
- Claude Codeコマンドを使う: `/add-music`, `/music-status`
- ドキュメントを読む: [CLAUDE.md](CLAUDE.md)

---

質問やサポートが必要な場合は、[Issues](https://github.com/yourusername/alexa-music-server/issues)へ！
