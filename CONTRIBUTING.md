# Contributing to Alexa Music Server

まず、このプロジェクトへのコントリビューションを検討してくださり、ありがとうございます！🎉

## 行動規範

このプロジェクトは、すべての参加者に敬意と包括性のある環境を提供することを約束します。

## コントリビューションの方法

### バグ報告

バグを見つけた場合は、[Issue](https://github.com/yourusername/alexa-music-server/issues)を作成してください。

**含めるべき情報：**
- 明確なタイトルと説明
- 再現手順
- 期待される動作と実際の動作
- スクリーンショット（該当する場合）
- 環境情報（Node.jsバージョン、OSなど）

### 機能リクエスト

新しい機能のアイデアがある場合は、Issueで提案してください。

### プルリクエスト

1. **Fork & Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/alexa-music-server.git
   cd alexa-music-server
   ```

2. **ブランチ作成**
   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **変更を加える**
   - コードスタイルを守る
   - 必要に応じてテストを追加
   - コミットメッセージは明確に

4. **Push & PR作成**
   ```bash
   git push origin feature/amazing-feature
   ```

### コーディング規約

- **JavaScript/Node.js**:
  - ESLint設定に従う
  - async/awaitを使用
  - 明確な変数名

- **コミットメッセージ**:
  ```
  feat: 新機能の追加
  fix: バグ修正
  docs: ドキュメントのみの変更
  style: フォーマット変更
  refactor: リファクタリング
  test: テスト追加
  chore: ビルドプロセスや補助ツールの変更
  ```

### ドキュメント

ドキュメントの改善も大歓迎です：
- タイポの修正
- 説明の明確化
- 新しいガイドの追加
- 翻訳

### テスト

新しい機能を追加する場合は、適切なテストも追加してください。

```bash
# テスト実行
npm test

# ローカルテスト
npm run dev
```

## 開発セットアップ

```bash
# 依存関係インストール
npm install
cd deploy-express && npm install
cd ../deploy-workers && npm install

# ローカル開発サーバー起動
cd deploy-express && npm start

# Workers開発サーバー
cd deploy-workers && npm run dev
```

## 質問

質問がある場合は、Issueで気軽に聞いてください！

## ライセンス

このプロジェクトにコントリビューションすることで、あなたの貢献がMITライセンスの下でライセンスされることに同意したものとみなされます。

---

再度、ありがとうございます！👏
