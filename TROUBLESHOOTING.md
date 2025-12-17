# Troubleshooting Guide

このドキュメントは、Alexaスキル開発で遭遇した問題と解決策を記録しています。

---

## 🚨 シミュレーターは動くが、Echo実機で「お役に立てません」エラーが出る

### ⚠️ amazon.com vs amazon.co.jp Account Separation Issue

**THE MOST COMMON ISSUE FOR JAPANESE DEVELOPERS:**

### 問題の概要

amazon.comとamazon.co.jpは**完全に別のアカウントシステム**です。同じメールアドレスを使用していても、異なるパスワードで別々のアカウントを持つことができます。ブラウザのパスワードマネージャーがこれらを別々に保存するため、気づきにくい問題です。

### 症状

- ✅ Alexa Skills Kit Developer Consoleのシミュレーターでは完璧に動作
- ❌ 実際のEcho実機では「お役に立てません」というエラー
- ❌ サーバーログに実機からのリクエストが全く記録されない
- ❌ Alexaアプリでスキルが表示されない、または見つからない

### 根本原因

1. 開発者がamazon.com Developer Consoleでスキルを作成
2. Echoデバイスがamazon.co.jpアカウントに登録されている
3. 同じメールアドレスだが、**実際には別のアカウント**
4. スキルは.comに存在し、デバイスは.co.jpに存在 → 接続なし

### 診断方法

#### Developer Consoleのアカウントを確認

```bash
# ステップ1: Developer Consoleにアクセス
# https://developer.amazon.com/alexa/console/ask

# ステップ2: 画面右上を確認
# - 表示されているメールアドレスを確認
# - URLに ".com" か ".co.jp" が含まれているか確認

# ステップ3: スキル一覧を確認
# - 作成したスキルが表示されているか
```

#### Echoデバイスのアカウントを確認

```bash
# ステップ1: Alexaアプリを開く（スマートフォン）

# ステップ2: メニューを開く
# その他 → 設定 → アカウントの設定

# ステップ3: 登録されているメールアドレスを確認

# ステップ4: どのAmazonサイトか確認
# - amazon.com
# - amazon.co.jp
```

#### 重要な確認ポイント

**Developer ConsoleとEchoデバイスのアカウントが一致している必要があります！**

### 解決策

2つのアプローチがあります：

---

#### 解決策A: 正しいアカウントでDeveloper Consoleにログイン（推奨）

Echoがamazon.co.jpアカウントに登録されている場合、amazon.co.jpのアカウント情報でDeveloper Consoleにログインする必要があります。

**手順:**

1. **すべてのAmazonサイトからログアウト**
   - amazon.com
   - amazon.co.jp
   - developer.amazon.com

2. **ブラウザのキャッシュとCookieをクリア**（Amazonドメイン限定）
   - Chrome: 設定 → プライバシーとセキュリティ → Cookieとサイトデータ
   - 「amazon」で検索して削除

3. **Developer Consoleにアクセス**
   ```
   https://developer.amazon.com/alexa/console/ask
   ```

4. **重要: amazon.co.jpのパスワードでログイン**
   - メールアドレス: （同じメールアドレス）
   - パスワード: **amazon.co.jpで使用しているパスワード**（amazon.comのパスワードではない！）

5. **ログイン成功の確認**
   - 画面右上のアカウント情報を確認
   - スキル一覧を確認

6. **新しいスキルを作成**
   - このアカウントでスキルを作成
   - エンドポイント、インターフェース、配布タブを設定
   - 新しいスキルIDを.envファイルに設定

7. **サーバーを再起動**
   ```bash
   pkill -f "node.*index.js"
   npm start
   ```

8. **Echo実機でテスト**
   ```
   「アレクサ、モカモカを開いて」
   ```

**メリット:**
- ✅ 日本のAmazonサービス（Music JP、Kindle JPなど）が引き続き使える
- ✅ 既存のコンテンツやサブスクリプションに影響しない
- ✅ 推奨される方法

