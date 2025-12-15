# Security Implementation Plan
# Alexa Music Server - アクセス保護実装計画書

**作成日**: 2025-12-15
**対象システム**: Alexa Music Server (カスタムAlexaスキル)
**目的**: AlexaスキルシミュレーターとEchoデバイスからのアクセスのみを許可するセキュリティ実装
**実装順序**: Phase 1 → Phase 2 → Phase 3

---

## 📊 現状分析

### 現在のセキュリティ状態: **中リスク**

**アーキテクチャ:**
```
Amazon Echo/Simulator
    ↓
Alexa Service (AWS)
    ↓
Cloudflare (Tunnel/Workers)
    ↓
Node.js Express (Local Mac) / Cloudflare Workers
    ↓
MP3 Files (Local) / Google Drive
```

**重大な脆弱性:**

1. **Alexa署名検証が無効** (Critical)
   - 現在: `ALEXA_VERIFY_SIGNATURE=false`
   - 影響: 誰でもエンドポイントにPOSTリクエスト可能
   - リスク: 不正アクセス、帯域幅窃取、音楽ライブラリ漏洩

2. **ストリーミングエンドポイントに認証なし** (High)
   - 現在: `/stream/:trackId` が完全に無防備
   - 影響: トラックIDがわかれば誰でもMP3ダウンロード可能
   - リスク: 音楽ライブラリ全体の露出、Google Driveクォータ消費

3. **Workers実装に検証ミドルウェアなし** (High)
   - 現在: Express版は不完全ながら検証あり、Workers版は検証ゼロ
   - 影響: Workers経由の完全な無防備アクセス
   - リスク: 新デプロイメントが最も脆弱

### 現在の保護状況

✅ **実装済み:**
- HTTPS/TLS (Cloudflare経由)
- タイムスタンプ検証 (Express: 150秒ウィンドウ)
- スキルID検証 (Express)
- Helmet セキュリティヘッダー (Express)

❌ **未実装:**
- Alexa暗号学的署名検証
- ストリーミング認証
- レート制限
- WAFルール
- CORS制限

---

## 🎯 実装目標

### 達成すべきセキュリティレベル

**Primary Goal: Alexa専用アクセス制御 (98%)**
- Alexaサービスからの署名付きリクエストのみ受け入れ
- ストリーミングは認証済みセッションのみ
- 不正アクセス試行をブロック・ログ記録

**Secondary Goal: 多層防御 (Defense in Depth)**
- Cloudflareレベル: WAF、レート制限、IP許可リスト
- アプリケーションレベル: 署名検証、JWT認証
- モニタリング: 不正アクセス試行の検知とアラート

---

## 📅 実装フェーズ

## Phase 1: 最小限の即時修正 (Critical)

**目的**: Alexa署名検証を有効化し、最も重大な脆弱性を解消
**期間**: 1-2時間
**優先度**: 🔴 最高
**リスク**: 低（既存機能を壊さない追加セキュリティ）

### 1.1 Express Server - Alexa署名検証実装

#### タスク一覧
- [ ] `alexa-verifier` パッケージのインストール
- [ ] `src/middleware/alexaVerification.js` の更新
- [ ] `.env` ファイルの更新 (`ALEXA_VERIFY_SIGNATURE=true`)
- [ ] ローカルテスト (Simulator)
- [ ] 実機テスト (Echo device)
- [ ] ログ確認

#### 実装詳細

**1. パッケージインストール**

```bash
cd /Users/shiwei.zhu/Claude/alexa-music-server
npm install alexa-verifier
```

**2. `src/middleware/alexaVerification.js` の完全置き換え**

現在のファイル: 基本的なチェックのみ（タイムスタンプ、スキルID）
新しい実装: Amazonの公式要件に準拠した暗号学的検証

```javascript
const alexaVerifier = require('alexa-verifier');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Alexa Request Signature Verification Middleware
 * Implements Amazon's required cryptographic validation
 *
 * Amazon Documentation:
 * https://developer.amazon.com/docs/custom-skills/host-a-custom-skill-as-a-web-service.html
 */
function verifyAlexaRequest(req, res, next) {
  // Development mode exception (only if explicitly disabled)
  if (!config.alexa.verifySignature && config.server.env !== 'production') {
    logger.warn('⚠️  Alexa signature verification is DISABLED - development mode only');
    return next();
  }

  // Production: Always verify
  const certUrl = req.headers['signaturecertchainurl'];
  const signature = req.headers['signature'];
  const requestBody = JSON.stringify(req.body);

  // Check required headers
  if (!certUrl || !signature) {
    logger.warn('❌ Missing Alexa signature headers', {
      hasCertUrl: !!certUrl,
      hasSignature: !!signature,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    return res.status(400).json({
      error: 'Missing signature headers',
      message: 'This endpoint requires Alexa authentication'
    });
  }

  // Cryptographic signature verification using alexa-verifier library
  // This library:
  // 1. Validates SignatureCertChainUrl format
  // 2. Downloads and caches the certificate
  // 3. Verifies certificate chain validity
  // 4. Checks echo-api.amazon.com in Subject Alternative Names
  // 5. Decrypts signature and compares with request hash
  alexaVerifier(certUrl, signature, requestBody, (error) => {
    if (error) {
      logger.error('❌ Alexa signature verification failed', {
        error: error.message,
        certUrl: certUrl,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      return res.status(401).json({
        error: 'Invalid request signature',
        message: 'Authentication failed'
      });
    }

    // Additional validation: Timestamp
    const alexaRequest = req.body;
    const timestamp = alexaRequest.request?.timestamp;

    if (timestamp) {
      const requestTime = new Date(timestamp).getTime();
      const now = Date.now();
      const timeDifference = Math.abs(now - requestTime);

      // Amazon requires 150-second tolerance for clock skew and network latency
      if (timeDifference > 150000) {
        logger.warn('⚠️  Request timestamp too old', {
          timeDifference: `${timeDifference}ms`,
          timestamp: timestamp,
          ip: req.ip
        });
        return res.status(400).json({
          error: 'Request timestamp too old',
          message: 'Request has expired'
        });
      }
    }

    // Additional validation: Skill ID
    if (config.alexa.skillId) {
      const applicationId = alexaRequest.session?.application?.applicationId ||
                           alexaRequest.context?.System?.application?.applicationId;

      if (applicationId !== config.alexa.skillId) {
        logger.warn('⚠️  Skill ID mismatch', {
          expected: config.alexa.skillId,
          received: applicationId,
          ip: req.ip
        });
        return res.status(403).json({
          error: 'Unauthorized skill',
          message: 'This request is for a different skill'
        });
      }
    }

    // All validations passed
    logger.info('✅ Alexa request verified successfully', {
      requestType: alexaRequest.request?.type,
      intentName: alexaRequest.request?.intent?.name,
      sessionId: alexaRequest.session?.sessionId,
      applicationId: alexaRequest.session?.application?.applicationId
    });

    next();
  });
}

module.exports = { verifyAlexaRequest };
```

