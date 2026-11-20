# QVC公式データの手動取り込み

QVCへの接続が使えない環境でも、利用許可のある公式データを手元で受け取れている場合は、既存の配信用ファイルを生成できます。Node.js 20以上で動作します。

```sh
node import-official-snapshot.mjs /path/to/snapshot.json ./qvc-recovery
```

入力は次の形のJSONです。例は形式の説明用です。実際の入力では当日から8日間の全番組行と、公式に確認した福島豊さんの出演予定を使用します。

```json
{
  "capturedUtc": "2026-11-20T04:00:00.000Z",
  "days": [
    {
      "date": "20261120",
      "source": "https://qvc.jp/content/programguide.qvc.202611200000.html",
      "programmes": [
        {
          "start": "2026-11-20T00:00:00+09:00",
          "end": "2026-11-20T01:00:00+09:00",
          "title": "番組名"
        }
      ]
    }
  ],
  "guest": {
    "source": "https://qvc.jp/information/feature/guest/guestpedia/1320.html",
    "records": [
      {
        "href": "https://qvc.jp/content/programguide.qvc.202611211900.html",
        "title": "出演番組名"
      }
    ]
  }
}
```

`capturedUtc` には最も早い実取得時刻をUTCで記録します。JST当日中の取得が必要です。出力の取得時刻と有効期限は、この時刻から計算されます。入力元は作業者が公式情報と照合し、このコマンドはURL、日付、24時間の連続性、出演情報と鮮度を検証します。

出力先は新しいディレクトリを指定します。成功すると `weekly.json`、`daily/YYYYMMDD.json` 8件、`qvc-fukushima.json`、`index.html`、`.nojekyll` を生成します。GitHubへのアップロードや公開は別途実施します。公式出演情報が取得できず入力が欠ける場合は、データの用意が必要です。
