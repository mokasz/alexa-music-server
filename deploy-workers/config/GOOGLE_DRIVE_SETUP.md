# Google Drive API セットアップガイド

Cloudflare WorkersからGoogle Driveの音楽ファイルにアクセスするための設定手順です。

## 前提条件

- Google Cloudアカウント（無料）
- Google Driveに音楽ファイルがアップロード済み

## ステップ1: Google Cloud Projectの作成

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 新しいプロジェクトを作成
   - プロジェクト名: `alexa-music-workers`（任意）
3. プロジェクトを選択

## ステップ2: Google Drive APIの有効化

1. 左メニュー → 「APIとサービス」 → 「ライブラリ」
2. 「Google Drive API」を検索
3. 「有効にする」をクリック

## ステップ3: Service Accountの作成

1. 「APIとサービス」 → 「認証情報」
2. 「認証情報を作成」 → 「サービスアカウント」
3. サービスアカウント情報を入力：
   - 名前: `alexa-music-workers`
   - ID: 自動生成
   - 説明: `Cloudflare Workers用のGoogle Drive読み取り専用アカウント`
4. 「完了」をクリック

## ステップ4: Service Account Keyの作成

1. 作成したサービスアカウントをクリック
2. 「キー」タブ → 「鍵を追加」 → 「新しい鍵を作成」
3. 形式: JSON
4. ダウンロードされたJSONファイルを保存
   - ファイル名を `google-drive-credentials.json` に変更
   - `deploy-workers/config/` に配置
   - **重要**: `.gitignore`に追加して公開しない

## ステップ5: Google Driveフォルダの共有設定

### 方法A: Service Accountに共有（推奨）

1. Google Driveで音楽フォルダを右クリック → 「共有」
2. Service Accountのメールアドレスを追加
   - メールアドレス形式: `alexa-music-workers@PROJECT-ID.iam.gserviceaccount.com`
   - 権限: 「閲覧者」
3. 「送信」をクリック

### 方法B: 公開リンク（簡単だがセキュリティ低）

1. Google Driveで音楽フォルダを右クリック → 「リンクを取得」
2. 「リンクを知っている全員」に変更
3. 権限: 「閲覧者」
4. フォルダIDをコピー（URLの末尾の文字列）

## ステップ6: 設定ファイルの作成

`deploy-workers/config/google-drive-config.json` を作成：

```json
{
  "folderId": "YOUR_GOOGLE_DRIVE_FOLDER_ID",
  "credentialsPath": "./config/google-drive-credentials.json",
  "shareType": "service-account"
}
```

フォルダIDの取得方法：
1. Google Driveで音楽フォルダを開く
2. URLから取得: `https://drive.google.com/drive/folders/{FOLDER_ID}`

## ステップ7: ファイルID抽出スクリプトの実行

```bash
cd deploy-workers
node scripts/extract-drive-ids.js
```

このスクリプトは：
1. Google Drive APIを使用してフォルダ内のファイルをリスト
2. 各ファイルのIDと公開URLを取得
3. `google-drive-mapping.json`を自動更新

## ステップ8: マッピングの確認

生成された `google-drive-mapping.json` を確認：

```json
{
  "files": {
    "江戸時代初期.mp3": {
      "fileId": "1ABC123xyz...",
      "webContentLink": "https://drive.google.com/uc?id=1ABC123xyz...",
      "name": "江戸時代初期.mp3",
      "mimeType": "audio/mpeg",
      "size": 17463456
    }
  }
}
```

## ステップ9: Workers KVへの同期

```bash
cd deploy-workers
node scripts/sync-music-kv.js
```

## トラブルシューティング

### エラー: "insufficient authentication scopes"
- Service Accountに必要なスコープが付与されているか確認
- Google Drive APIが有効化されているか確認

### エラー: "File not found"
- Service Accountがフォルダへのアクセス権を持っているか確認
- フォルダIDが正しいか確認

### Alexaでストリーミングできない
- Google Driveファイルが公開されているか確認
- `webContentLink`が有効か確認（ブラウザでアクセス可能か）

## セキュリティベストプラクティス

1. **Service Account Keyの保護**
   - `.gitignore`に追加
   - ファイルパーミッションを制限（`chmod 600`）
   - Cloudflare Workers Secretsに保存（本番環境）

2. **Google Drive共有設定**
   - 可能な限りService Account共有を使用
   - 公開リンクは最後の手段

3. **定期的な監査**
   - Service Accountのアクセスログを確認
   - 不要なファイルは削除

## 参考リンク

- [Google Drive API Documentation](https://developers.google.com/drive/api/guides/about-sdk)
- [Service Accounts](https://cloud.google.com/iam/docs/service-accounts)
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