**3. `.env` ファイル更新**

```bash
# Before
ALEXA_VERIFY_SIGNATURE=false

# After
ALEXA_VERIFY_SIGNATURE=true
```

**4. サーバー再起動**

```bash
npm run dev  # 開発環境
# または
pm2 restart alexa-music-server  # 本番環境
```

#### テスト手順

**✅ Positive Test (成功すべきテスト):**

1. **Alexa Developer Consoleシミュレーター**
   ```
   1. https://developer.amazon.com/alexa/console/ask を開く
   2. スキル「モカモカ」を選択
   3. Test タブ → "モカモカを開いて"
   4. 期待結果: 正常に応答
   ```

2. **実機テスト (Echo device)**
   ```
   "アレクサ、モカモカを開いて"
   期待結果: 正常に音楽再生開始
   ```

3. **ログ確認**
   ```bash
   tail -f logs/app.log

   # 期待されるログ:
   # ✅ Alexa request verified successfully
   # Playing: [曲名] by [アーティスト]
   # Playback started: [trackId]
   ```

**❌ Negative Test (失敗すべきテスト):**

```bash
# 署名ヘッダーなしのリクエスト（不正アクセス試行）
curl -X POST http://localhost:3000/alexa \
  -H "Content-Type: application/json" \
  -d '{"version":"1.0","request":{"type":"LaunchRequest"}}'

# 期待結果:
# HTTP 400 Bad Request
# {"error":"Missing signature headers","message":"This endpoint requires Alexa authentication"}

# ログに記録されるべき内容:
# ❌ Missing Alexa signature headers
```

#### 予想される問題と対処

**問題1: "Request timestamp too old" エラー**
- 原因: サーバーの時刻が不正確
- 対処: `sudo ntpdate -u time.apple.com` (macOS) でシステム時刻を同期

**問題2: 証明書ダウンロード失敗**
- 原因: ファイアウォールがS3へのアクセスをブロック
- 対処: `s3.amazonaws.com` への HTTPS (443) アクセスを許可

**問題3: Simulatorで動作するが実機で失敗**
- 原因: Distribution タブ未完成（既知の問題）
- 対処: Developer Console → Distribution → Privacy & Compliance を完成させる

### 1.2 検証とロールバック準備

**検証チェックリスト:**
- [ ] Simulatorテスト成功
- [ ] 実機テスト成功（最低1回の完全な再生セッション）
- [ ] 不正アクセス試行が正しくブロックされる
- [ ] ログに検証成功・失敗が記録される
- [ ] エラーメッセージが適切（セキュリティ情報を漏らさない）

**ロールバック手順 (問題発生時):**

```bash
# .env を元に戻す
echo "ALEXA_VERIFY_SIGNATURE=false" >> .env

# サーバー再起動
pm2 restart alexa-music-server

# または git で元に戻す
git checkout src/middleware/alexaVerification.js
```

### Phase 1 完了条件

✅ **以下がすべて達成された場合、Phase 2に進む:**
- [ ] `alexa-verifier` インストール完了
- [ ] 署名検証ミドルウェア更新完了
- [ ] `ALEXA_VERIFY_SIGNATURE=true` 設定完了
- [ ] Simulatorテスト成功
- [ ] 実機テスト成功（音楽再生まで確認）
- [ ] 不正アクセステスト成功（正しくブロックされる）
- [ ] ログに適切な情報が記録される
- [ ] 24時間の安定稼働確認

**Phase 1 の影響範囲:**
- 変更ファイル: `src/middleware/alexaVerification.js`, `.env`, `package.json`
- ダウンタイム: ゼロ（既存の動作を壊さない追加セキュリティ）
- リスク: 低

---

## Phase 2: 推奨される完全なセキュリティ実装

**目的**: ストリーミング保護とCloudflare WAF設定により多層防御を実現
**期間**: 4-6時間
**優先度**: 🟠 高
**リスク**: 中（ストリーミングURLの変更が必要）

### 2.1 JWT Stream Token Authentication

#### 背景と目的

**現在の問題:**
```
GET /stream/:trackId  ← 認証なし、誰でもアクセス可能
```

**攻撃シナリオ:**
```bash
# トラックIDを総当たりで音楽ライブラリをダウンロード
for i in {1..1000}; do
  curl "https://alexa-music.moerin.com/stream/track-$i" -o "track-$i.mp3"
done
```

**解決策:**
- Alexa検証を通過したリクエストのみが有効なストリームトークンを取得
- トークンは1時間で有効期限切れ
- トークンはトラックIDと紐付け（他のトラックに使い回し不可）

#### 実装詳細

**1. JWTライブラリのインストール**

```bash
cd /Users/shiwei.zhu/Claude/alexa-music-server
npm install jsonwebtoken
```

**2. JWT Secretの設定**

`.env` に追加:
```bash
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=<64文字のランダムな16進数文字列>
```

セキュアなシークレット生成:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**3. Stream Token生成機能の追加**

新規ファイル: `src/utils/streamTokens.js`

```javascript
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const logger = require('./logger');

/**
 * Generate a signed token for streaming a specific track
 * @param {string} trackId - The track ID to authorize
 * @param {string} skillId - The Alexa skill ID (for additional validation)
 * @param {number} expiresIn - Token expiration in seconds (default: 3600 = 1 hour)
 * @returns {string} Signed JWT token
 */
function generateStreamToken(trackId, skillId, expiresIn = 3600) {
  const secret = config.jwt?.secret || process.env.JWT_SECRET;

  if (!secret) {
    logger.error('JWT_SECRET is not configured');
    throw new Error('JWT configuration missing');
  }

  const payload = {
    trackId,
    skillId,
    type: 'stream',
    iat: Math.floor(Date.now() / 1000)
  };

  const token = jwt.sign(payload, secret, {
    expiresIn,
    issuer: 'alexa-music-server',
    subject: trackId
  });

  logger.debug('Stream token generated', {
    trackId,
    expiresIn: `${expiresIn}s`
  });

  return token;
}

/**
 * Verify and decode a stream token
 * @param {string} token - The JWT token to verify
 * @returns {object|null} Decoded payload if valid, null if invalid
 */
function verifyStreamToken(token) {
  const secret = config.jwt?.secret || process.env.JWT_SECRET;

  if (!secret) {
    logger.error('JWT_SECRET is not configured');
    return null;
  }

  try {
    const decoded = jwt.verify(token, secret, {
      issuer: 'alexa-music-server'
    });

    // Additional validation
    if (decoded.type !== 'stream') {
      logger.warn('Invalid token type', { type: decoded.type });
      return null;
    }

    return decoded;
  } catch (error) {
    logger.warn('Token verification failed', {
      error: error.message,
      name: error.name
    });
    return null;
  }
}

module.exports = {
  generateStreamToken,
  verifyStreamToken
};
```

**4. Alexa Controllerの更新（トークン生成）**