**デメリット:**
- ❌ 既存のスキル（amazon.comアカウント）を作り直す必要がある
- ❌ 新しいスキルIDを取得して設定する必要がある

---

#### 解決策B: Echoをamazon.comアカウントに再登録

**手順:**

1. **Alexaアプリでデバイス登録を解除**
   - Alexaアプリ → デバイス → Echo・Alexa → デバイス選択
   - 設定（歯車アイコン）→ 下にスクロール → **登録の解除**

2. **Alexaアプリからログアウト**
   - その他 → 設定 → 下にスクロール → **サインアウト**

3. **amazon.comアカウントでログイン**
   - メールアドレス: （同じメールアドレス）
   - パスワード: **amazon.comで使用しているパスワード**

4. **Echoデバイスを再セットアップ**
   - Echoのアクションボタンを5秒長押し
   - オレンジ色のライトリングが表示される
   - Alexaアプリで **デバイスを追加** → **Amazon Echo**
   - 画面の指示に従ってセットアップ

5. **Echo実機でテスト**
   ```
   「アレクサ、モカモカを開いて」
   ```

**メリット:**
- ✅ 既存のスキル（amazon.com）をそのまま使える
- ✅ サーバー設定の変更が不要
- ✅ すぐに使える

**デメリット:**
- ❌ amazon.co.jpで購入した音楽・書籍などが使えなくなる
- ❌ Amazon Music JP、Kindle JPなどの日本限定サービスが制限される
- ❌ 日常使用に影響が出る可能性がある

---

### 予防策

将来この問題を避けるための対策：

1. **異なるメールアドレスを使用**
   - amazon.com: `your-email@gmail.com`
   - amazon.co.jp: `your-email+jp@gmail.com` （Gmail の + エイリアス機能）

2. **アカウント情報を明確に文書化**
   ```
   # プロジェクトのREADMEやメモに記録
   Developer Console: amazon.com (your-email@gmail.com)
   Echo Device: amazon.co.jp (your-email+jp@gmail.com)
   ```

3. **アカウント地域を確認する習慣**
   - スキル作成前にDeveloper Consoleのアカウントを確認
   - Echoセットアップ時にどのアカウントか確認

4. **ブラウザの保存パスワードを確認**
   - 設定 → パスワード → 「amazon」で検索
   - 2つの異なるパスワードが保存されていないか確認

---

### 核心的な洞察

**なぜこの問題がわかりにくいのか:**

ブラウザのパスワードマネージャーは、amazon.comとamazon.co.jpのパスワードを**別々に保存**します。メールアドレスを入力すると、ブラウザは自動的にパスワードを入力しますが、**どのパスワードを使うかはコンテキスト（どのAmazonサイトか）に依存します**。

これにより：
- amazon.com にアクセス → amazon.comのパスワードが自動入力
- amazon.co.jp にアクセス → amazon.co.jpのパスワードが自動入力
- developer.amazon.com にアクセス → **どちらのパスワードが入力されるかは運次第**

結果として、2つの別々のアカウントがあることに気づかないまま、長時間デバッグすることになります。

---

## その他のトラブルシューティング

### 配布タブ設定が未完了

**症状:**
- シミュレーターは動くが実機で動かない
- ログにリクエストが来ている場合もある

**解決策:**
Developer Console → 配布タブ → プライバシーとコンプライアンスをすべて回答して保存

---

### AudioPlayerとshouldEndSessionの競合

**症状:**
- AudioPlayer directive を送信後、すぐにセッションが終了
- ストリーミングが開始されない

**解決策:**
AudioPlayer directiveと一緒に`.withShouldEndSession(true)`を設定しない

```javascript
// 間違い
return handlerInput.responseBuilder
  .speak(speakOutput)
  .addDirective(buildAudioDirective('REPLACE_ALL', track))
  .withShouldEndSession(true)  // ← これを削除
  .getResponse();

// 正しい
return handlerInput.responseBuilder
  .speak(speakOutput)
  .addDirective(buildAudioDirective('REPLACE_ALL', track))
  .getResponse();
```

