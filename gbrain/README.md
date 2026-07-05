# GBrain VM

GBrain はオープンソースのマルチテナント「ブレイン」（エージェント記憶）システム
（`github:garrytan/gbrain`, TypeScript/Bun + Postgres/pgvector）。ここでは環境ごとに
1 台の GCE VM 上で Docker Compose（Postgres + 自前のマルチテナントルーター + Caddy）
として動かす。

役割: 通話セッション終了時にエージェントが文字起こし（誰が・いつ・何を）を Markdown の
「議事録」ページに整形して GBrain に push し、ワークスペースごとの知識を蓄積する。
さらに通話中も、エージェントは `search_workspace_memory` /
`read_workspace_memory_page` ツール（ルーターの `POST /query` / `POST /page`、ingest と
同じサーバー間トークンで認証）を使って、自分のワークスペースのブレインを検索・参照
できる。外部クライアント（ローカルの Claude Code など）は、自分のワークスペースの
ブレインに対してのみ、MCP-over-HTTP + Bearer トークンで接続して問い合わせる。

## 設定（config.env）

プロジェクト id・ドメイン・VM 名などの環境固有値は、gitignore された
`gbrain/config.env` にまとめる。スクリプトを実行する前にテンプレートをコピーして
埋める:

```sh
cp gbrain/config.env.example gbrain/config.env
$EDITOR gbrain/config.env
```

`config.env` はリポジトリルートの `.gitignore` で除外されている。実プロジェクト id や
ドメインをコミットしないこと。各スクリプトは `config.env` を source し、`_DEV` / `_PROD`
変数を選択環境（`--dev` / `--prod`）の作業変数にマップする。必須値が空なら即座に
失敗する。非識別的なデフォルト（リージョン・ゾーン・マシンタイプ・ディスクサイズ・
GBrain リビジョン・埋め込み / チャットモデル）はスクリプト内に残す。

環境ごとに設定するのは、プロジェクト・公開ドメイン（Caddy の TLS ホスト兼ルーターの
ベース URL）・VM 名。dev / prod は別々の GCP プロジェクトに置く。

## ワークスペース分離（物理分離の保証）

各ワークスペースは物理的に隔離される: 専用の Postgres データベース
`gbrain_ws_<workspaceId>` と専用の GBrain ホーム `/data/brains/<workspaceId>` を持つ。
ワークスペース W 向けに発行された Bearer トークンは W のデータベースにしか到達できない。
共有ブレインもワークスペース横断のクエリ経路も存在しない。ルーターは全ての `gbrain`
子プロセスを `GBRAIN_HOME` + `GBRAIN_DATABASE_URL` で W の store に束縛して起動する。

## 自動スケール（ワークスペース数は無制限）

- ワークスペースは事前プロビジョニングせず、初回利用時に遅延作成する（データベース
  作成 + `gbrain init`）。
- ingest は短命の `gbrain` CLI 実行のみ（ワークスペースごとの常駐プロセスは持たない）。
- MCP クエリ配信は、要求時に W 用の `gbrain serve --http` を遅延起動し、アイドルに
  なったら回収する（テナント単位の scale-to-zero）。同時にウォームな serve 数には
  LRU 上限を設ける。

## Provision

```sh
gbrain/setup.sh --dev --yes
gbrain/setup.sh --prod --yes
```

前提: Secret Manager に `OPENAI_API_KEY` が存在すること（各環境の brain の埋め込み /
LLM プロバイダとして使う）。`GBRAIN_ROUTER_INGEST_TOKEN` / `GBRAIN_ROUTER_ADMIN_TOKEN`
/ `GBRAIN_POSTGRES_PASSWORD` は setup.sh が生成・再利用する。

setup.sh が静的 IP を出力したら、DNS に A レコード `<domain> -> <IP>` を設定する。
その後 Caddy が Let's Encrypt で TLS を自動発行する。

## Redeploy

プロビジョニング済み VM への高速再デプロイ:

```sh
gbrain/deploy.sh --dev --yes
gbrain/deploy.sh --prod --yes
```

## Claude Code から接続する

管理トークンでワークスペース用の Bearer トークンを発行し、`claude mcp add` する。
トークン発行のレスポンスには、そのまま貼れる `claude mcp add ...` コマンドも含まれる。
`<domain>` / `<project>` は自分の環境の値に置き換える。

```sh
# 1. ワークスペース用トークンを発行
curl -s -X POST https://<domain>/admin/w/<workspaceId>/token \
  -H "Authorization: Bearer $(gcloud secrets versions access latest \
    --secret=GBRAIN_ROUTER_ADMIN_TOKEN --project=<project>)"

# 2. 返ってきた <token> で MCP を登録
claude mcp add gbrain -t http \
  https://<domain>/w/<workspaceId>/mcp \
  -H "Authorization: Bearer <token>"
```

## 運用メモ

ルーターのログ:

```sh
gcloud compute ssh <vm-name> --zone=asia-northeast1-b --project=<project> \
  --command="cd /opt/gbrain && sudo docker compose logs -f router"
```

ヘルスチェックは `GET https://<domain>/healthz`。