`src/controllers/alexaController.js` の修正:

```javascript
const { generateStreamToken } = require('../utils/streamTokens');

// buildAudioDirective 関数を更新
function buildAudioDirective(behavior, track, offsetInMilliseconds = 0) {
  // Generate stream token
  const token = generateStreamToken(
    track.id,
    process.env.ALEXA_SKILL_ID,
    3600 // 1 hour expiration
  );

  // Build URL with token
  const streamUrl = `${process.env.PUBLIC_URL}/stream/${track.id}?token=${token}`;

  return {
    type: 'AudioPlayer.Play',
    playBehavior: behavior,
    audioItem: {
      stream: {
        url: streamUrl,  // トークン付きURL
        token: track.id,
        offsetInMilliseconds
      },
      metadata: {
        title: track.title,
        subtitle: track.artist || 'Unknown Artist',
        art: {
          sources: track.albumArt ? [{ url: track.albumArt }] : []
        }
      }
    }
  };
}
```

**5. Stream Controllerの更新（トークン検証）**

`src/controllers/streamController.js` の修正:

```javascript
const { verifyStreamToken } = require('../utils/streamTokens');

async function streamTrack(req, res) {
  const { trackId } = req.params;
  const token = req.query.token;

  // Token validation
  if (!token) {
    logger.warn('Stream request without token', {
      trackId,
      ip: req.ip
    });
    return res.status(401).json({
      error: 'Missing authentication token',
      message: 'Stream access requires authentication'
    });
  }

  // Verify token
  const decoded = verifyStreamToken(token);
  if (!decoded) {
    logger.warn('Invalid stream token', {
      trackId,
      ip: req.ip
    });
    return res.status(403).json({
      error: 'Invalid or expired token',
      message: 'Authentication token is not valid'
    });
  }

  // Verify token is for the requested track
  if (decoded.trackId !== trackId) {
    logger.warn('Token/track ID mismatch', {
      tokenTrackId: decoded.trackId,
      requestedTrackId: trackId,
      ip: req.ip
    });
    return res.status(403).json({
      error: 'Token/track mismatch',
      message: 'This token is not valid for the requested track'
    });
  }

  logger.info('✅ Stream token validated', {
    trackId,
    ip: req.ip
  });

  // Continue with existing streaming logic...
  // (既存のRange request処理など)
}
```

**6. config/config.js にJWT設定を追加**

```javascript
module.exports = {
  // ... existing config ...
  jwt: {
    secret: process.env.JWT_SECRET,
    streamTokenExpiry: 3600 // 1 hour in seconds
  }
};
```

#### テスト手順

**Negative Test (トークンなし):**
```bash
# トークンなしでアクセス試行
curl "http://localhost:3000/stream/some-track-id"

# 期待結果:
# HTTP 401 Unauthorized
# {"error":"Missing authentication token"}
```

**Negative Test (無効なトークン):**
```bash
# 偽のトークンでアクセス試行
curl "http://localhost:3000/stream/some-track-id?token=invalid.token.here"

# 期待結果:
# HTTP 403 Forbidden
# {"error":"Invalid or expired token"}
```

**Positive Test (Alexa経由):**
```bash
# 1. Echoに話しかける: "アレクサ、モカモカを開いて"
# 2. "再生して 江戸時代初期"
# 3. ログを確認

tail -f logs/app.log

# 期待されるログ:
# ✅ Alexa request verified successfully
# Stream token generated for track: [trackId]
# ✅ Stream token validated for track: [trackId]
# Streaming: 江戸時代初期
```

### 2.2 Cloudflare WAF Configuration

#### 2.2.1 Amazon ASN Allowlist

**背景:**
- AlexaリクエストはAWS (AS16509) から発信される
- CloudflareでAmazon ASNを許可リストに追加

**設定手順:**

1. **Cloudflare Dashboardにログイン**
   - https://dash.cloudflare.com/

2. **ドメインを選択**
   - `moerin.com` を選択

3. **Security → WAF → Tools → IP Access Rules**

4. **新しいルールを追加**
   ```
   Value: AS16509
   Action: Allow
   Zone: This website (moerin.com)
   Note: Amazon/Alexa traffic allowlist
   ```

5. **Save**

**効果:**
- Amazon AWS発信のトラフィックがCloudflareの一部セキュリティチェックをバイパス
- ただし、AWS全体を許可（Alexa専用ではない）

**制限事項:**
- AmazonはAlexa専用IPレンジを公開していない
- AS16509はAWS全体のため、他のAWSサービスも許可される
- 署名検証と組み合わせて使用することが重要

#### 2.2.2 Rate Limiting Rules

**目的:**
- DDoS攻撃防止
- ブルートフォース攻撃防止
- リソース枯渇防止

**設定手順:**

1. **Security → WAF → Rate limiting rules**

2. **Rule 1: Alexa Endpoint Protection**

```
Rule name: Alexa Endpoint Rate Limit

If incoming requests match:
  - (http.request.uri.path eq "/alexa") and
  - (http.request.method eq "POST")

When rate exceeds:
  - 60 requests per 1 minute

With the same value of:
  - IP Address

Then take action:
  - Block for 1 hour

Response:
  - 429 Too Many Requests
  - Custom error page: "Rate limit exceeded. Please try again later."
```

3. **Rule 2: Stream Endpoint Protection**

```
Rule name: Stream Endpoint Rate Limit

If incoming requests match:
  - (http.request.uri.path contains "/stream/") and
  - (http.request.method eq "GET")

When rate exceeds:
  - 100 requests per 1 minute

With the same value of:
  - IP Address

Then take action:
  - Block for 10 minutes

Response:
  - 429 Too Many Requests
  - Custom error page: "Streaming rate limit exceeded."
```

**レート制限の妥当性:**

| エンドポイント | 制限 | 根拠 |
|--------------|------|------|
| `/alexa` | 60 req/min | 通常のAlexa使用は1-5 req/min。60は異常なトラフィック |
| `/stream/*` | 100 req/min | シーク操作で複数リクエスト発生。100は十分 |

#### 2.2.3 CORS Restrictions

**現在の設定 (緩すぎる):**
```javascript
app.use(cors());  // Allow all origins
```

**推奨設定:**

`src/index.js` の修正:

```javascript
const corsOptions = {
  origin: function (origin, callback) {
    // Alexa service requests have no Origin header (server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    // Allow Alexa Developer Console for testing
    const allowedOrigins = [
      'https://developer.amazon.com',
      'https://alexa.amazon.com'
    ];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked origin', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'SignatureCertChainUrl', 'Signature'],
  credentials: false,
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));
```

**効果:**
- ブラウザベースの攻撃を防止
- Alexaサービス（Origin ヘッダーなし）は引き続き動作
- Developer Consoleは引き続き動作

### 2.3 Monitoring and Logging

#### 2.3.1 Security Event Logging

**Logger設定の強化:**

`src/utils/logger.js` に追加:

