#!/bin/bash
# 署名検証を再有効化するスクリプト
# 2025-12-17 09:00 JST以降に実行してください

set -e  # エラーで停止

echo "================================================"
echo "Alexa署名検証 再有効化スクリプト"
echo "================================================"
echo ""

# 現在のディレクトリを確認
if [ ! -f "wrangler.toml" ]; then
  echo "❌ エラー: wrangler.tomlが見つかりません"
  echo "このスクリプトはdeploy-workersディレクトリで実行してください"
  exit 1
fi

echo "📝 ステップ1: wrangler.tomlを更新（署名検証を有効化）..."
sed -i '' 's/ALEXA_VERIFY_SIGNATURE = "false"/ALEXA_VERIFY_SIGNATURE = "true"/' wrangler.toml

# 変更を確認
if grep -q 'ALEXA_VERIFY_SIGNATURE = "true"' wrangler.toml; then
  echo "✅ wrangler.toml更新成功"
else
  echo "❌ エラー: wrangler.tomlの更新に失敗しました"
  exit 1
fi

echo ""
echo "🚀 ステップ2: Cloudflare Workersにデプロイ..."
npx wrangler deploy

echo ""
echo "🧪 ステップ3: 動作確認..."
echo ""
echo "3-1. 署名なしリクエスト（ブロックされるべき）:"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST https://alexa-music-workers.swiftzhu.workers.dev/alexa \
  -H "Content-Type: application/json" \
  -d '{"version":"1.0","request":{"type":"LaunchRequest"},"session":{"application":{"applicationId":"test"}}}')

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")

if [ "$HTTP_CODE" = "401" ]; then
  echo "✅ 正常: 署名なしリクエストが401でブロックされました"
else
  echo "⚠️  警告: HTTP $HTTP_CODE - 期待していたのは401"
fi

echo ""
echo "================================================"
echo "✅ 署名検証の再有効化が完了しました！"
echo "================================================"
echo ""
echo "📋 次のステップ:"
echo "1. Alexa Developer Consoleのシミュレーターでテスト"
echo "   https://developer.amazon.com/alexa/console/ask"
echo "   → 「モカモカを開いて」と入力"
echo ""
echo "2. ログを確認:"
echo "   npx wrangler tail"
echo "   期待ログ: 🔐 Using SHA-256 signature verification"
echo "   期待ログ: ✅ Alexa request verified successfully with SHA-256"
echo ""
echo "3. 実機Echoデバイスでテスト:"
echo "   「アレクサ、モカモカを開いて」"
echo ""
echo "4. KV使用量を確認:"
echo "   https://dash.cloudflare.com/kv"
echo "   → CERT_CACHE に1-2個のキーが追加されるはず"
echo ""
