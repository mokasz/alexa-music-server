# Alexa Music Server - Cloudflare Workers Deployment

完全無料でAlexaスキルをホスティングするCloudflare Workers版です。

## アーキテクチャ

```
Amazon Echo → Alexa Service → Cloudflare Workers → Workers KV (音楽DB)
                                                  ↓
                                          Google Drive (音楽ファイル)
```

## 費用

- **Cloudflare Workers**: 無料プラン（100,000 requests/日）
- **Workers KV**: 無料プラン（1GB reads/日、1,000 writes/日）
- **Google Drive**: 15GB無料ストレージ

**合計: $0.00/月**

## 前提条件

- Node.js 18以上
- Cloudflareアカウント（無料）
- Google Cloudアカウント（無料）
- Google Driveに音楽ファイルをアップロード済み

## セットアップ手順

### 1. Cloudflare Workers環境セットアップ

```bash
# Cloudflareアカウントにログイン
npx wrangler login

# KV Namespaceは既に作成済み
# MUSIC_DB: 29af5a6de5be45c188828a14d84cad6d
# SESSIONS: 4725a7e7a1ec44219db4f4a0fe7679b5
```

### 2. Google Drive APIセットアップ

詳細な手順は `config/GOOGLE_DRIVE_SETUP.md` を参照してください。

**簡易手順:**

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト作成
2. Google Drive APIを有効化
3. Service Accountを作成
4. Service Account Keyをダウンロード
5. `config/google-drive-credentials.json` として保存
6. Google DriveフォルダをService Accountと共有

### 3. Google Drive設定ファイル作成

```bash
# サンプルをコピー
cp config/google-drive-config.example.json config/google-drive-config.json

# 編集してフォルダIDを設定
nano config/google-drive-config.json
```

設定例:
```json
{
  "folderId": "1-xhgFnP3CnU_RMXiIG3IMXED-pexE2H1",
  "credentialsPath": "./config/google-drive-credentials.json",
  "shareType": "service-account"
}
```

### 4. 音楽ライブラリのスキャン

```bash
# Express版で音楽をスキャン
cd ../deploy-express
npm run scan
cd ../deploy-workers
```

### 5. Google DriveファイルIDの抽出

```bash
npm run extract-drive-ids
```

このスクリプトは:
- Google Drive APIで音楽フォルダのファイルをリスト
- ローカルの音楽ライブラリとマッチング
- `config/google-drive-mapping.json` を生成
- ファイルを公開アクセス可能に設定

### 6. Workers KVへの同期

```bash
npm run sync-music
```

このスクリプトは:
- `google-drive-mapping.json` を読み込み
- 音楽メタデータとGoogle Drive URLを組み合わせ
- Workers KVにアップロード

### 7. デプロイ

```bash
# ローカルテスト
npm run dev

# 本番デプロイ
npm run deploy
```

## 開発コマンド

```bash
# ローカル開発サーバー起動
npm run dev

# 本番デプロイ
npm run deploy

# ログ確認
npm run tail

# KV操作
npm run kv:list                                    # Namespace一覧
npx wrangler kv:key list --namespace-id=<ID>      # キー一覧
npx wrangler kv:key get --namespace-id=<ID> <KEY> # 値取得

# Google Drive連携
npm run extract-drive-ids  # DriveファイルID抽出
npm run sync-music         # KVに同期
```

## 設定ファイル

### wrangler.toml

Cloudflare Workersの設定ファイル:
- KV Namespace ID
- 環境変数
- デプロイ設定

### config/google-drive-config.json

Google Drive API設定:
- フォルダID
- 認証情報パス
- APIスコープ

### config/google-drive-credentials.json

Google Service Account認証情報（機密情報！）:
- `.gitignore`で除外済み
- 絶対に公開しない

## トラブルシューティング

### エラー: "Configuration file not found"

```bash
cp config/google-drive-config.example.json config/google-drive-config.json
# フォルダIDを設定してください
```

### エラー: "credentials not found"

```bash
# Google Cloud Consoleからダウンロード
# config/google-drive-credentials.json として保存
```

### エラー: "No audio files found in Google Drive"

- フォルダIDが正しいか確認
- Service Accountがフォルダへのアクセス権を持っているか確認
- Google Driveフォルダを Service Account のメールと共有

### Alexaで音楽が再生できない

1. ファイルが公開アクセス可能か確認:
   ```bash
   # google-drive-mapping.json の webContentLink をブラウザで開く
   ```

2. KVに正しくデータが保存されているか確認:
   ```bash
   npx wrangler kv:key get --namespace-id=29af5a6de5be45c188828a14d84cad6d "music-library"
   ```

3. Workersのログを確認:
   ```bash
   npm run tail
   ```

## ディレクトリ構造

```
deploy-workers/
├── README.md                        # このファイル
├── package.json                     # NPM設定
├── wrangler.toml                    # Workers設定
├── config/
│   ├── GOOGLE_DRIVE_SETUP.md       # 詳細セットアップガイド
│   ├── google-drive-config.example.json
│   ├── google-drive-config.json    # Google Drive設定（作成必要）
│   ├── google-drive-credentials.json # Service Account認証（作成必要）
│   └── google-drive-mapping.json   # ファイルマッピング（自動生成）
├── scripts/
│   ├── extract-drive-ids.js        # DriveファイルID抽出
│   ├── sync-music-kv.js            # KV同期
│   └── lib/
│       └── googleDriveClient.js    # Drive APIクライアント
├── src/
│   ├── index.js                    # Workers entry point（実装予定）
│   └── ...
└── adapters/
    ├── musicLibraryAdapter.js      # KV Adapter（実装予定）
    └── playlistManagerAdapter.js   # KV Adapter（実装予定）
```

## 次のステップ

1. ✅ Phase 2完了: Cloudflare Workers環境セットアップ
2. 🚧 Phase 3進行中: Google Drive統合
3. ⏳ Phase 4: Alexa Intent Handler移植
4. ⏳ Phase 5: デプロイとテスト

## 参考リンク

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Workers KV Documentation](https://developers.cloudflare.com/kv/)
- [Google Drive API](https://developers.google.com/drive/api/guides/about-sdk)
- [Alexa Skills Kit](https://developer.amazon.com/alexa/alexa-skills-kit)
