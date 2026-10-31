# 無料の公開候補：GitHub Pages + GitHub Actions

公開先 `parukoro/qvc-fukushima-feed` と約30分ごとのPages配信はユーザー承認済みです。この担当ではローカルの構成だけを更新し、GitHub操作は行っていません。公開・接続確認は親担当が行います。

## 構成

このフォルダーだけを新しい公開リポジトリのルートに置きます。Unityプロジェクト、購入済みアセット、認証ファイルは含めません。

`.github/workflows/pages.yml` はUTCの毎時7分・37分を目安に実行されます。日本時間でも毎時7分・37分です。手動実行 `workflow_dispatch` もあります。

1. GitHub公式の標準Ubuntu 24.04ランナーでNode 22を用意。
2. Playwright 1.64.1とその固定依存をロックファイルから導入。
3. テスト後、通常のフルChromiumを一時ランナーに導入し、Xvfbで画面を用意して通常のheadedモードで描画。
4. QVC公式ゲスト1320ページを表示し、遅延描画された出演予定を取得。
5. 新しく検証済みのJSON、更新状態の小さいHTML、`.nojekyll` だけをPages artifactへ。
6. 別のdeployジョブがPagesへ配置。
7. 配置成功後、実際の番組日時・名称のリストに変化があった場合だけ `data/last-programmes.json` を既定ブランチに記録。

通常のコード取得は `contents: read` のみです。deployジョブだけにPages配置とOIDCの書き込み権限を付けています。番組変更の記録用 `record-facts` ジョブだけに `contents: write` を付け、標準の短期トークンを公式checkout経由で使用します。個人アクセストークンや外部有料APIは使いません。公式Actionsも確認済みコミットSHAに固定しています。

記録対象は番組開始時刻と名称の正規化リストだけです。取得時刻・有効期限・実行番号の変化ではコミットしません。同じ番組内容なら書き換えず、空コミット・強制push・定期heartbeatも行いません。スクリプトは無関係な変更があるcheckoutを拒否し、`data/last-programmes.json` 以外がステージされている場合も停止します。

## 無料で使う条件と制限

- GitHub Freeでは公開リポジトリのPagesが利用できます。[GitHub公式説明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- 公開リポジトリの標準GitHubホストランナーの実行は無料です。大型ランナーやprivateリポジトリへ切り替えると条件が変わります。[Actions料金の公式説明](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- この案は大型ランナー・有料サービスを選択しません。artifactは小さい生成物のみ、保持1日、Actionsの依存キャッシュも使いません。実行権限や組織ポリシーによって利用できない場合があります。
- スケジュールは約30分ごとを目指すもので、正確な更新保証はありません。GitHubの混雑で遅延し、ジョブが落とされる場合もあります。既定ブランチ上のworkflowだけが定期実行されます。[スケジュールの公式仕様](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- 配置後も配信キャッシュとVRChat側の再取得間隔によって反映が遅れます。即時の生配信データではありません。
- 公開リポジトリは60日間リポジトリの活動がないと定期workflowが自動無効化されます。長期放置の完全無保守運用には向きません。必要に応じてGitHub上で再有効化し、手動実行で更新を確認する運用が必要です。同じ公式仕様に記載されています。
- 実際の番組変更をリポジトリにも残すことで通常の活動を継続する構成ですが、上記公式資料はbotコミットが無活動判定にどう数えられるかまで明示していません。自動停止を確実に防げる保証はしません。番組変更が60日以上ない場合、記録の権限が制限された場合、GitHubの仕様変更時にも手動点検が必要です。
- Pagesには容量・帯域・配置時間などの上限があります。この小さなJSONと状態ページなら通常は小容量ですが、無制限ではありません。[Pagesの公式制限](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- GitHub上のブラウザからQVCへのアクセスが制限された場合、更新は失敗します。アクセス制限・CAPTCHAの回避は行いません。

## データ鮮度

取得失敗時は新しいartifactを公開せず、最後に成功した配置を保持します。保存済みの古い情報を「取得成功」に書き換えたり、出演予定を捏造したりしません。

`retrievedUtc` と `expiresUtc` をJSONに含め、有効期限は取得から2時間です。Pagesは静的配信なので、期限切れでもHTTP 200を返すことがあります。**Unity/Udon側はHTTP成功だけを信用せず、有効期限を過ぎた出演情報を最新の表示・ハイライトに使わない必要があります。** 状態ページも閲覧時刻と有効期限を比較して期限切れを表示します。

## 公開手順（親担当）

1. 承認済みの `parukoro/qvc-fukushima-feed` を使用。
2. GitHub認証が利用できる段階で、このフォルダーだけを公開リポジトリへ配置。
3. GitHub Settings → Pages の公開元をGitHub Actionsへ設定。[公式手順](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
4. 既定ブランチへ配置後、workflowを手動実行して、公式出演予定の取得と公開結果を確認。
5. `https://<owner>.github.io/<repository>/qvc-fukushima.json` の実際のURLを検証してからUnityの固定URLへ登録。
6. VRChatで取得、有効期限、出演者専用表示、番組表のオレンジ照合を確認。

番組変更の自動コミット方法は[公式checkoutの例](https://github.com/actions/checkout#push-a-commit-using-the-built-in-token)を参照しています。ブランチ保護などでpushできない場合も強制書き換えはせず、そのジョブを失敗させて確認できるようにします。公開データの配信自体は先に成功しており、記録失敗で取り消しません。

公開されるのはレビュー済みの小さな取得プログラムとQVC公式の番組名・日時です。ソースページの画像、ロゴ、映像、購入済みUnity素材は公開しません。

## 未検証の部分

ローカルではテストダブルと一時HTTP接続を使ったテストを実施。親担当による初回GitHubランナーの実行は、依存導入と13テストは成功し、QVCページHTTP200後の遅延コンテナー待機60秒で失敗しました。正常な公式取得・Pagesへの最新データ配信・Unityからの取得はまだ確認できていません。通常ロード・見出しスクロール・120秒待機・安全な失敗診断を追加した修正版を再実行して確認する必要があります。

2回目も公式ページとh1は正常ですが、出演コンテナー0件・対象API通信0件でタイムアウトしました。現在はheadless-shellから通常のフルChromium＋Xvfbのheadedモードへ切り替え、公開スクリプトの読込状態とエラー分類を追加した版です。User-Agentやwebdriverの変更、ステルスプラグイン、CAPTCHA解決は行いません。実際の成功は次のGitHub実行で確認します。[Playwright公式のheaded CI手順](https://playwright.dev/docs/ci#running-headed)
