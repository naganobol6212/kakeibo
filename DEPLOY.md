# デプロイ手順

このアプリは **1コンテナ構成** です。フロント（Nuxt）を静的に書き出し、
バックエンド（FastAPI / uvicorn）が API も画面も両方配信します。
なので **本番で動かすプロセスは1つだけ** です。

## 仕組み

```
[ ブラウザ ] ──→ [ Dockerコンテナ：uvicorn 1プロセス ]
                      ├─ /api/*      … FastAPI（家計簿のAPI）
                      ├─ /uploads/*  … 保存したレシート画像
                      └─ それ以外     … Nuxtの静的フロント（SPA）
                          ↑
                      [ 永続ボリューム /app/data ]
                          ├─ kakeibo.db（SQLite）
                          └─ uploads/（レシート画像）
```

- フロントは `npm run generate` で静的書き出し → Dockerビルド時に `backend/static` へ取り込み。
- `main.py` が `backend/static`（環境変数 `FRONTEND_DIST` で変更可）を配信。
- データは `DATA_DIR`（既定 `/app/data`）配下に保存。**ここを永続ボリュームにすること**が最重要。

## ローカルでDockerとして動かす

```bash
# ビルド
docker build -t kakeibo .

# 起動（データはホストの ./data に永続化、OCRを使うならキーを渡す）
docker run -p 8000:8000 \
  -v "$(pwd)/data:/app/data" \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  kakeibo
```

ブラウザで http://localhost:8000 を開く。`ANTHROPIC_API_KEY` を省略しても手入力で全機能使えます。

## 環境変数

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | 任意 | レシートOCRを使う場合のみ。未設定でも手入力で動く |
| `ANTHROPIC_MODEL` | 任意 | 既定 `claude-sonnet-4-6` |
| `DATA_DIR` | 任意 | データ保存先。既定 `/app/data`（コンテナ）。**永続ボリュームを割り当てる** |
| `FRONTEND_DIST` | 任意 | フロント配信元。既定 `backend/static` |
| `PORT` | 任意 | 待受ポート。多くのホスティングは自動で注入する |

## デプロイ先別メモ（2026年時点）

データ（SQLite＋画像）を**永続保存**できることが必須条件。無料ホスティングの多くは
永続ディスクが有料化しているため、選定時は「永続ボリュームが使えるか」を必ず確認すること。

- **完全無料を狙うなら**: Oracle Cloud **Always Free**（ARM VM＋ブロックボリューム）。
  - VMに Docker を入れて上記 `docker run` を常駐させる。`DATA_DIR` をブロックボリュームのマウント先に。
  - 注意: 「30日$300トライアル」とは別枠。`Always Free` ラベルのリソースだけで組めば無期限無料。
- **手軽さ重視なら**: Render Starter（$7/月〜）や Railway Hobby（$5/月〜）。
  - このリポジトリの `Dockerfile` を指定し、永続ディスクを `/app/data` にマウント、`PORT` は自動注入。

> どのホスティングでも、やることは同じ「このDockerイメージを動かす＋ `/app/data` を永続化する」だけです。