```javascript
// Security event logger
const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/security.log',
      maxsize: 10485760, // 10MB
      maxFiles: 10
    })
  ]
});

module.exports = {
  // ... existing exports ...
  security: securityLogger
};
```

**セキュリティイベントの記録:**

主要な場所で `logger.security` を使用:

```javascript
// 署名検証失敗
logger.security.warn('Signature verification failed', {
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  timestamp: new Date().toISOString()
});

// トークン検証失敗
logger.security.warn('Invalid stream token', {
  trackId,
  ip: req.ip,
  timestamp: new Date().toISOString()
});

// レート制限違反 (Cloudflareが処理するが、到達した場合)
logger.security.warn('Suspicious request rate', {
  ip: req.ip,
  endpoint: req.path,
  count: requestCount
});
```

#### 2.3.2 セキュリティアラート設定

**ログ監視スクリプト:**

新規ファイル: `scripts/monitor-security.sh`

```bash
#!/bin/bash
# Security log monitor - alerts on suspicious activity

SECURITY_LOG="logs/security.log"
THRESHOLD=10  # Alert if more than 10 failures in 5 minutes

# Count recent signature verification failures
RECENT_FAILURES=$(tail -n 1000 "$SECURITY_LOG" | \
  grep -c "Signature verification failed" | \
  tail -n $THRESHOLD)

if [ "$RECENT_FAILURES" -gt "$THRESHOLD" ]; then
  echo "⚠️  SECURITY ALERT: $RECENT_FAILURES signature verification failures detected"
  echo "Check logs: tail -f $SECURITY_LOG"
  # Send notification (email, Slack, etc.)
fi
```

**Cron設定 (5分ごと):**
```bash
*/5 * * * * /Users/shiwei.zhu/Claude/alexa-music-server/scripts/monitor-security.sh
```

### Phase 2 完了条件

✅ **以下がすべて達成された場合、Phase 3に進む:**
- [ ] JWT stream token実装完了
- [ ] Alexa Controllerでトークン生成確認
- [ ] Stream Controllerでトークン検証確認
- [ ] トークンなしアクセスが正しくブロックされる
- [ ] Cloudflare WAF AS16509許可リスト設定完了
- [ ] レート制限ルール設定完了
- [ ] CORS制限実装完了
- [ ] セキュリティログ記録確認
- [ ] Simulator + 実機テスト成功
- [ ] 48時間の安定稼働確認

**Phase 2 の影響範囲:**
- 変更ファイル:
  - `src/utils/streamTokens.js` (新規)
  - `src/controllers/alexaController.js`
  - `src/controllers/streamController.js`
  - `src/index.js` (CORS)
  - `src/utils/logger.js`
  - `.env`
- Cloudflare設定: WAFルール追加
- ダウンタイム: 最小（段階的デプロイ可能）
- リスク: 中（ストリーミングURL変更）

---

## Phase 3: Cloudflare Workers完全移行

**目的**: より高いセキュリティと信頼性のためWorkers環境へ完全移行
**期間**: 8-12時間
**優先度**: 🟡 中
**リスク**: 中（新デプロイメント環境への移行）

### 3.1 Workers vs Tunnel 比較分析

#### アーキテクチャ比較

**現在のセットアップ (Cloudflare Tunnel + Express):**
```
Echo Device
    ↓
Alexa Service
    ↓
Cloudflare (Public DNS)
    ↓
Cloudflare Tunnel (cloudflared)
    ↓
Local Mac (Express Server)
    ↓
Local MP3 Files
```

**推奨セットアップ (Cloudflare Workers):**
```
Echo Device
    ↓
Alexa Service
    ↓
Cloudflare Workers (Edge Network)
    ↓ (KV + Durable Objects)
    ↓ (Google Drive Proxy)
MP3 Files (Google Drive)
```

#### 詳細比較表

| 項目 | Cloudflare Tunnel | Cloudflare Workers |
|-----|------------------|-------------------|
| **サーバー露出** | ローカルMacを露出 | エッジのみ、サーバーなし ✅ |
| **単一障害点** | Mac (停止=サービス停止) | 分散型、自己修復 ✅ |
| **信頼性** | 95-98% (Macに依存) | 99.95%+ (Cloudflare SLA) ✅ |
| **DDoS保護** | 手動設定必要 | 自動スケーリング ✅ |
| **秘密管理** | .envファイル (物理アクセスリスク) | Wrangler secrets (暗号化) ✅ |
| **デプロイ速度** | サーバー再起動必要 | グローバル即時デプロイ ✅ |
| **物理セキュリティ** | Mac物理アクセス=侵害 | 物理サーバーなし ✅ |
| **運用コスト** | Mac 24/7稼働 (電気代) | 無料枠で十分 ✅ |
| **スケーリング** | 手動 | 自動 ✅ |
| **地理分散** | 単一拠点 | 世界175+データセンター ✅ |
| **セッション管理** | メモリ (再起動で消失) | Durable Objects (永続) ✅ |

**結論: Workers移行のメリットは明確**

### 3.2 Workers環境のセキュリティ強化

#### 現在のWorkers実装の問題点

**Critical Issue: 署名検証なし**

`deploy-workers/src/index.js` (line 196-208):
```javascript
// Alexa skill endpoint
if (path === '/alexa' && request.method === 'POST') {
  const alexaRequest = await request.json();
  // ⚠️ NO VERIFICATION - directly processes request
}
```

**これはExpress実装からの後退です。**

#### 3.2.1 Workers用Alexa署名検証実装

**課題:**
- Node.jsの `alexa-verifier` ライブラリはWorkers環境で動作しない
- Workers環境ではWeb Crypto APIを使用する必要がある
- X.509証明書の解析が必要

**実装オプション:**

**オプションA: 完全カスタム実装 (推奨)**

新規ファイル: `deploy-workers/src/middleware/alexaVerifier.js`

