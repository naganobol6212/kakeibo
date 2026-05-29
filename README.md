# ズボラ家計簿 📷💪

「なかなか続かない」人のための家計簿アプリ。
レシートを写メで撮るだけで自動入力、そして **使いすぎを防ぐためのオリジナル機能** を詰め込みました。

**構成: フロント = Nuxt 3（Vue / PWA） / バックエンド = Python（FastAPI） + SQLite**

## 特長

- **📷 レシート撮影で自動入力** — 写真から店名・日付・金額・品目・カテゴリをClaudeの画像認識で抽出。**撮った画像も保存**され、履歴から見返せます。
- **📅 「あと何日」メーター** — 「残り◯円」ではなく *今のペースだと残高があと何日もつか* を表示。金欠になりやすい人向けの直感的な残量バー。
- **⏳ 衝動買いクールダウン** — 欲しいモノはまず「欲しいリスト」へ登録 → 数日待ってから「買う / 我慢する」を判定。勢いの出費をブロック。
- **💪 我慢貯金** — 買わずに我慢した額が *仮想の貯金* として貯まる。「使わない＝増える」で節約をゲーム化。
- **⭐ 後悔メーター** — 買ったものに満足度（★1〜5）を記録。後悔しがちなカテゴリを学習し、次に同じカテゴリで支出しようとすると「本当に必要？」とそっと警告。
- **📊 グラフ** — 月ごとの支出推移（棒グラフ）と今月のカテゴリ別内訳（ドーナツ）。

## ディレクトリ構成

```
kakeibo/
├── backend/              FastAPI + SQLite
│   ├── main.py           APIエンドポイント
│   ├── db.py             SQLiteデータ層
│   ├── ocr.py            レシート画像 → 構造化データ（Claude）
│   ├── insights.py       あと何日 / 我慢貯金 / 後悔メーター / グラフ集計
│   ├── requirements.txt
│   └── .env.example
└── frontend/             Nuxt 3 (Vue) PWA
    ├── pages/            ホーム / 追加 / 欲しい / 履歴 / グラフ / 設定
    ├── components/       タブバー・グラフ・星評価
    ├── composables/      API通信・トースト・画像圧縮
    └── nuxt.config.ts
```

## セットアップ

必要なもの: **Python 3.11+** と **Node.js 18+**

### 1. バックエンド（FastAPI）

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windowsは .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
#   .env の ANTHROPIC_API_KEY を設定するとレシート自動読み取りが使えます
#   （https://console.anthropic.com/ で発行。無くても手入力で全機能OK）

uvicorn main:app --port 8000
```

### 2. フロントエンド（Nuxt）

別のターミナルで:

```bash
cd frontend
npm install
npm run dev
```

ブラウザで **http://localhost:3000** を開きます。
（開発時、フロントは `/api` へのリクエストを自動で `localhost:8000` のPython APIへプロキシします）

スマホで使うときは同じネットワークから `http://<PCのIP>:3000` を開き、
ブラウザの「ホーム画面に追加」をするとアプリのように使えます（PWA）。

## データについて

- すべて `backend/data/kakeibo.db`（SQLite）に保存されます。
- レシート画像は `backend/data/uploads/` に保存されます。
- どちらも `.gitignore` 済み。バックアップは `backend/data/` をコピーすればOK。

## デプロイ（本番・1コンテナ）

本番は **Docker 1コンテナ・プロセス1個** で動きます（Pythonがフロントも配信）。
開発時のような2プロセス起動は不要です。

```bash
docker build -t kakeibo .
docker run -p 8000:8000 -v "$(pwd)/data:/app/data" \
  -e ANTHROPIC_API_KEY=sk-ant-... kakeibo
```

→ http://localhost:8000 。データ（SQLite・画像）は `-v` で渡したフォルダに永続化されます。

詳しい仕組み・環境変数・デプロイ先別メモは **[DEPLOY.md](./DEPLOY.md)** を参照。

## メモ

- レシートOCRはAPI利用のため、読み取り1回ごとにごくわずかな費用が発生します。
- 送信前に画像を自動で縮小して通信量を抑えています。
- デプロイ時の最重要ポイントは「**データ保存先（`/app/data`）を永続ボリュームにする**」こと。
  無料ホスティングは永続ディスクが有料/不可の場合が多いので要確認（→ DEPLOY.md）。
