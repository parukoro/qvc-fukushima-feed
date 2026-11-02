# QVC日別番組表の同一ホスト配信（2026-11-02）

既存の福島豊さんの出演予定に加え、QVC公式日別番組表をJST当日から7日後まで8日分配信します。Xを取得せず、公式の番組名・開始・終了時刻だけを扱います。画像・ナビゲーター写真・動画・公式HTML全文を公開しません。

## 公開先と形

`https://parukoro.github.io/qvc-fukushima-feed/daily/YYYYMMDD.json`

```json
{
  "schemaVersion": 1,
  "channel": "QVC",
  "date": "20261102",
  "source": "https://qvc.jp/content/programguide.qvc.202611020000.html",
  "status": "fresh",
  "retrievedUtc": "2026-11-01T23:30:00.000Z",
  "expiresUtc": "2026-11-02T01:30:00.000Z",
  "programmes": [
    {"start": "2026-11-02T00:00:00+09:00", "end": "2026-11-02T01:00:00+09:00", "title": "番組名"}
  ]
}
```

上記は形の説明用であり、実際の配信には当日の全24時間を覆う行が必要です。番組時刻はJST、有効期限はUTCで取得から2時間です。guest側の `qvc-fukushima.json` は既存の形を維持します。日別行に出演者の推測を埋め込みません。オレンジ色の照合は既存の公式guest feedの日時と番組名を使います。

## 取得・検証

- QVC公式の `programguide.qvc.YYYYMMDD0000.html` だけを8回順次GETします。同時アクセスやリトライの増幅はありません。
- リダイレクトは禁止、1ページ30秒・2MBまで。公開ページを通常のHTTPで読み、認証キーや購入サービスは使いません。
- `ul[data-channelcode="QVC"]` 内の番組行を使用します。他チャンネル、script文字列、コメントは除外します。未知のチャンネルへ自動で切り替えません。
- `data-starttime`、`data-endtime`、`data-showname` を抽出。実在する暦日とJST時刻、1〜96行、2〜300文字の名称、当日00:00から翌日00:00までの連続性を確認します。空・欠落・重複・重なり・日付違いは失敗させます。
- JSTの日付が収集中に変わった場合、次回に再取得します。日時をずらして再利用しません。
- 8日すべてとguestの検証が終わってから公開artifactを生成します。失敗時はActionsが既存のPages配置を保持し、有効期限を更新しません。Pagesは古くてもHTTP200を返すため、受信側の期限判定が必要です。

## 親担当の統合手順

1. このフォルダーの変更を既承認の同じ公開リポジトリへ反映。`data/last-programmes.json` は現行の公開版を保持してください。
2. `npm run export` は既存の通常Chromiumによるguest抽出の前に日別8ページを取得します。workflowの公開artifactは従来どおりpublicだけです。新しい依存・権限・契約はありません。
3. 手動実行後、8つの日別JSONと既存guest JSONのHTTP応答・有効期限を確認。
4. Unityの固定日別URLを同じgithub.ioホストの `/daily/YYYYMMDD.json` へ変更し、従来のQVC直接HTML取得とX取得を停止。
5. UnityはschemaVersion、channel、date、source、status、retrievedUtc、expiresUtc、全24hの行を検証し、期限切れを最新扱いしないこと。選択日の全行を表示し、現在放送を黄緑、公式guest一致をオレンジにします。

この変更だけでVRChatのURLホスト許可状況が自動的に変わるわけではありません。github.io自体の取得条件は実クライアントで確認してください。定期更新の遅延・停止条件は既存GITHUB_PAGES.mdのとおりです。

## 検証済みと未確認

2026-11-02、公式8ページ（11/02〜11/09）の実GETを実施し、7日が各20行、11/09が21行で、全日00:00〜翌00:00の連続性検証に成功しました。抽出JSONは圧縮前のコンパクト表記で各2931〜3278 bytesです。実サイト読み取りのみで、配信・pushはこの担当では行っていません。

ローカル統合テストは25件成功・失敗0。JST年越し、日付検証、別チャンネル排除、重複・欠落・時刻不正、期限・source検証、8順次GET、guest形式維持、8ファイル出力と部分データ拒否を含みます。公開用CIには公式HTML全文を含めないため、保存済み公式HTMLを読むローカル専用テスト1件は明示的skipになります。

GitHubからの新しい日別取得・配置、Unityからの日別JSON実受信は親担当の検証待ちです。
