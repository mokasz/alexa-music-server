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
