# YouTube subscriptions選別・非公開プレイリスト自動追加の調査

調査日: 2026-11-11（水）、Codex。公開ドキュメント・OSSのREADME・主要ソースを確認。YouTubeアカウントへの接続、インストール、実行検証、プレイリスト作成は未実施。

## 目的と今回確定した条件

- 元案件: `cases/youtube-subscriptions-filter-extension.md`。2026-10-10の依頼は、subscriptionsページを自動フィルターして「後で見る」に入れる動画を選びやすくする拡張。
- 2026-11-11の依頼: 現在は定期的にsubsを見てWatch Laterへ手で追加している。面倒なので、ルールベース、または一部AIによって選別・追加を自動化したい。既存OSSを調査してtechoへ保存。
- 同日の追加回答: **「後で見るを使う必要はなく、非公開のプレイリストでいいよ」**。通常のprivateプレイリストを採用する方針は本人確認済み。Watch Later維持は要件から外す。
- 見たい／不要なジャンル、チャンネルごとの扱い、短い動画・配信の扱い、件数上限は未指定。実行先は追加回答でCloudflareに確定。下記の数値・ルール例は提案であり本人の好みとして確定しない。
- 既存の低優先度・リマインド不要の扱いは継続。今回は調査と記録の依頼で、自動実行の設定依頼ではない。

## 現在の方針：Cloudflareで自作（2026-11-11追記）

本人の追加指定: 「cloudflareで動かしたいが、認証は？subsを定期的にexportして、匿名として動画一覧みるとか？RSSとかある？OSSは使わずに、参照するだけでいいです、これなら」。

**Cloudflare Workers上にTypeScriptで自作する。既存OSSは設計と落とし穴の参考に限り、導入・fork・改修を前提にしない。** 以下の認証・収集案は調査提案で、OAuth許可やCloudflareデプロイはまだ行っていない。本人は無認証構成を確定指定したのではなく、export・匿名取得・RSSが可能か質問している。

### 認証は処理ごとに違う

| 処理 | Googleユーザー認可 | 方法 |
| --- | --- | --- |
| 登録一覧をexportして持ち込む | export時は本人のGoogleログインが必要。Workerには不要 | Takeoutのsubscriptions CSV等を読み、channel IDをD1へ保存 |
| 保存済みchannel IDから公開動画の新着を読む | 不要。API keyも不要 | チャンネルごとの公開Atomフィード（一般にRSSと呼ばれる）を取得 |
| 公開動画の長さ・配信状態などを補完 | ユーザーOAuthは不要 | YouTube Data API + プロジェクトのAPI key。OAuth利用済みならその認可でも取得可能 |
| 現在の非公開の登録一覧を自動同期 | 必要 | subscriptions.list(mine=true)をページング |
| 本人の非公開プレイリストを読み書き | **必要** | YouTube Data API + OAuth。RSSやAPI keyでは追加できない |

