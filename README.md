# 福島豊さんの公式出演予定 → VRChat向けGET配信

QVC公式ゲストページの公開出演予定を、VRChatから取得できるJSONに変換する小さなサービスです。GitHub Pages用の30分更新設定と、ローカルHTTP用の起動方法を同梱しています。配信状態はGitHub Actionsと公開ページの取得時刻で確認してください。

常駐サーバーを使わずGitHub Actionsが約30分ごとに取得してPagesへJSONを置く構成です。公開条件と制限は [GITHUB_PAGES.md](GITHUB_PAGES.md)、workflowは `.github/workflows/pages.yml` です。以下の `npm start` は従来の常駐サービス案です。

## 動作

- 対象はQVC公式のゲスト1320ページだけです。任意URL・任意ゲストの取得はできません。
- 新しい独立したChromiumでページを読み、遅れて生成される `#program_information` 内のリンクを待ちます。古い空の `.onair_list` は使いません。
- 通常の画像・フォント等も読み込み、公式の出演予定見出しまで通常スクロールした後、最大120秒で遅延表示を待ちます。CAPTCHA対応やボット判定の回避処理はありません。
- 隠れた折り畳み部分も含め、公式ページの全出演予定を取得します。
- リンク `/content/programguide.qvc.YYYYMMddHHmm.html` から年・日付・分を取得し、リンク内のspan（隠れた日付と表示時刻）を除いた番組名を保存します。
- ローカル常駐サービスは15分ごとに更新。更新失敗時は前回の正常データを保持し、`stale` を明示します。取得から2時間経過したデータは503と空配列を返し、最新情報のように見せません。
- 公式ページが空・構造変更・エラーの場合、空リストで正常データを上書きしません。
- 通常のユーザーブラウザ、保存ログイン、購入済みアセット、認証キーは読みません。キャッシュはこのフォルダーの `data/cache.json` のみです。

## ローカル常駐サービスの準備と起動

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

## 公開済み配信とワールド接続

[公開JSON](https://parukoro.github.io/qvc-fukushima-feed/qvc-fukushima.json) と [取得状態ページ](https://parukoro.github.io/qvc-fukushima-feed/) をGitHub Pagesで公開済みです。GitHub Actionsが約30分ごとに通常のフルChromium＋XvfbでQVC公式ページを読み、出演予定を更新します。常駐サーバーは不要です。

初回の成功実行は [41252241855](https://github.com/parukoro/qvc-fukushima-feed/actions/runs/41252241855)。build・deploy・番組変更記録が成功し、公開JSONのHTTP200、1762 bytes、11件の出演予定を確認しました。取得は2026年11月1日08:23:57 JST、有効期限は同日10:23:57 JSTです。これはその実行時の証跡であり、現在の鮮度は公開JSONで確認してください。

親担当がUnityの実ClientSimでVRCStringDownloaderの受信、次回11月1日19:00の表示、自動取得済み表示を確認しました。ローカルSDK Buildも61,953,682 bytesで成功（アップロードなし）。実データの出演行がオレンジになることも確認しました。HTTP成功だけでなくJSONの有効期限も確認し、期限切れを最新情報として扱わないでください。VRChat設定によって「信頼されていないURLを許可」が必要です。定期実行の遅延・停止条件は [GITHUB_PAGES.md](GITHUB_PAGES.md) に記載しています。

ローカル常駐サービスは別の運用方法です。localhostは各参加者自身のPCを指すため、全参加者向けの配信URLには使いません。

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

通常フルChromium版のローカル統合テストと成功したGitHub実行は、いずれも18件成功・失敗0件です。日時検証、空データ拒否、キャッシュ期限、HTTP応答、静的出力保持、安全な診断、workflowの権限、実データ変更時だけの記録を確認しています。実QVCページの遅延DOM抽出からPages配信まで成功しました。詳しくは [TEST_RESULTS.md](TEST_RESULTS.md) を参照してください。

最初の2回は遅延DOMが生成されず失敗しました。通常のフルChromium＋Xvfbのheadedモードへ変更後に成功しています。User-Agentやwebdriverの偽装、ステルス処理、CAPTCHA解決は行いません。ローカル既定はフルChromiumのnew-headlessです。

失敗診断は公開ページの短いtitle/h1、出演コンテナー件数、公開スクリプトの状態、KARTE対象通信の公開選択子などに限定します。画像、完全HTML、POST全体、APIキー、cookie、認証ヘッダー、console生本文は記録しません。取得時刻は実際の抽出完了時刻です。

状態ページの取得時刻・有効期限を日本時間で表示する改善もローカルで準備済みです。JSONと期限判定はUTCを維持します。この表示改善の公開は別途確認が必要です。

## 公開資料

- Playwright Library: https://playwright.dev/docs/library
- npm公式メタデータ: https://registry.npmjs.org/playwright/latest （作成時1.64.1、Node>=20）
- KARTEの公式ActionTable API: https://developers.karte.io/reference/actiontable-getbyquery

現状確認した公式サイト内部のActionTable呼出はPOSTです。VRCStringDownloaderがそのまま使える、検証済みのQVC公開GET出演予定APIは見つかっていません。そのため、このサービスで表示後の公式DOMを取得してGET JSONへ変換します。