```javascript
/**
 * Alexa Request Signature Verification for Cloudflare Workers
 * Uses Web Crypto API for certificate validation
 */

const CERT_CACHE_TTL = 3600; // 1 hour

export class AlexaVerifier {
  constructor(certCacheKV) {
    this.certCache = certCacheKV; // KV namespace for caching
  }

  /**
   * Main verification method
   * @param {Request} request - Cloudflare Request object
   * @param {string} requestBody - Stringified request body
   * @returns {Promise<boolean>}
   */
  async verify(request, requestBody) {
    const certUrl = request.headers.get('SignatureCertChainUrl');
    const signature = request.headers.get('Signature');

    if (!certUrl || !signature) {
      throw new Error('Missing signature headers');
    }

    // Step 1: Validate certificate URL format
    if (!this.isValidCertUrl(certUrl)) {
      throw new Error('Invalid certificate URL format');
    }

    // Step 2: Download certificate (with caching)
    const certPem = await this.getCertificate(certUrl);

    // Step 3: Parse certificate and extract public key
    const publicKey = await this.extractPublicKey(certPem);

    // Step 4: Verify signature
    const isValid = await this.verifySignature(
      publicKey,
      signature,
      requestBody
    );

    if (!isValid) {
      throw new Error('Invalid signature');
    }

    // Step 5: Verify timestamp
    const alexaRequest = JSON.parse(requestBody);
    this.verifyTimestamp(alexaRequest);

    return true;
  }

  /**
   * Validate certificate URL per Amazon spec
   * https://developer.amazon.com/docs/custom-skills/host-a-custom-skill-as-a-web-service.html#checking-the-signature-of-the-request
   */
  isValidCertUrl(url) {
    try {
      const parsed = new URL(url);

      // Must be HTTPS
      if (parsed.protocol !== 'https:') return false;

      // Must be from s3.amazonaws.com OR s3.amazonaws.com-[region]
      const validHosts = [
        's3.amazonaws.com',
        's3.amazonaws.com-global'
      ];

      const isValidHost = validHosts.some(host =>
        parsed.hostname === host || parsed.hostname.startsWith('s3.amazonaws.com-')
      );

      if (!isValidHost) return false;

      // Path must start with /echo.api/
      if (!parsed.pathname.startsWith('/echo.api/')) return false;

      // Port must be 443 (or default for HTTPS)
      if (parsed.port && parsed.port !== '443') return false;

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Download and cache certificate
   */
  async getCertificate(certUrl) {
    // Check cache
    if (this.certCache) {
      const cached = await this.certCache.get(certUrl);
      if (cached) {
        console.log('Certificate cache hit', { certUrl });
        return cached;
      }
    }

    // Download certificate
    console.log('Downloading certificate', { certUrl });
    const response = await fetch(certUrl);

    if (!response.ok) {
      throw new Error(`Certificate download failed: ${response.status}`);
    }

    const certPem = await response.text();

    // Validate PEM format
    if (!certPem.includes('-----BEGIN CERTIFICATE-----')) {
      throw new Error('Invalid certificate format');
    }

    // Cache certificate
    if (this.certCache) {
      await this.certCache.put(certUrl, certPem, {
        expirationTtl: CERT_CACHE_TTL
      });
    }

    return certPem;
  }

  /**
   * Extract public key from PEM certificate
   * This is simplified - production should validate full certificate chain
   */
  async extractPublicKey(certPem) {
    // Remove PEM headers/footers and whitespace
    const pemContents = certPem
      .replace(/-----BEGIN CERTIFICATE-----/, '')
      .replace(/-----END CERTIFICATE-----/, '')
      .replace(/\s/g, '');

    // Decode base64 to ArrayBuffer
    const binaryDer = this.base64ToArrayBuffer(pemContents);

    // Parse DER-encoded certificate
    // In production, use a proper X.509 parser library
    // For now, we'll use a simplified approach

    try {
      // Import certificate as SPKI (Subject Public Key Info)
      // Note: This is a simplified implementation
      // A full implementation should:
      // 1. Parse X.509 certificate structure
      // 2. Validate certificate chain
      // 3. Check expiration dates
      // 4. Verify Subject Alternative Names includes "echo-api.amazon.com"

      const publicKey = await crypto.subtle.importKey(
        'spki',
        binaryDer,
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256'
        },
        false,
        ['verify']
      );

      return publicKey;
    } catch (error) {
      console.error('Failed to extract public key', error);
      throw new Error('Certificate parsing failed');
    }
  }

  /**
   * Verify RSA-SHA256 signature
   */
  async verifySignature(publicKey, signatureBase64, requestBody) {
    try {
      // Decode signature from base64
      const signatureBuffer = this.base64ToArrayBuffer(signatureBase64);

      // Convert request body to ArrayBuffer
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(requestBody);

      // Verify using RSA-SHA256
      const isValid = await crypto.subtle.verify(
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: { name: 'SHA-256' }
        },
        publicKey,
        signatureBuffer,
        dataBuffer
      );

      return isValid;
    } catch (error) {
      console.error('Signature verification failed', error);
      return false;
    }
  }

  /**
   * Verify request timestamp (150-second window)
   */
  verifyTimestamp(alexaRequest) {
    const timestamp = alexaRequest.request?.timestamp;

    if (!timestamp) {
      throw new Error('Missing request timestamp');
    }

    const requestTime = new Date(timestamp).getTime();
    const now = Date.now();
    const timeDifference = Math.abs(now - requestTime);

    // Amazon specification: 150 seconds
    if (timeDifference > 150000) {
      throw new Error(`Request timestamp too old: ${timeDifference}ms`);
    }
  }

  /**
   * Base64 to ArrayBuffer conversion
   */
  base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
```

**注意事項:**
- 上記実装は簡略化されています
- 本番環境では完全なX.509証明書チェーン検証が必要
- Subject Alternative Namesの検証が必要
- 証明書の有効期限チェックが必要

**オプションB: Cloudflare Workers専用ライブラリの調査**

調査タスク:
- [ ] `@cloudflare/workers-types` で利用可能なライブラリを確認
- [ ] サードパーティのWorkers互換Alexa検証ライブラリを調査
- [ ] 必要に応じてオプションAの完全実装に進む

#### 3.2.2 Workers設定ファイルの更新

**`deploy-workers/wrangler.toml` に追加:**

```toml
# KV Namespace for certificate caching
[[kv_namespaces]]
binding = "CERT_CACHE"
id = "CREATE_THIS"  # Run: wrangler kv:namespace create "CERT_CACHE"
preview_id = "CREATE_THIS"  # Run: wrangler kv:namespace create "CERT_CACHE" --preview

# Environment variables
[vars]
ALEXA_VERIFY_SIGNATURE = "true"
PUBLIC_URL = "https://alexa-music-workers.swiftzhu.workers.dev"
```

**KV Namespace作成:**

```bash
cd /Users/shiwei.zhu/Claude/alexa-music-server/deploy-workers

# Production namespace
npx wrangler kv:namespace create "CERT_CACHE"
# Output: { binding = "CERT_CACHE", id = "abc123..." }

# Preview namespace (for testing)
npx wrangler kv:namespace create "CERT_CACHE" --preview
# Output: { binding = "CERT_CACHE", preview_id = "xyz789..." }

# Update wrangler.toml with the IDs
```

**Secrets設定:**

```bash
# JWT secret for stream tokens
npx wrangler secret put JWT_SECRET
# Enter: <64-character hex string from crypto.randomBytes(32)>

# Alexa Skill ID
npx wrangler secret put ALEXA_SKILL_ID
# Enter: amzn1.ask.skill.a2728c88-5b40-4ae2-8b33-f0a5660ac8ab

# Verify secrets
npx wrangler secret list
```

#### 3.2.3 Workers Main Handler更新

**`deploy-workers/src/index.js` の更新:**

