"""ズボラ家計簿 API (FastAPI)。"""
import base64
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

import db
import insights
from db import CATEGORIES, UPLOAD_DIR
from ocr import parse_receipt, is_configured, OcrError

db.init_db()

app = FastAPI(title="ズボラ家計簿 API")

# 開発時は Nuxt(:3000) から叩くため CORS を許可
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 保存したレシート画像を配信
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _save_image(data_url: str, tx_id: str) -> str | None:
    """base64のdataURLをファイルに保存し、配信用の相対パスを返す。"""
    if not data_url:
        return None
    m = re.match(r"^data:image/([a-zA-Z+]+);base64,(.+)$", data_url, re.DOTALL)
    if not m:
        return None
    ext = "jpg" if m.group(1) in ("jpeg", "jpg") else m.group(1)
    fname = f"{tx_id}.{ext}"
    (UPLOAD_DIR / fname).write_bytes(base64.b64decode(m.group(2)))
    return f"/uploads/{fname}"


# ---------- モデル ----------
class SettingsIn(BaseModel):
    monthlyBudget: int | None = None
    cooldownDays: int | None = None
    gamanGoal: int | None = None


class OcrIn(BaseModel):
    image: str


class TxIn(BaseModel):
    amount: int
    category: str = "その他"
    date: str | None = None
    store: str = ""
    memo: str = ""
    items: list = []
    image: str | None = None  # base64 dataURL（任意）


class TxPatch(BaseModel):
    satisfaction: int | None = None
    amount: int | None = None
    category: str | None = None
    store: str | None = None
    memo: str | None = None
    date: str | None = None


class WantIn(BaseModel):
    name: str
    price: int = 0
    category: str = "その他"
    cooldownDays: int | None = None


class DecideIn(BaseModel):
    action: str  # 'bought' | 'resisted'


class GamanIn(BaseModel):
    amount: int
    label: str = ""


# ---------- 設定 ----------
@app.get("/api/settings")
def get_settings():
    return db.get_settings()


@app.put("/api/settings")
def put_settings(body: SettingsIn):
    return db.update_settings(body.monthlyBudget, body.cooldownDays, body.gamanGoal)


# ---------- ダッシュボード ----------
@app.get("/api/dashboard")
def dashboard():
    return {
        "month": insights.monthly_status(),
        "gaman": insights.gaman_total(),
        "regret": insights.regret_by_category(),
        "due": insights.due_wants(),
        "categories": CATEGORIES,
        "ocrAvailable": is_configured(),
        "today": insights.today_str(),
    }


# ---------- OCR ----------
@app.post("/api/ocr")
def ocr(body: OcrIn):
    try:
        parsed = parse_receipt(body.image)
    except OcrError as e:
        status = 503 if e.code == "NO_API_KEY" else 400
        raise HTTPException(status_code=status, detail={"error": str(e), "code": e.code})
    parsed["warning"] = insights.regret_warning(parsed["category"])
    return parsed


# ---------- 支出 ----------
@app.get("/api/transactions")
def list_tx(month: str | None = None):
    return db.list_transactions(month)


@app.post("/api/transactions", status_code=201)
def add_tx(body: TxIn):
    if not body.amount or body.amount <= 0:
        raise HTTPException(status_code=400, detail={"error": "金額を入力してください。"})
    tx_id = db.gen_id()
    image_path = None
    if body.image:
        try:
            image_path = _save_image(body.image, tx_id)
        except Exception:
            image_path = None
    date = body.date if body.date and re.match(r"^\d{4}-\d{2}-\d{2}$", body.date) else insights.today_str()
    tx = {
        "id": tx_id,
        "date": date,
        "amount": round(body.amount),
        "category": body.category if body.category in CATEGORIES else "その他",
        "store": (body.store or "")[:80],
        "memo": (body.memo or "")[:200],
        "items": body.items[:50] if isinstance(body.items, list) else [],
        "satisfaction": None,
        "image": image_path,
        "createdAt": _now_iso(),
    }
    db.add_transaction(tx)
    return {"tx": tx, "warning": insights.regret_warning(tx["category"])}