---

### AudioPlayerイベントのsession検証エラー

**症状:**
- AudioPlayerイベント（PlaybackStarted, PlaybackFailedなど）が処理されない

**解決策:**
ミドルウェアで`session`だけでなく`context`もチェックする

```javascript
// 修正前
if (!requestBody || !requestBody.version || !requestBody.session) {
  return res.status(400).json({ error: 'Invalid request' });
}

// 修正後
if (!requestBody || !requestBody.version || (!requestBody.session && !requestBody.context)) {
  return res.status(400).json({ error: 'Invalid request' });
}
```

---

## 🔒 Cloudflare Workers署名検証で401エラー

### 問題の概要

Cloudflare Workersで`ALEXA_VERIFY_SIGNATURE=true`を有効にすると、すべてのAlexaリクエストが401エラーで失敗する。

### 症状

- ✅ `ALEXA_VERIFY_SIGNATURE=false`では正常に動作
- ❌ `ALEXA_VERIFY_SIGNATURE=true`にすると401エラー
- ❌ ログに「Certificate parsing failed」エラー
- ❌ 「Cannot read properties of undefined (reading 'importKey')」エラー
- ❌ 「atob() called with invalid base64-encoded data」エラー

### 根本原因

**複合的な環境互換性問題**：

1. **@peculiar/x509ライブラリの致命的な問題**
   - 動的インポート（`await import('@peculiar/x509')`）がCloudflare WorkersのグローバルCryptoオブジェクトを**汚染**
   - ライブラリ内部のポリフィルが`crypto.subtle`を上書き
   - 結果：`crypto.subtle.importKey`が`undefined`になる

2. **Cloudflare Workersのatob()実装の問題**
   - Workers環境の`atob()`がPEM証明書のbase64と完全互換ではない
   - 改行コード、パディング、特定の文字パターンで失敗
   - エラー：「invalid base64-encoded data」

3. **環境差異**
   - ExpressサーバーのNode.jsでは`alexa-verifier`が完璧に動作
   - Cloudflare Workers（V8 Isolates）では全く異なる動作

### 解決策

**完全カスタム実装でライブラリ依存を排除：**

#### 1. カスタムbase64デコーダーの実装

```javascript
/**
 * Manual base64 decode (for certificate parsing)
 * More reliable than atob() in Cloudflare Workers
 */
base64Decode(base64String) {
  const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < base64Chars.length; i++) {
    lookup[base64Chars.charCodeAt(i)] = i;
  }

  const len = base64String.length;
  let bufferLength = (len * 3) / 4;

  // Handle padding
  if (base64String[len - 1] === '=') {
    bufferLength--;
    if (base64String[len - 2] === '=') {
      bufferLength--;
    }
  }

  const bytes = new Uint8Array(bufferLength);
  let p = 0;

  for (let i = 0; i < len; i += 4) {
    const encoded1 = lookup[base64String.charCodeAt(i)];
    const encoded2 = lookup[base64String.charCodeAt(i + 1)];
    const encoded3 = lookup[base64String.charCodeAt(i + 2)];
    const encoded4 = lookup[base64String.charCodeAt(i + 3)];

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    if (i + 2 < len && base64String[i + 2] !== '=') {
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    }
    if (i + 3 < len && base64String[i + 3] !== '=') {
      bytes[p++] = ((encoded3 & 3) << 6) | encoded4;
    }
  }

  return bytes;
}
```

#### 2. カスタムASN.1パーサーの実装