```javascript
import { AlexaVerifier } from './middleware/alexaVerifier';
import { generateStreamToken, verifyStreamToken } from './utils/streamTokens';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Initialize Alexa verifier with KV cache
    const alexaVerifier = new AlexaVerifier(env.CERT_CACHE);

    // Alexa skill endpoint
    if (path === '/alexa' && request.method === 'POST') {
      try {
        // Read request body
        const requestBody = await request.text();

        // Verify Alexa signature
        if (env.ALEXA_VERIFY_SIGNATURE === 'true') {
          await alexaVerifier.verify(request, requestBody);
          console.log('✅ Alexa request verified successfully');
        } else {
          console.warn('⚠️  Signature verification DISABLED');
        }

        // Parse and process request
        const alexaRequest = JSON.parse(requestBody);

        // ... existing Alexa request handling ...

      } catch (error) {
        console.error('❌ Alexa verification failed', {
          error: error.message,
          ip: request.headers.get('CF-Connecting-IP')
        });

        return new Response(
          JSON.stringify({
            version: '1.0',
            response: {
              outputSpeech: {
                type: 'PlainText',
                text: 'リクエストの認証に失敗しました。'
              },
              shouldEndSession: true
            }
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // Stream endpoint with token validation
    if (path.startsWith('/stream/') && request.method === 'GET') {
      const trackId = path.replace('/stream/', '');
      const token = url.searchParams.get('token');

      // Validate token
      if (!token) {
        console.warn('Stream request without token', { trackId });
        return new Response('Missing authentication token', { status: 401 });
      }

      const decoded = await verifyStreamToken(token, env.JWT_SECRET);
      if (!decoded || decoded.trackId !== trackId) {
        console.warn('Invalid stream token', { trackId });
        return new Response('Invalid or expired token', { status: 403 });
      }

      console.log('✅ Stream token validated', { trackId });

      // ... existing streaming logic ...
    }

    // ... other routes ...
  }
};
```

#### 3.2.4 Workers用JWT実装

**新規ファイル: `deploy-workers/src/utils/streamTokens.js`**

```javascript
/**
 * JWT Stream Token utilities for Cloudflare Workers
 * Uses Web Crypto API (jose library alternative)
 */

/**
 * Generate JWT token using Web Crypto API
 */
export async function generateStreamToken(trackId, skillId, secret, expiresIn = 3600) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    trackId,
    skillId,
    type: 'stream',
    iat: now,
    exp: now + expiresIn,
    iss: 'alexa-music-workers',
    sub: trackId
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  // Create signature
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await signHS256(signatureInput, secret);

  return `${signatureInput}.${signature}`;
}

/**
 * Verify JWT token
 */
export async function verifyStreamToken(token, secret) {
  try {
    const [encodedHeader, encodedPayload, signature] = token.split('.');

    if (!encodedHeader || !encodedPayload || !signature) {
      return null;
    }

    // Verify signature
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = await signHS256(signatureInput, secret);

    if (signature !== expectedSignature) {
      console.warn('Token signature mismatch');
      return null;
    }

    // Decode payload
    const payload = JSON.parse(base64UrlDecode(encodedPayload));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.warn('Token expired', {
        exp: payload.exp,
        now: now
      });
      return null;
    }

    // Check type
    if (payload.type !== 'stream') {
      console.warn('Invalid token type', { type: payload.type });
      return null;
    }

    return payload;
  } catch (error) {
    console.error('Token verification error', error);
    return null;
  }
}

/**
 * Sign data using HMAC-SHA256
 */
async function signHS256(data, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data)
  );

  return base64UrlEncode(signature);
}

/**
 * Base64 URL encode
 */
function base64UrlEncode(input) {
  let base64;

  if (typeof input === 'string') {
    base64 = btoa(input);
  } else {
    // ArrayBuffer
    const bytes = new Uint8Array(input);
    const binary = String.fromCharCode(...bytes);
    base64 = btoa(binary);
  }

  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(input) {
  // Add padding
  const pad = input.length % 4;
  if (pad) {
    input += '='.repeat(4 - pad);
  }

  // Replace URL-safe characters
  const base64 = input
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  return atob(base64);
}
```

### 3.3 移行手順

#### 3.3.1 準備フェーズ

**チェックリスト:**
- [ ] Workers実装の署名検証完了
- [ ] Workers実装のJWTトークン完了
- [ ] KV Namespace作成・設定完了
- [ ] Secrets設定完了
- [ ] ローカルテスト (`wrangler dev`) 成功

**ローカルテスト:**

```bash
cd /Users/shiwei.zhu/Claude/alexa-music-server/deploy-workers

# Development server
npm run dev
# または
npx wrangler dev

# Test endpoint
curl -X POST http://localhost:8787/alexa \
  -H "Content-Type: application/json" \
  -d '{"version":"1.0","request":{"type":"LaunchRequest"}}'

# Expected: 401 (missing signature headers)
```

#### 3.3.2 デプロイフェーズ

**ステージング環境デプロイ (推奨):**

```bash
# Create staging environment
npx wrangler publish --env staging

# Test with staging URL
# Update Alexa skill temporarily to staging endpoint
```

**本番デプロイ:**

```bash
cd /Users/shiwei.zhu/Claude/alexa-music-server/deploy-workers

# Deploy to production
npm run deploy
# または
npx wrangler publish

# Verify deployment
curl https://alexa-music-workers.swiftzhu.workers.dev/health

# Expected: {"status":"ok",...}
```

#### 3.3.3 Alexaスキル設定更新

**Amazon Developer Consoleでの変更:**

1. **https://developer.amazon.com/alexa/console/ask にアクセス**

2. **スキル「モカモカ」を選択**

3. **Build → Endpoint**
   - Endpoint Type: HTTPS
   - Default Region: `https://alexa-music-workers.swiftzhu.workers.dev/alexa`
   - SSL Certificate Type: Wildcard certificate

4. **Save Endpoints**

5. **Interaction Model → Build Model**

6. **Test タブで動作確認**
   ```
   Input: "モカモカを開いて"
   Expected: 正常な応答
   ```

#### 3.3.4 並行稼働フェーズ (1週間推奨)

**目的:**
- Workers実装の安定性確認
- 問題発生時の即座のロールバック準備

**モニタリング:**

```bash
# Workers logs (real-time)
cd /Users/shiwei.zhu/Claude/alexa-music-server/deploy-workers
npm run tail

# 確認するログ:
# - ✅ Alexa request verified successfully
# - ✅ Stream token validated
# - ❌ がないこと (エラーなし)
```

**テストシナリオ:**

1. **通常再生**
   - "アレクサ、モカモカを開いて"
   - "再生して 江戸時代初期"
   - 期待: 正常に再生

2. **一時停止・再開**
   - "一時停止"
   - （数分待機）
   - "再開"
   - 期待: 正しい位置から再開

3. **スキップ操作**
   - "次の曲"
   - "前の曲"
   - 期待: 正常に動作

4. **長時間再生**
   - 1曲フル再生（5-10分）
   - 期待: 途切れずに再生

