# 福島豊さんの公式出演予定 → VRChat向けGET配信

QVC公式ゲストページの公開出演予定を、VRChatから取得できるJSONに変換する小さなサービスです。GitHub Pages用の30分更新設定と、ローカルHTTP用の起動方法を同梱しています。配信状態はGitHub Actionsと公開ページの取得時刻で確認してください。

常駐サーバーを使わずGitHub Actionsが約30分ごとに取得してPagesへJSONを置く構成です。公開条件と制限は [GITHUB_PAGES.md](GITHUB_PAGES.md)、workflowは `.github/workflows/pages.yml` です。以下の `npm start` は従来の常駐サービス案です。

## 動作

- 対象はQVC公式のゲスト1320ページだけです。任意URL・任意ゲストの取得はできません。
- 新しい独立したChromiumでページを読み、遅れて生成される `#program_information` 内のリンクを待ちます。古い空の `.onair_list` は使いません。
- 通常の画像・フォント等も読み込み、公式の出演予定見出しまで通常スクロールした後、最大120秒で遅延表示を待ちます。CAPTCHA対応やボット判定の回避処理はありません。
- 隠れた折り畳み部分も含め、公式ページの全出演予定を取得します。
- リンク `/content/programguide.qvc.YYYYMMddHHmm.html` から年・日付・分を取得し、リンク内のspan（隠れた日付と表示時刻）を除いた番組名を保存します。
- 15分ごとに更新。更新失敗時は前回の正常データを保持し、`stale` を明示します。取得から2時間経過したデータは503と空配列を返し、最新情報のように見せません。
- 公式ページが空・構造変更・エラーの場合、空リストで正常データを上書きしません。
- 通常のユーザーブラウザ、保存ログイン、購入済みアセット、認証キーは読みません。キャッシュはこのフォルダーの `data/cache.json` のみです。

## 準備と起動（未実行）

Node.js 20以上が必要です。Playwrightはnpm公式レジストリで確認した `1.64.1` に固定しています。

```powershell
npm install --ignore-scripts
npx playwright install chromium
npm test
npm start
```

初期設定では `127.0.0.1:8787` のみに待ち受けます。

- `GET /qvc-fukushima.json`: 出演予定と取得時刻・有効期限
- `GET /healthz`: データ鮮度のみ
- GET/HEAD以外は405。任意URLを中継するプロキシ機能はありません。
- ETagと短時間キャッシュを利用します。

必要な場合のみ `QVC_FEED_PORT`、`QVC_FEED_HOST` を設定できます。公開用設定を勝手に適用しないでください。

## ワールドで「いつでも」見るための条件

**ローカル起動だけでは他の参加者には届きません。** ワールドのURLをlocalhostにすると、各参加者自身のPCを指してしまいます。継続運用には、Chromiumを起動できるサーバーと、全参加者が取得できるHTTPSの固定URLが必要です。

公開先・運用費・常駐環境を決めた後、このサービスを配置し、HTTPSの `/qvc-fukushima.json` をUnity側の固定VRCUrlに登録します。外部公開・有料サービスの契約は別途承認が必要です。ブラウザを動かせない静的ホスティング単体では自動取得部分を実行できません。

VRChat側では `status`、`retrievedUtc`、`expiresUtc` を読み、期限切れを「最新」と表示しないでください。ホストによりVRChatの「信頼されていないURLを許可」が必要です。公式ページ/APIの変更・障害・アクセス制限がある場合には取得できません。CAPTCHAやアクセス制限を回避する実装は含めていません。

## JSONの形

```json
{
  "schemaVersion": 1,
  "guestId": "1320",
  "guestName": "福島豊",
  "source": "https://qvc.jp/information/feature/guest/guestpedia/1320.html",
  "retrievedUtc": "2026-10-31T17:00:00.000Z",
  "refreshAfterUtc": "2026-10-31T17:15:00.000Z",
  "expiresUtc": "2026-10-31T19:00:00.000Z",
  "status": "fresh",
  "programmes": [
    {"start": "2026-11-01T19:00:00+09:00", "title": "番組名"}
  ]
}
```

時刻例・番組名例はスキーマ説明用です。正式な終了時刻は出演予定ページにないため、推測した終了時刻は返しません。必要ならUnity側で公式番組表の終了時刻と照合してください。

## 実施済み検証

依存インストールなしでNode組み込みテスト6件成功。正確なリンク日時、外部URL/不正日付排除、重複・矛盾・空データ拒否、キャッシュ鮮度/期限切れ、一時的なローカルHTTPでGET/HEAD/ETag/405/404/503を確認しました。ブラウザ部分は隔離したテストダブルで待機と後始末を確認しました。

Pages案を追加した後は10件成功。静的出力の失敗時保持、HTMLエスケープ、workflowの公開範囲と権限、ロックファイル整合も確認しました。

親が実ブラウザで確認した公式の2エントリーHTMLを元にセレクターを実装しています。ローカル単独のChromium実行はしていません。GitHubの実サイト試行は下記のとおり失敗し、正常取得はまだ確認できていません。

公開後の最初のGitHub実行では、HTTP200後に遅延コンテナー待機が60秒でタイムアウトしました。そのため取得成功とは扱わず、公開用データも生成していません。現在は通常リソースを遮断しない設定、見出しへのスクロール、120秒待機と安全な失敗診断を追加しています。この修正版のGitHub実行結果は別途確認が必要です。

失敗時の診断は、公開ページのtitle/h1、`#program_information` の件数・350文字以内のテキスト、正確なKARTEの2取得先のHTTP状態と公開テーブル選択子だけです。画像・完全HTML・POST全体・APIキー・cookie・認証ヘッダーは記録しません。取得時刻はページ読み込み開始時刻ではなく、実際の抽出完了時刻です。

## 公開資料

- Playwright Library: https://playwright.dev/docs/library
- npm公式メタデータ: https://registry.npmjs.org/playwright/latest （作成時1.64.1、Node>=20）
- KARTEの公式ActionTable API: https://developers.karte.io/reference/actiontable-getbyquery

現状確認した公式サイト内部のActionTable呼出はPOSTです。VRCStringDownloaderがそのまま使える、検証済みのQVC公開GET出演予定APIは見つかっていません。そのため、このサービスで表示後の公式DOMを取得してGET JSONへ変換します。