@app.put("/api/transactions/{tx_id}")
def update_tx(tx_id: str, body: TxPatch):
    fields = {}
    if body.satisfaction is not None:
        fields["satisfaction"] = min(5, max(1, round(body.satisfaction)))
    if body.amount is not None and body.amount > 0:
        fields["amount"] = round(body.amount)
    if body.category and body.category in CATEGORIES:
        fields["category"] = body.category
    if body.store is not None:
        fields["store"] = body.store[:80]
    if body.memo is not None:
        fields["memo"] = body.memo[:200]
    if body.date and re.match(r"^\d{4}-\d{2}-\d{2}$", body.date):
        fields["date"] = body.date
    tx = db.update_transaction(tx_id, fields)
    if not tx:
        raise HTTPException(status_code=404, detail={"error": "見つかりませんでした。"})
    return tx


@app.delete("/api/transactions/{tx_id}")
def delete_tx(tx_id: str):
    if not db.delete_transaction(tx_id):
        raise HTTPException(status_code=404, detail={"error": "見つかりませんでした。"})
    return {"ok": True}


# ---------- 欲しいリスト（クールダウン）----------
@app.get("/api/wants")
def list_wants():
    return db.list_wants()


@app.post("/api/wants", status_code=201)
def add_want(body: WantIn):
    if not body.name:
        raise HTTPException(status_code=400, detail={"error": "欲しいモノの名前を入力してください。"})
    days = body.cooldownDays if body.cooldownDays is not None else db.get_settings()["cooldownDays"]
    days = max(0, int(days))
    until = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    want = {
        "id": db.gen_id(),
        "name": body.name[:80],
        "price": max(0, round(body.price or 0)),
        "category": body.category if body.category in CATEGORIES else "その他",
        "cooldownUntil": until,
        "cooldownDays": days,
        "status": "waiting",
        "createdAt": _now_iso(),
        "decidedAt": None,
    }
    return db.add_want(want)


@app.post("/api/wants/{want_id}/decide")
def decide_want(want_id: str, body: DecideIn):
    if body.action not in ("bought", "resisted"):
        raise HTTPException(status_code=400, detail={"error": "action は bought か resisted を指定してください。"})
    want = db.get_want(want_id)
    if not want:
        raise HTTPException(status_code=404, detail={"error": "見つかりませんでした。"})
    want = db.decide_want(want_id, body.action, _now_iso())
    created_tx = None
    if body.action == "bought" and want["price"] > 0:
        created_tx = {
            "id": db.gen_id(),
            "date": insights.today_str(),
            "amount": want["price"],
            "category": want["category"],
            "store": "",
            "memo": f"欲しいリストから購入: {want['name']}",
            "items": [],
            "satisfaction": None,
            "image": None,
            "createdAt": _now_iso(),
        }
        db.add_transaction(created_tx)
    return {"want": want, "createdTx": created_tx}


@app.delete("/api/wants/{want_id}")
def delete_want(want_id: str):
    if not db.delete_want(want_id):
        raise HTTPException(status_code=404, detail={"error": "見つかりませんでした。"})
    return {"ok": True}


# ---------- 我慢貯金（手動）----------
@app.post("/api/gaman", status_code=201)
def add_gaman(body: GamanIn):
    if not body.amount or body.amount <= 0:
        raise HTTPException(status_code=400, detail={"error": "金額を入力してください。"})
    entry = {
        "id": db.gen_id(),
        "amount": round(body.amount),
        "label": (body.label or "")[:80],
        "createdAt": _now_iso(),
    }
    db.add_gaman(entry)
    return {"entry": entry, "gaman": insights.gaman_total()}


# ---------- グラフ用の集計 ----------
@app.get("/api/stats/monthly")
def stats_monthly(months: int = 6):
    return insights.monthly_trend(max(1, min(24, months)))


@app.get("/api/stats/categories")
def stats_categories(month: str | None = None):
    return insights.category_breakdown(month)


@app.get("/api/health")
def health():
    return {"ok": True, "ocr": is_configured()}