5. **複数デバイステスト**
   - 異なるEchoデバイスで同時テスト
   - 期待: セッション分離が正常

**問題発生時のロールバック:**

```bash
# Alexa Developer Console → Endpoint
# URL を元に戻す:
# https://alexa-music.moerin.com/alexa

# Save Endpoints → Build Model
```

#### 3.3.5 Tunnel停止フェーズ

**条件:**
- Workers実装が1週間安定稼働
- すべてのテストシナリオが成功
- ログにエラーなし

**停止手順:**

```bash
# 1. PM2で管理している場合
pm2 stop alexa-music-server
pm2 stop cloudflare-tunnel
pm2 delete alexa-music-server
pm2 delete cloudflare-tunnel
pm2 save

# 2. 手動実行の場合
# プロセスを Ctrl+C で停止

# 3. Tunnel設定のバックアップ (念のため)
cp ~/.cloudflared/config.yml ~/.cloudflared/config.yml.backup

# 4. Express server プロセス確認
ps aux | grep node
# 念のためすべてのNode.jsプロセスを確認

# 5. ポート確認
lsof -i :3000
# 3000番ポートが開放されていることを確認
```

**ロールバック準備 (停止後1ヶ月保持):**

- `.env` ファイルは保持
- `src/` ディレクトリは保持
- `~/.cloudflared/` ディレクトリは保持
- 緊急時は `npm start` と `npm run tunnel` で即座に復旧可能

### 3.4 Workers環境の継続的セキュリティ

#### 3.4.1 定期的なセキュリティレビュー

**月次タスク:**
- [ ] Cloudflare Analytics dashboardでトラフィック確認
- [ ] Workers logsで異常なパターン検索
- [ ] KV使用量確認（無料枠内か）
- [ ] Durable Objects使用量確認

**四半期タスク:**
- [ ] JWT_SECRETのローテーション
- [ ] WAFルールの見直し
- [ ] レート制限閾値の調整
- [ ] Amazonセキュリティドキュメントの更新確認

**JWT Secretローテーション手順:**

```bash
cd /Users/shiwei.zhu/Claude/alexa-music-server/deploy-workers

# 1. 新しいシークレット生成
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. 新しいシークレットを設定
npx wrangler secret put JWT_SECRET
# Enter: <新しい64文字の16進数文字列>

# 3. デプロイ (自動的にローテーション完了)
npm run deploy

# 注意: 既存のストリームトークンは無効化されます
# 影響: 現在再生中のセッションはエラーになる可能性
# 推奨: 深夜など使用が少ない時間帯に実施
```

#### 3.4.2 モニタリングとアラート

**Cloudflare Workers Analytics設定:**

1. **Cloudflare Dashboard → Workers & Pages → alexa-music-workers**

2. **Metrics タブ**
   - リクエスト数の推移を確認
   - エラー率を確認（目標: <1%）
   - CPU時間を確認

3. **Notifications (有料プランのみ)**
   - Error Rate Alert: >5% 5xx responses
   - Traffic Spike Alert: >1000 requests/hour

**ログ分析スクリプト:**

```bash
# Workers logs 保存 (定期実行推奨)
npx wrangler tail --format json > logs/workers-$(date +%Y%m%d).log

# セキュリティイベント抽出
cat logs/workers-*.log | grep -i "verification failed\|invalid token\|missing signature"

# トップIP分析
cat logs/workers-*.log | jq -r '.headers."CF-Connecting-IP"' | sort | uniq -c | sort -rn | head -20
```

### Phase 3 完了条件

✅ **以下がすべて達成された場合、実装完了:**
- [ ] Workers実装に完全な署名検証実装
- [ ] Workers実装にJWTトークン認証実装
- [ ] KV Namespace設定完了
- [ ] Secrets設定完了
- [ ] ローカルテスト成功
- [ ] 本番デプロイ成功
- [ ] Alexaスキルエンドポイント更新完了
- [ ] 全テストシナリオ成功
- [ ] 1週間の安定稼働確認
- [ ] Express + Tunnel停止完了
- [ ] モニタリング設定完了
- [ ] ドキュメント更新完了

**Phase 3 の影響範囲:**
- 変更ファイル:
  - `deploy-workers/src/middleware/alexaVerifier.js` (新規)
  - `deploy-workers/src/utils/streamTokens.js` (新規)
  - `deploy-workers/src/index.js` (大幅更新)
  - `deploy-workers/wrangler.toml`
- Cloudflare設定: KV Namespace追加、Secrets追加
- Alexaスキル設定: Endpoint URL変更
- ダウンタイム: ゼロ（並行稼働後に切り替え）
- リスク: 中（新環境への移行だがロールバック可能）

---

## 📚 補足資料

### A. セキュリティベストプラクティス

#### A.1 シークレット管理

**DO (推奨):**
- ✅ 環境変数または Wrangler secrets を使用
- ✅ `.env` ファイルは `.gitignore` に含める
- ✅ シークレットは定期的にローテーション
- ✅ 本番とテスト環境で異なるシークレット使用
- ✅ シークレットは最小権限の原則に従う

**DON'T (禁止):**
- ❌ コードにシークレットをハードコーディング
- ❌ Gitにシークレットをコミット
- ❌ ログにシークレットを出力
- ❌ 複数環境で同じシークレットを共有
- ❌ 平文でシークレットを保存

#### A.2 エラーハンドリング

**セキュアなエラーメッセージ:**

```javascript
// ❌ Bad: 詳細すぎる情報を返す
return res.status(401).json({
  error: 'Certificate download failed from s3.amazonaws.com/echo.api/cert-123.pem',
  details: error.stack
});

// ✅ Good: 一般的なメッセージ、詳細はログのみ
logger.error('Certificate download failed', {
  certUrl: certUrl,
  error: error.message
});
return res.status(401).json({
  error: 'Authentication failed',
  message: 'Unable to verify request'
});
```

#### A.3 ログ記録のベストプラクティス

**記録すべき情報:**
- ✅ リクエストタイプ、タイムスタンプ
- ✅ 検証成功・失敗の結果
- ✅ IPアドレス (プライバシーに配慮)
- ✅ User-Agent (攻撃パターン分析用)

**記録してはいけない情報:**
- ❌ リクエストボディ全体 (セッションIDなど含む可能性)
- ❌ 署名の内容 (リプレイ攻撃に利用される可能性)
- ❌ シークレット、トークン
- ❌ 個人を特定できる情報 (GDPR対応)

### B. トラブルシューティングガイド

#### B.1 署名検証失敗

**症状:**
```
❌ Alexa signature verification failed
```

**診断手順:**

1. **ヘッダーの存在確認**
   ```javascript
   console.log('Headers:', {
     certUrl: req.headers['signaturecertchainurl'],
     signature: req.headers['signature']
   });
   ```

2. **証明書URLの検証**
   ```bash
   # 手動で証明書をダウンロード
   curl "https://s3.amazonaws.com/echo.api/echo-api-cert-XYZ.pem"
   ```

