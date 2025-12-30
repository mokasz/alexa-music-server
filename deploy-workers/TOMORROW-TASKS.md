# 明日のタスク（2025-12-17 09:00 JST以降）

## 🎯 目的
Cloudflare KV制限がリセットされたら、Alexa署名検証（SHA-256）を再有効化する

## ⏰ 実行タイミング
**2025-12-17 09:00 JST以降**（= 2025-12-17 00:00:00 UTC以降）

## 🚀 一発実行コマンド

```bash
cd /Users/shiwei.zhu/Claude/alexa-music-server-security/deploy-workers
./enable-signature-verification.sh
```

これだけで完了です！

## 📋 スクリプトが実行する内容

1. ✅ wrangler.tomlの`ALEXA_VERIFY_SIGNATURE`を`"true"`に変更
2. ✅ Cloudflare Workersにデプロイ
3. ✅ 署名なしリクエストがブロックされることを確認（401エラー）

## 🧪 手動で確認する場合

### 1. Alexa Developer Consoleでテスト
```
URL: https://developer.amazon.com/alexa/console/ask
→ Test タブ
→ 「モカモカを開いて」と入力
→ 正常に応答が返ればOK
```

### 2. ログを確認
```bash
npx wrangler tail
```

**期待されるログ:**
```
🔐 Using SHA-256 signature verification
📥 Downloading certificate
✅ Public key extracted with SHA-256
✅ Alexa request verified successfully with SHA-256
```

### 3. 実機Echoデバイスでテスト
```
「アレクサ、モカモカを開いて」
→ 正常に音楽が再生されればOK
```

### 4. KV使用量を確認
```
URL: https://dash.cloudflare.com/kv
→ CERT_CACHE を選択
→ 1-2個のキーが追加されているはず（証明書キャッシュ）
```

## 📊 期待される結果

### 署名検証の動作
- ✅ Alexaからのリクエスト: 署名検証成功 → 200 OK
- ✅ 署名なしリクエスト: 401 Unauthorized でブロック
- ✅ 不正な署名: 401 Unauthorized でブロック

### KV使用量
| 項目 | 使用量/日 | 制限 |
|------|-----------|------|
| 証明書キャッシュ（CERT_CACHE） | 1-2回 | 1,000回 |
| セッション管理（SESSIONS） | 0回 | 1,000回 |
| 音楽DB（MUSIC_DB） | 1-5回 | 1,000回 |
| **合計** | **2-7回/日** | **余裕で制限内** |

## 🔧 トラブルシューティング

### 問題: スクリプト実行でエラーが出る

**解決策1: 手動でwrangler.tomlを編集**
```bash
cd /Users/shiwei.zhu/Claude/alexa-music-server-security/deploy-workers
nano wrangler.toml

# 以下の行を探して変更:
# ALEXA_VERIFY_SIGNATURE = "false"  # ← これを
ALEXA_VERIFY_SIGNATURE = "true"     # ← これに変更

# Ctrl+X → Y → Enter で保存

# デプロイ
npx wrangler deploy
```

**解決策2: sedコマンドを直接実行**
```bash
cd /Users/shiwei.zhu/Claude/alexa-music-server-security/deploy-workers
sed -i '' 's/ALEXA_VERIFY_SIGNATURE = "false"/ALEXA_VERIFY_SIGNATURE = "true"/' wrangler.toml
npx wrangler deploy
```

### 問題: Alexa Simulatorでエラーが出る

**確認事項:**
1. デプロイが成功したか確認
2. ログに署名検証のメッセージが出ているか確認
3. 証明書のダウンロードに失敗していないか確認

**一時的な対処:**
署名検証を再度無効化して調査
```bash
cd /Users/shiwei.zhu/Claude/alexa-music-server-security/deploy-workers
sed -i '' 's/ALEXA_VERIFY_SIGNATURE = "true"/ALEXA_VERIFY_SIGNATURE = "false"/' wrangler.toml
npx wrangler deploy
```

### 問題: KV制限に再度到達

**原因:** 証明書キャッシュが正常に動作していない可能性

**確認:**
```bash
npx wrangler tail
# "✅ Certificate cache hit" が出ているか確認
# 出ていない場合はキャッシュが効いていない
```

**対処:** 有料プランへのアップグレードを検討（$5/月で1M書き込み）

## 📝 コミット情報

今回の最適化で実施した変更:
- `a1a9b1c` - SHA-1からSHA-256への移行
- `ab30e17` - Express版の署名検証強化
- `28d8349` - KV書き込みの最適化（重要！）

## 📞 サポート

問題が発生した場合は、Claudeに以下の情報を共有してください:
1. `npx wrangler tail` のログ出力
2. Alexa Developer Consoleのエラーメッセージ
3. KV使用量のスクリーンショット

---

**準備完了！明日09:00以降に上記のコマンドを実行してください！** 🚀
