# ズボラ家計簿: フロント(Nuxt)とバックエンド(FastAPI)を1コンテナにまとめる。
# 本番は uvicorn 1プロセスだけで動く（Pythonが静的フロントも配信する）。

# ---- ステージ1: Nuxtフロントを静的書き出し ----
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
# ssr:false なので generate で .output/public に静的ファイルが出る
RUN npm run generate

# ---- ステージ2: Python実行環境 ----
FROM python:3.11-slim AS runtime
WORKDIR /app

# 依存を先に入れてレイヤーキャッシュを効かせる
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# バックエンド本体
COPY backend/ ./

# 書き出したフロントを backend/static として取り込む（main.py がここを配信する）
COPY --from=frontend /app/frontend/.output/public ./static

# データ（SQLite・アップロード画像）は永続ボリュームにマウントする想定
ENV DATA_DIR=/app/data \
    PORT=8000
VOLUME ["/app/data"]
EXPOSE 8000

# シェル形式にして $PORT（ホスティングが注入する）を展開できるようにする
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