3. **タイムスタンプ確認**
   ```bash
   # サーバーの時刻を確認
   date
   # NTPで同期
   sudo ntpdate -u time.apple.com
   ```

4. **ネットワーク確認**
   ```bash
   # S3へのアクセス確認
   ping s3.amazonaws.com
   curl -I https://s3.amazonaws.com
   ```

#### B.2 ストリーミングが開始しない

**症状:**
```
GET /stream/:trackId?token=...
403 Forbidden - Invalid or expired token
```

**診断手順:**

1. **トークン生成確認**
   ```javascript
   // Alexa Controller
   console.log('Generated token:', token);
   console.log('Token payload:', jwt.decode(token));
   ```

2. **トークン有効期限確認**
   ```javascript
   const decoded = jwt.decode(token);
   console.log('Token expires at:', new Date(decoded.exp * 1000));
   console.log('Current time:', new Date());
   ```

3. **トラックID一致確認**
   ```javascript
   console.log('Token trackId:', decoded.trackId);
   console.log('Requested trackId:', req.params.trackId);
   ```

#### B.3 Workers デプロイエラー

**症状:**
```
Error: Failed to publish
```

**診断手順:**

1. **wrangler.toml 構文確認**
   ```bash
   npx wrangler publish --dry-run
   ```

2. **KV Namespace 確認**
   ```bash
   npx wrangler kv:namespace list
   ```

3. **Secrets 確認**
   ```bash
   npx wrangler secret list
   ```

4. **ログ確認**
   ```bash
   npx wrangler tail
   ```

### C. パフォーマンス最適化

#### C.1 証明書キャッシング

**効果測定:**

```javascript
// Before caching
// First request: ~150ms (download + verify)
// Subsequent: ~150ms (re-download + verify)

// After KV caching
// First request: ~150ms (download + cache + verify)
// Subsequent: ~20ms (cache hit + verify)
```

**最適化設定:**

```javascript
// Adjust cache TTL based on certificate validity
const CERT_CACHE_TTL = 3600; // 1 hour (推奨)

// Amazonの証明書は通常数ヶ月有効だが、
// 短めのTTLでセキュリティとパフォーマンスをバランス
```

#### C.2 レート制限の調整

**現在の設定:**
- `/alexa`: 60 req/min
- `/stream/*`: 100 req/min

**使用パターン分析:**

```bash
# 実際の使用頻度を測定
grep "Alexa Request" logs/app.log | wc -l  # 1日あたりのAlexaリクエスト
grep "Streaming" logs/app.log | wc -l     # 1日あたりのストリームリクエスト

# 平均と最大値を計算
# 必要に応じて閾値を調整
```

### D. 用語集

| 用語 | 説明 |
|-----|------|
| **ASN** | Autonomous System Number - インターネット上の組織を識別する番号。AS16509はAmazon |
| **JWT** | JSON Web Token - デジタル署名されたトークン形式 |
| **KV** | Key-Value store - Cloudflareの分散キーバリューストレージ |
| **CORS** | Cross-Origin Resource Sharing - ブラウザのセキュリティ機能 |
| **WAF** | Web Application Firewall - Webアプリケーション保護のためのファイアウォール |
| **Durable Objects** | Cloudflareの状態を持つエッジコンピューティングサービス |
| **Subject Alternative Names** | SSL証明書に含まれる追加のホスト名 |
| **RSASSA-PKCS1-v1_5** | RSA署名アルゴリズム |
| **X.509** | 公開鍵証明書の標準フォーマット |
| **SPKI** | Subject Public Key Info - 公開鍵情報の形式 |

---

## 📝 実装チェックリスト

### Phase 1: 最小限の即時修正
- [ ] `alexa-verifier` パッケージインストール
- [ ] `alexaVerification.js` 更新
- [ ] `.env` で `ALEXA_VERIFY_SIGNATURE=true` 設定
- [ ] Simulatorテスト成功
- [ ] 実機テスト成功
- [ ] 不正アクセステスト成功
- [ ] 24時間安定稼働確認

### Phase 2: 完全なセキュリティ実装
- [ ] JWT ライブラリインストール
- [ ] JWT_SECRET生成・設定
- [ ] `streamTokens.js` 作成
- [ ] Alexa Controller更新（トークン生成）
- [ ] Stream Controller更新（トークン検証）
- [ ] トークンなしアクセスブロック確認
- [ ] Cloudflare WAF AS16509設定
- [ ] レート制限ルール設定
- [ ] CORS制限実装
- [ ] セキュリティログ設定
- [ ] 48時間安定稼働確認

### Phase 3: Workers移行
- [ ] Workers署名検証実装
- [ ] Workers JWT実装
- [ ] KV Namespace作成
- [ ] Secrets設定
- [ ] wrangler.toml更新
- [ ] ローカルテスト成功
- [ ] 本番デプロイ成功
- [ ] Alexaエンドポイント更新
- [ ] 全テストシナリオ成功
- [ ] 1週間並行稼働
- [ ] Tunnel停止
- [ ] モニタリング設定
- [ ] ドキュメント更新

---

## 🎓 学習リソース

### Amazon Alexa セキュリティ
- [Host a Custom Skill as a Web Service](https://developer.amazon.com/docs/custom-skills/host-a-custom-skill-as-a-web-service.html)
- [Alexa Request Signature Verification](https://developer.amazon.com/docs/custom-skills/host-a-custom-skill-as-a-web-service.html#checking-the-signature-of-the-request)

### Cloudflare Workers
- [Workers Documentation](https://developers.cloudflare.com/workers/)
- [Workers Web Crypto API](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [KV Storage](https://developers.cloudflare.com/workers/runtime-apis/kv/)
- [Durable Objects](https://developers.cloudflare.com/workers/runtime-apis/durable-objects/)

### Cloudflare Security
- [WAF Custom Rules](https://developers.cloudflare.com/waf/custom-rules/)
- [Rate Limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)

### Web Cryptography
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [JWT RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519)
- [X.509 Certificates](https://datatracker.ietf.org/doc/html/rfc5280)

---

## 📧 サポート

### 問題が発生した場合

1. **ログを確認**
   ```bash
   tail -f logs/app.log              # Express
   npx wrangler tail                 # Workers
   tail -f logs/security.log         # セキュリティイベント
   ```

2. **このドキュメントのトラブルシューティングセクション参照**

3. **Alexaスキルをロールバック**
   - Developer Console → Endpoint → 元のURLに戻す

4. **Gitでコードをロールバック**
   ```bash
   git log
   git checkout <前の安定版コミット>
   ```

5. **GitHub Issueを作成**
   - リポジトリ: `alexa-music-server`
   - 必要情報: エラーログ、再現手順、環境情報

---

**このドキュメントは実装中に随時更新してください。**

**作成者**: Claude Code (network-security-expert agent)
**最終更新**: 2025-12-15
**バージョン**: 1.0