```javascript
/**
 * Extract SubjectPublicKeyInfo from DER-encoded X.509 certificate
 * This is a simplified ASN.1 parser for extracting SPKI
 */
extractSPKIFromDER(certDer) {
  let offset = 0;

  // Helper to read ASN.1 length
  const readLength = () => {
    let length = certDer[offset++];
    if (length & 0x80) {
      const numBytes = length & 0x7f;
      length = 0;
      for (let i = 0; i < numBytes; i++) {
        length = (length << 8) | certDer[offset++];
      }
    }
    return length;
  };

  // Skip outer SEQUENCE (Certificate)
  if (certDer[offset++] !== 0x30) throw new Error('Invalid certificate structure');
  readLength();

  // Skip TBSCertificate SEQUENCE header
  if (certDer[offset++] !== 0x30) throw new Error('Invalid TBSCertificate structure');
  readLength();

  // Skip version [0] (optional)
  if (certDer[offset] === 0xa0) {
    offset++;
    offset += readLength();
  }

  // Skip serialNumber, signature, issuer, validity, subject
  for (let i = 0; i < 5; i++) {
    if (certDer[offset++] !== (i === 0 ? 0x02 : 0x30)) {
      throw new Error('Invalid certificate structure');
    }
    offset += readLength();
  }

  // Extract SubjectPublicKeyInfo (SEQUENCE)
  if (certDer[offset] !== 0x30) throw new Error('Invalid SPKI structure');
  const spkiStart = offset;
  offset++;
  const spkiLength = readLength();

  return certDer.slice(spkiStart, offset + spkiLength);
}
```

#### 3. package.jsonから@peculiar/x509を削除

```bash
# @peculiar/x509を削除
npm uninstall @peculiar/x509
```

#### 4. 修正後の実装

```javascript
async extractPublicKey(certPem) {
  // Extract only valid base64 characters
  const pemContents = certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/[^A-Za-z0-9+/=]/g, '');  // Remove all non-base64 characters

  // Use manual base64 decode instead of atob()
  const certDer = this.base64Decode(pemContents);

  // Parse DER to extract SubjectPublicKeyInfo
  const spki = this.extractSPKIFromDER(certDer);

  // Import the public key using Web Crypto API
  const publicKey = await crypto.subtle.importKey(
    'spki',
    spki,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['verify']
  );

  return publicKey;
}
```

### 実装済みのセキュリティ機能

修正後、以下のセキュリティ機能が正常に動作：

- ✅ Alexa署名検証（SHA-256対応）
- ✅ 証明書キャッシング（KV、1時間TTL）
- ✅ タイムスタンプ検証（150秒以内）
- ✅ Skill ID検証
- ✅ レート制限（60 requests/minute）

### 重要な教訓

1. **外部ライブラリの環境互換性を過信しない**
   - Node.js用ライブラリがCloudflare Workersで動くとは限らない
   - 特にポリフィルを使うライブラリは危険

2. **環境特有のAPI実装の差異に注意**
   - `atob()`のような基本的な関数でも実装が異なる場合がある

3. **基本的なアルゴリズムの理解が最強の解決策**
   - base64エンコーディング、ASN.1構造、X.509証明書の知識
   - 自前実装により完全な制御が可能

4. **詳細なデバッグログの重要性**
   - 問題の特定には各ステップのログが不可欠
   - 本番環境にデプロイ後はクリーンアップを忘れずに

### 参考リンク

- [Cloudflare Workers - Web Crypto API](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [X.509 Certificate Structure](https://www.rfc-editor.org/rfc/rfc5280)
- [Amazon Alexa Signature Verification](https://developer.amazon.com/docs/custom-skills/host-a-custom-skill-as-a-web-service.html#checking-the-signature-of-the-request)

---

## このプロジェクトの最終設定

### 成功した構成

- **Developer Console**: amazon.com（amazon.co.jpアカウントの認証情報でログイン）
- **Skill ID**: `amzn1.ask.skill.a2728c88-5b40-4ae2-8b33-f0a5660ac8ab`
- **Echo Device**: amazon.co.jpアカウントに登録
- **Result**: ✅ 完全に動作

### 学んだこと

1. amazon.comとamazon.co.jpは完全に別のアカウントシステム
2. ブラウザのパスワードマネージャーが混乱の原因
3. シミュレーターが動いても実機が動かない場合、最初にアカウントを確認すべき
4. 問題解決に数時間かかったが、根本原因は単純なアカウントの不一致だった

---

**最終更新**: 2025-12-13
**プロジェクト**: Alexa Music Server