API keyはプロジェクトを識別する鍵で、本人としてログインするための鍵ではない。「公開データ取得を本人のGoogleログインなしで行う」ことと「通信が完全匿名である」ことは分ける。[YouTube公式認証説明](https://developers.google.com/youtube/data/guides/authentication)、[プレイリスト追加の認可](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/insert)

### RSSはある。exportするのはチャンネル一覧だけ

定期取得に使える公開フィードの形式:

```text
https://www.youtube.com/feeds/videos.xml?channel_id=UC...
```

`UC...`はchannel IDで、`@handle`ではない。一度登録一覧を取り込めば、同じチャンネルの新しい動画を知るために再exportする必要はない。再取り込みが要るのは登録／解除したチャンネルを反映するとき。

2026-11-11にローカル環境からCookie・OAuth・API keyを渡さず、YouTube公式チャンネル `UCBR8-60-B28hp2BmDPdntcQ` の `/feeds/videos.xml` をHTTP GETしたところ200、title=YouTube、entry=15を確認した。これは1チャンネル・その時点の実測で、全チャンネルで15件固定という保証でも、Cloudflareの送信元からの動作検証でもない。フィードは全履歴ではなく、長期停止や大量投稿では見逃しがあり得る。D1へ取得済み動画を保存し、必要ならuploads playlist APIで停止期間を補完する。

YouTubeはAtomフィードのWebSub通知も公式に案内している。**現行公式ガイドのWebSub topicは `/xml/feeds/videos.xml?channel_id=...` で、通常の取得用 `/feeds/videos.xml` と混同しない。** 通知は動画追加だけでなくタイトル・説明の更新でも届く。本人の「新着通知があるならそれでいいのでは？」を受け、WebSub通知を主経路に変更する。Cronは購読の期限更新・登録一覧同期・低頻度の取りこぼし照合に限定する。[YouTube公式WebSubガイド](https://developers.google.com/youtube/data/guides/push_notifications)

Takeoutのsubscriptions CSV取り出し手順は[Invidiousの公式インポート資料](https://docs.invidious.io/export-youtube-subscriptions/)でも案内される（Invidious自体を使うという意味ではない）。言語・対象チャンネルによる形式差は実ファイルで確認する。Google Takeoutの予約exportは2か月ごと・1年間で、日々の登録一覧同期には向かない。またexportの生成とWorkerへの自動取り込みは別の工程。[Google Takeoutの公式説明](https://support.google.com/accounts/answer/3024190?hl=en)

### 推奨：新着はWebSub通知、追加はOAuth

非公開プレイリストへの自動追加を実現するならOAuthが必要なので、その同じ接続で登録一覧も1日1回程度同期する案を推奨する。これなら定期exportという手作業が増えない。新着はチャンネルごとのWebSub購読でWorkerへ通知してもらい、動画の長さ・配信状態は必要に応じてAPIで補完する。RSSだけでは長さや配信アーカイブの判定を十分にできる前提にしない。

```text
OAuthで登録一覧を日次同期 ─→ D1のchannel ID一覧
                                 ↓
YouTubeのWebSub通知 → Worker → 新着ID保存 → 必要な詳細をAPI取得
                                 ↓
                         ルール → 必要時だけAI
                                 ↓
                  OAuthでprivateのAuto Queueへ追加
```

認可の流れは、Google CloudでYouTube Data APIを有効化し、Web application型のOAuth clientを用意 → 本人が一度同意 → authorization codeをサーバー側でtokenへ交換 → refresh tokenを安全に保管 → Workerが短命のaccess tokenを必要時に更新、となる。`access_type=offline`を使うので、通常の定期実行ごとにブラウザを開いたり、Googleのパスワード・CookieをWorkerに保存したりする必要はない。取消・失効時には再認可が要るため「永久に一度だけ」とは保証しない。[Google OAuth Web server / offline access](https://developers.google.com/identity/protocols/oauth2/web-server)

認可スコープは、登録取得とプレイリスト追加の両方を満たすものを選ぶ。`youtube.readonly`だけでは書き込めない。`playlistItems.insert`が受け入れる通常のスコープには`youtube`や`youtube.force-ssl`があるが、「このプレイリストに追加するだけ」という狭い権限ではない。コード側で対象channel IDとplaylist IDを固定し、追加操作だけを公開する。個人のYouTubeアカウントに対するこの用途は、Cloudflareの認証や一般的なサービスアカウントで本人のOAuthを代替する設計にしない。

External/TestingのままのYouTube認可ではrefresh tokenの7日失効条件に注意。継続運用ではGoogle OAuthの公開状態を適切に設定することと、審査の要否を別々に確認する。Googleは個人利用・100人未満のアプリについてverification不要の例外を案内しているが、未確認アプリの表示等は残り得る。これはYouTube APIのクォータ拡張審査とは別。[token失効条件](https://developers.google.com/identity/protocols/oauth2#expiration)、[verification不要の条件](https://support.google.com/cloud/answer/13464323?hl=en-KI)

### WebSubを主経路にする補足（本人の追加指摘を反映）

2026-11-11 本人「新着通知があるならそれでいいのでは？」。その通りで、Cloudflareで自作する今回の用途では通知主体が適する。前の「まずRSSを定期取得」は初期コードの少なさを優先した案であり、WebSubを使わない必要性があったわけではない。

- YouTubeのベル通知をブラウザで読むのではなく、Googleのhubにチャンネル別のtopicとWorkerのcallback URLを登録し、Atom形式のHTTP通知を受ける。公開チャンネルの購読・通知受信自体に本人のGoogle OAuthは不要。登録一覧の取得とprivateプレイリスト追加には別途必要。
- WebSub購読はYouTubeアカウントの「チャンネル登録」と別。登録チャンネルが増減したら対応するtopicのsubscribe/unsubscribeも更新する。初回は既存動画をどこまで取り込むかを決め、通知購読との重複をIDで除く。
- GETの購読確認に応答し、実際にhubが返したlease期限を保存して切れる前に更新する。固定の有効期間を決め打ちしない。購読要求が受理されたことと購読確認・実通知が成功したことを区別する。
- POST通知は速やかに永続化して応答し、その後に分類・追加する。タイトル／説明変更でも届くので、動画IDと更新情報で重複と再判定を扱う。AI処理までHTTP応答を待たせない。必要ならQueuesを使う。
- 通知を無条件に信用せず、topic・channel・video IDを照合する。hub.secretによる署名が利用可能なら設定・検証し、実hubの対応は実装時に確認する。管理画面のログインでcallbackを遮断しない。
- Cronは購読更新・登録一覧同期・低頻度の漏れ照合に残す。通知のみで過去履歴や完全配送を保証せず、予約動画／配信中として保留した候補の再確認も行う。

根拠: [YouTube公式通知ガイド](https://developers.google.com/youtube/data/guides/push_notifications)、[W3C WebSub仕様（購読確認・期限・配信・署名）](https://www.w3.org/TR/websub/)。実装・hub購読・実通知受信は未実施。

### 初回OAuthの設定手順と利用量の目安（2026-11-11追加調査）

本人の質問: 「oauthがいるってこと？どうやるの。あとrate limit大丈夫そう？」。質問への説明と設計更新であり、認可操作・本番設定の実行指示とは扱っていない。

非公開プレイリストへの追加には本人のOAuthが必要。公開チャンネルのWebSub受信には不要。API keyだけでは本人のプレイリストを書き換えられない。

初回設定の具体的な流れ:

1. 専用のGoogle Cloud projectを用意し、YouTube Data API v3を有効化する。GCPはAPI設定・認可のために使い、プログラムの実行先はCloudflareのまま。
2. Google Auth Platformで個人用アプリの同意画面を設定し、Web application型のOAuth clientを作る。実際に使うWorkerのHTTPS callback URLを登録する。ドメイン・URLは未決定なのでここでは作らない。
3. Worker側に認可開始とcallbackの処理を用意する。本人限定の開始画面からGoogleへ遷移し、stateによる照合などを行う。プレイリスト追加を許可するYouTube scopeとoffline accessを要求する。本人は普段のGoogleログインで対象YouTubeチャンネルを選び、Googleの同意画面で許可する。
4. callbackで受け取った一回用authorization codeをサーバー側で交換し、refresh tokenを安全に保存する。個人向けの最小構成はWorkers Secretsへ保管する導入手順でよい。実行中のWorkerからSecretsが自動書換えされるとは想定せず、初回投入・再認可時の更新方法を明示する。OAuth client secretもSecretsで管理する。
5. 以後Workerがrefresh tokenからaccess tokenを取得してAPIを呼ぶ。通常の実行ごとに本人のログインは不要。取消・失効等でinvalid_grantになった場合は自動で無限retryせず再接続を求める。

`youtube.readonly`では追加できない。`playlistItems.insert`は`youtube`／`youtube.force-ssl`等の書込みscopeを受け入れるが、これらは特定のプレイリストだけに限定する権限ではない。実装側で本人のchannel ID・対象playlist IDを固定し、必要な操作だけ実行する。GoogleのパスワードやCookieは収集しない。[YouTube追加API](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/insert)、[Google OAuth Web server](https://developers.google.com/identity/protocols/oauth2/web-server)

External/Testingの状態だと今回の権限ではrefresh tokenが7日で失効するため、継続運用時はIn productionへの切替を含む公開状態を確認する。In productionはアプリを一般公開することや審査完了とは別。Googleは100人未満の個人利用アプリにverification不要の例外を案内しており、今回も条件を満たすなら利用できる。未確認アプリの表示が出る場合がある。[token期限](https://developers.google.com/identity/protocols/oauth2#expiration)、[個人利用のverification例外](https://support.google.com/cloud/answer/13464323?hl=en)

#### APIクォータと短時間の制限を分ける

現行公式表では、今回使う通常エンドポイントの既定枠は**プロジェクト全体で10,000 units/日**。主な消費はプレイリストへの追加で、1本・1プレイリストあたり50 units。subscriptions.list、videos.list、playlistItems.listは1呼出し1 unit。これは10,000本や10,000回の追加が可能という意味ではない。WebSubの受信そのものはData APIのlist/insert呼出しではなく、受信後に詳細を取得・追加したときにunitsを使う。[公式クォータ表](https://developers.google.com/youtube/data/determine_quota_cost)

| 自動追加数/日（1つのプレイリスト） | 追加だけの消費 | 10,000 unitsに対する割合 |
| --- | --- | --- |
| 20本 | 1,000 | 10% |
| 50本 | 2,500 | 25% |
| 100本 | 5,000 | 50% |
| 150本 | 7,500 | 75% |
| 200本 | 10,000 | 100%：読取り等の余裕なし |

例: 50本追加＋読取り等200 unitsなら2,700 units/日。これは設計例で、本人の実データから算出した数値ではない。複数プレイリストへの追加、削除・並べ替え、失敗したAPIリクエストも消費に含める。初回の過去動画一括投入は別途件数を制限する。日次枠の更新は太平洋時間の0時で、日本時間0時ではない。

結論は、**1日数十本を選んで追加する個人用途なら既定枠に収まりやすい。200本/日前後の継続追加は既定枠では難しい。** 対象projectの実際の割当・他アプリとの共用・登録数・追加数は未確認なので無条件に保証しない。必要なら公式のquota extension申請を検討し、複数projectで制限を迂回しない。

日次枠とは別に短時間のrate limitも扱う。正確な秒間上限は対象projectのConsoleで確認し、推測値を仕様として採用しない。追加は少数並列または直列にして集中を避け、429／rate-limit系エラーはRetry-Afterがあれば尊重し、上限付き指数backoffとjitterで再試行する。日次quotaExceededは高速retryせず、未処理をD1等に保持して枠回復後へ送る。認可エラー・無効な動画等は区別して扱う。[公式共通エラー](https://developers.google.com/youtube/data/reference/rest/v3/core_errors)

WebSub hubの購読更新・通知配送の制限と、Cloudflare側の実行制限は別。上記のData API日次枠がそのまま適用されると解釈しない。購読を一斉更新せず期限前に分散させ、通知は永続化後すぐ応答する。登録数・実通知量を実測して実行プランを決める。


### Cloudflareの最小構成

- **Workers + Cron Triggers**: WorkerのHTTPSエンドポイントでWebSub通知を受信し、ルール判定・Google API追加へつなぐ。Cronは購読期限更新・登録一覧同期・低頻度の漏れ照合を担う。timeout・retry・実行予算を管理する。Cronの時刻設定はUTC。[Cron公式資料](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- **D1**: channels、videos、decisions、playlist追加状態、同期成功日時。動画ID等の一意制約と実行lease／状態遷移で重複を抑え、追加成功後のクラッシュはAPI照合で回復する。厳密なexactly-onceを主張しない。[D1公式資料](https://developers.cloudflare.com/d1/)
- **Workers Secrets**: 個人用の初期構成ならGoogle client secret・refresh token・必要ならAPI key。tokenはコード、techo、ブラウザ、AI入力、ログへ出さない。再認可で新refresh tokenを得た場合の更新経路も作る。[Secrets公式資料](https://developers.cloudflare.com/workers/configuration/secrets/)
- **AI**: 判定しづらい候補だけ。Workers AIまたは外部APIは後で選定し、初期実装の必須条件にしない。

単一Workerから始められる。RSS収集・AI処理にGoogle書込みtokenを一切持たせたくなったら、Google接続を専用Workerに分け、内部呼出しだけで使う構成にできる。初期から複数サービスに分割する必要はない。Containers、ブラウザ自動操作、動画本体の保存は今回不要。登録数・ポーリング頻度・実測処理時間が判明してから、Queues等への分割や料金を判断する。

### Google OAuthをCloudflareに置きたくない場合

exportしたチャンネル一覧 + 公開RSS + 自前の閲覧キューなら、CloudflareにGoogleユーザー認可を置かずに運用できる。ただしこのキューはYouTubeの非公開プレイリストではない。YouTubeへの追加は本人のブラウザで手動、または別の認可済み処理へ委ねる必要がある。長さ等の公式API補完にはプロジェクトAPI keyを使える。

現時点の推奨は「WebSub新着通知 + OAuthによる登録一覧同期とプレイリスト追加」。export-only構成も実現可能だが、目的の手間削減とprivateプレイリスト自動追加を両立するならOAuthを用意するほうが素直。採用・認可・デプロイはまだ実施していない。


## 既存ツール比較（採用せず設計参考のみ）

| 候補 | 確認できた役割 | 今回への適合・不足 |
| --- | --- | --- |
| [playlist-from-subs](https://github.com/keif/playlist-from-subs) / MIT | Python、公式API、チャンネル許可／除外、長さ・日付・キーワード、CLI/Web UI、dry-run | **最も近い参考実装**。興味に応じたAI選別と保留箱は追加実装。説明上の機能と実装の差に注意 |
| [auto-youtube-subscription-playlist-2](https://github.com/Elijas/auto-youtube-subscription-playlist-2) / MIT | Google Sheets + Apps Script、登録チャンネル全部または指定チャンネル等から定期追加 | **簡単なルール処理の参考**。期間経過後の削除もあるため、試用時は削除を無効にする。詳細ルール・AIは追加実装 |
| [unspool](https://github.com/ali5ter/unspool) / MIT | ローカルのフィード・キュー、YouTubeプレイリストへのミラー、LLMを呼ぶフック | 設計参考。端末UI・mpv中心で視聴環境が変わる。既存AI用途は主にAI生成コンテンツ判定で、本人の興味選別とは別 |
| [BlockTube](https://github.com/amitbl/blocktube) / GPL-3.0 | YouTube上のタイトル・チャンネル等をキーワード／正規表現で非表示 | 手動選別の負担軽減。定期収集やプレイリスト自動追加の完成品ではない。サイト全体へのブロックの影響もある |
| [PocketTube](https://pockettube.io/) | チャンネルのグループ化、長さ・日付・種類の絞り込み、AIタグ | 今すぐ画面を整理する代案。**完全なOSSではない**と[作者のREADME](https://github.com/NabokD/pockettube)に明記。個人のルールによる無人の定期追加は確認できていない |
| [YouTube.js](https://github.com/LuanRT/YouTube.js) | InnerTubeという内部APIのクライアント。プレイリスト操作用の実装あり | 非公式経路の部品。今回privateプレイリストでよくなったため採用する理由は薄い。Watch Laterの現在の動作は未検証 |
| [TubeSync](https://github.com/meeb/tubesync) / [Tube Archivist](https://docs.tubearchivist.com/) | チャンネル動画のローカル保存・メディア管理 | 動画をダウンロードして管理する目的向け。今回はYouTube上の再生リストで足りるため過剰 |

PocketTubeのAIタグは、今回求める「この動画を本人が見たいか」の自動判定と同一機能だとは扱わない。OSSが提供する機能、自分たちが追加する機能、実際に動作検証した機能を分ける。

### メンテナンス状況の記録

GitHub APIで2026-11-11に確認したデフォルトブランチの先頭コミット。更新日の新しさだけで品質は判断しない。repositoryのpushed_atは別ブランチでも更新されるので採用判断に混同しない。

| リポジトリ | 先頭コミット日時（UTC） | コミット | archived |
| --- | --- | --- | --- |
| keif/playlist-from-subs | 2026-07-02 | `8b68dbd93f34ae7cb84a15e90996efc51126982f` | false |
| Elijas/auto-youtube-subscription-playlist-2 | 2024-12-12 | `8e0b064b46daae109760c9cefe16f7da1e9310e8` | false |
| ali5ter/unspool | 2026-08-18 | `600d072bb287c323f6d289a0d3d2491286ab5afb` | false |
| amitbl/blocktube | 2026-02-07 | `d8a1bdba062ab603726b0ac3ea06c229d61fd710` | false |

## YouTube側の制約

- **通常のプレイリストには公式APIで追加できる。** OAuth認可が必要で、書込み可能なYouTubeスコープを使う。新規プレイリストは明示的に`private`を指定する。「unlisted（限定公開）」は非公開ではない。[playlistItems.insert](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/insert)
- Watch Later／視聴履歴の公式API対応は廃止されている。今回の本人回答により回避できる。ただし、過去のWatch Laterから自動で嗜好を学習する機能や、YouTube全体の既視聴をAPIだけで完全除外する機能は前提にできない。[公式変更履歴、2020-09-09](https://developers.google.com/youtube/data/revision_history)
- 登録チャンネルは`subscriptions.list(mine=true)`をページングして取得する。これはWebのsubscriptions画面そのものを取得するAPIではない。各チャンネルの`contentDetails.relatedPlaylists.uploads`から動画を集める。[subscriptions.list](https://developers.google.com/youtube/data/reference/rest/v3/subscriptions/list)、[channels](https://developers.google.com/youtube/data/reference/rest/v3/channels)
- 公開動画のタイトル・説明・長さ・公開日時・配信情報をまとめて取得する。配信終了後も除外したい場合は`liveBroadcastContent`だけでなく`liveStreamingDetails`を確認する。[videos](https://developers.google.com/youtube/data/reference/rest/v3/videos)
- 短さだけでShortsを正確には判定できない。「3分未満を除外」は短い通常動画も落とす。確認した公開videoリソースに汎用の`isShort`項目はなく、専用プレイリスト接頭辞への依存も公式保証とは扱わない。初期版では「短い動画を除外」という明示的な時間ルールにし、Shorts完全判定を約束しない。
- 他人の動画の字幕を公式APIで自由に取得できるわけではない。`captions.download`は動画の編集権限を要求する。初期版のAI入力はタイトル・説明などに絞る。[captions.download](https://developers.google.com/youtube/data/reference/rest/v3/captions/download)
- External/TestingのOAuthアプリは、YouTube権限を使う場合refresh tokenが7日で失効する条件に該当する。試用と継続運用で公開状態・認証方針を確認し、失効時は停止して再認可を知らせる。[Google OAuth有効期限](https://developers.google.com/identity/protocols/oauth2#expiration)

## 参考OSSのコード確認と自作時に避ける問題

確認対象: [video_filtering.py](https://github.com/keif/playlist-from-subs/blob/8b68dbd93f34ae7cb84a15e90996efc51126982f/yt_sub_playlist/core/video_filtering.py)、[youtube_client.py](https://github.com/keif/playlist-from-subs/blob/8b68dbd93f34ae7cb84a15e90996efc51126982f/yt_sub_playlist/core/youtube_client.py)、[playlist_manager.py](https://github.com/keif/playlist-from-subs/blob/8b68dbd93f34ae7cb84a15e90996efc51126982f/yt_sub_playlist/core/playlist_manager.py)。静的確認のみ。

1. キーワードのinclude/exclude・any/allは実装済み。文字列の部分一致で、正規表現やチャンネルごとの複合条件を自由に書ける完成済みエンジンではない。
2. 通常の登録動画取得経路はタイトル等を組み立てる際、descriptionを返すデータに含めていない。説明検索の設定があっても、この経路では説明を補完する改修が必要。
3. チャンネルあたり取得数の既定引数は5。uploads取得に次ページ走査がなく、上限は50件。頻繁に投稿するチャンネルや長い停止後は取りこぼし得る。最後の成功時刻までページングする方式へ改修する。
4. 配信フィルターは`liveBroadcastContent != none`。終了済み配信を一律除外する用途は満たせないため、配信アーカイブと通常投稿を区別する。
5. チャンネル情報・動画詳細はチャンネルごとに呼ぶ経路がある。READMEのバッチ処理による削減率を今回の実測値として使わず、対象チャンネル数で実測する。
6. プレイリスト作成の既定は`unlisted`。必ず`private`へ明示変更する。追加成功分の処理済み記録はあるが、判断保留・再試行・手動削除後の再追加防止を含めた永続状態を別途設計する。
7. dry-runは実際には追加せず、返却データに`added=True`を付ける。CSVや監視で「追加済み」と誤認しないよう`would_add`などに分ける。

これらは参考実装の注意点として自作設計へ反映する。OSSを改修して採用する計画は、本人の追加指定により取り下げた。

## 提案する処理

```text
登録チャンネルを同期
  → 各uploadsの新着を取得、動画IDで重複排除
  → 動画情報を一括取得
  → 明確なルールで「追加／除外／判定待ち」
  → 判定待ちだけAI → 「追加／保留／除外」
  → Auto Queue（private）へ追加
  → 追加成功を保存。失敗は次回再試行
```

新着収集はYouTube公式の[WebSub通知](https://developers.google.com/youtube/data/guides/push_notifications)を初期から使う。登録一覧同期と低頻度の漏れ照合は暫定1日1回程度とし、購読期限更新はhubから返る期限に従う。通知はアップロード以外にタイトル等の変更でも届くため重複排除は必要。RSSだけを取りこぼしのない履歴源にはしない。

### ルールを先に使う

チャンネルを「基本全部見る」「特定シリーズだけ」「内容で判断」の3種類に分ける。これは設計案で、分類する実チャンネルはまだ取得していない。

| ルールの例（未確定） | 判定 |
| --- | --- |
| 常に見たいチャンネルの通常投稿 | 明示的な除外条件に当たらなければ追加 |
| 特定シリーズ名をタイトルに含む | 追加 |
| 不要なシリーズ名を含む | 除外 |
| ライブ中・公開予約中 | 保留し、終了／公開後に再判定 |
| 長時間配信アーカイブ | チャンネル別に許可、除外、保留を設定 |
| タイトルだけでは興味が分からない | AI判定へ |

優先順位は「本人の個別判断 → 明示的な禁止条件 → チャンネル／シリーズ採用条件 → AI」とする。単語の一致だけで全部落とすより、チャンネル単位の例外を持つほうが意図に合わせやすい。視聴する量を制限したい場合は、件数だけでなく合計再生時間の上限も設定できるようにする。

### AIを使う範囲

- 入力: タイトル、チャンネル名、説明の必要部分、長さ、公開日時、本人が明示した好み、少数の「見る／見ない」実例。
- 出力: `add / review / skip`、短い理由、該当した関心・除外項目。モデルの自己申告confidenceを正解確率として扱わない。
- 初期はAIによる`skip`も見直せる一覧へ残す。安定したチャンネル・シリーズのみ自動追加し、ルールで判断できない場合を段階的に任せる。
- 動画全編の解析や大量の字幕取得は初期要件にしない。タイトル詐欺など、メタデータだけでは判断できない内容は保留にする。
- 動画説明は外部データとして扱う。AIにOAuth tokenやプレイリスト書込み権限を渡さず、許可した入力video IDに対する分類結果だけを後段で検証する。外部モデルへ送る情報と利用料は実装時に決める。
- AIの出力と人の修正を比べ、ルールで置き換えられるものはルールに戻す。最初から自動学習・ファインチューニングは不要。

### 取りこぼしと重複への対策

- チャンネルごとの最終成功位置、動画ID、判定・理由・ルール版、追加状態、playlist item IDを保存する。OAuth tokenはtechoやGitの本文へ保存しない。
- 初回は直近数日だけを候補一覧へ出す。既存動画を大量投入しない。以後は前回成功時刻に重なりを持たせて取得し、停止期間はページングして埋める。
- 「見つけた」「判定済み」「追加成功」を分ける。API失敗時に処理済みへ進めない。同じ動画が別通知で来ても二重追加しない。
- 追加リクエスト成功直後に処理が落ちたケースも、次回にプレイリストを再確認して回復する。単一実行のロックを置く。
- 予約・ライブ・取得不能は永久除外せず再判定対象にする。見逃し防止のため定期的に直近数日の再照合も行う。
- 本人がキューから削除した動画を毎回追加し直さない。追加履歴を保持する。不要と判断して消したのか視聴済みなのかは、削除だけから推測しない。
- 最初は古い動画や視聴済みの自動削除をしない。公式APIでYouTube全体の視聴履歴を取得できないため、通常プレイリストの「見終わったら消す」は手動運用か専用の完了操作が必要。
- 候補ゼロと取得エラーを区別し、最終成功日時・保留数・追加失敗数を確認できるようにする。

## 費用・実行場所（実行先はCloudflareに確定）

YouTube APIの現行公式表では、playlistItems.insertは1本50 units、主要listは1回1 unit。その他エンドポイント共通枠は既定10,000 units/日。search.listとvideos.insertは別枠で各100 calls/日と説明されている。**古いOSSの「search.list=100 units」を現在の公式仕様として転載しない。** 実プロジェクトの割当はGoogle Cloud Consoleで確認する。[公式クォータ表](https://developers.google.com/youtube/data/determine_quota_cost)

設計上の試算: 100チャンネルを1日2回、uploadsを各1ページ、各回のメタデータ対象100本、追加20本/日、登録一覧2ページとチャンネル情報2呼出しを1日1回更新、追加先1ページを各回照合する場合、約 `4 + 200 + 4 + 2 + 20×50 = 1,210 units/日`。初回作成、再試行、追加ページ、照合追加分は別。これは最適化した設計の計算で、OSSの実測や本人の登録数ではない。バッチ取得しても1本50の追加費用は減らない。

AIは「曖昧な候補数 × 入出力トークン数」で見積もる。例えば1日100候補のうちルールで80件決まり、残り20件を各入力1,000・出力100トークンで判定するなら、30日で入力約600,000・出力約60,000トークン。モデル未選定なので金額は断定しない。

以下は初回に比較した実行先。現在は上記のWorkers + Cron + D1案を優先し、ローカル／VPS／Actions／Apps Scriptへ配置する計画ではない。

| 比較した実行先 | 初回比較時の判断 |
| --- | --- |
| ローカルPCの定期実行 | 最初の試用向け。既存環境で始めやすいが、PC停止中は実行されない |
| 常時稼働の小さな実行環境 + 永続DB | 継続運用の本命。PCを開かずに動作。新たな契約は未決定 |
| GitHub Actions | 定期実行可能だが、実行が遅れることと、処理状態・更新されたtokenを安全に永続化する設計が必要。使い捨てrunner上のファイルだけに依存しない |
| Apps Script | 別サーバー不要。Elijas方式を使う簡単なルール中心の案に適する。AIや詳細状態を増やすと管理が複雑になる |

## 実装へ進むときの順序

1. 利用するYouTubeチャンネルのidentityを確認する。Googleログインが同じでもブランドチャンネルが違えば登録一覧やプレイリストが異なる。APIで取得した登録数・チャンネル名を本人の期待と照合する。
2. 最近の動画から30〜50本程度を用意し、「入れる／入れない／迷う」を確認してルールを作る。Watch LaterのAPI取得は前提にしない。サンプル選別は最初の較正だけにする。
3. Workers上に最小のTypeScriptプログラムを自作する。登録一覧同期、WebSub通知受信・購読更新・漏れ照合、private設定、配信判定、dry-run、永続状態を実装し、最初は候補一覧だけを生成する。既存OSSの導入・forkはしない。
4. 数日〜1週間、通常の手動選別と比べる。自動採用の適合率、見たい動画の見逃し、確認件数、API失敗・重複を記録する。暫定目標は自動採用の95%以上が本人にとって有用、確認量が従来より減ること。実際の基準は本人と合わせる。
5. 明確なルールだけAuto Queueへの自動追加を有効にし、AIは最初は保留の分類補助にする。精度が確認できた範囲を自動化する。

試用で確かめるケース: 1チャンネルから大量投稿、50件超の追加先、数日停止後の復旧、予約動画→公開、配信終了、途中でAPI失敗、追加直後のクラッシュ、同時起動、手動削除した動画の再出現、OAuth失効、誤ったブランドチャンネルへの接続。

## 今回の到達点

調査資料を保存し、非公開プレイリスト・Cloudflare上で自作・OSSは参考のみという本人指定を反映。RSSの匿名HTTP取得をローカルで1チャンネル確認した。Cloudflareからの実測、本人の登録一覧取得、Google認可、プレイリスト作成、AIモデル選定、デプロイ、定期実行の有効化は未実施。認証方式の推奨はOAuthで登録一覧と追加を処理し、公開新着はWebSub通知で受け取り、RSS/APIは低頻度の漏れ照合に使う構成。WebSubの実通知受信は未検証。export-onlyも選択肢として残し、本人がOAuthを拒否または承認したとは扱わない。
