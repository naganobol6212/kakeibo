"""SQLite を使った軽量なデータ層。ORMは使わず標準ライブラリのみで完結させる。"""
import sqlite3
import json
import os
import secrets
import time
from pathlib import Path

# データ保存先。本番では永続ボリュームを DATA_DIR で指定する（例: /app/data）。
# 未指定なら backend/data に保存（ローカル開発用）。
DATA_DIR = Path(os.environ.get("DATA_DIR") or (Path(__file__).parent / "data"))
DB_PATH = DATA_DIR / "kakeibo.db"
UPLOAD_DIR = DATA_DIR / "uploads"

CATEGORIES = [
    "食費", "日用品", "外食", "カフェ", "交通費", "衣服・美容",
    "趣味・娯楽", "医療・健康", "交際費", "光熱費・通信", "その他",
]


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    conn = _connect()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            monthly_budget INTEGER NOT NULL DEFAULT 50000,
            cooldown_days  INTEGER NOT NULL DEFAULT 3,
            gaman_goal     INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id           TEXT PRIMARY KEY,
            date         TEXT NOT NULL,
            amount       INTEGER NOT NULL,
            category     TEXT NOT NULL,
            store        TEXT DEFAULT '',
            memo         TEXT DEFAULT '',
            items        TEXT DEFAULT '[]',
            satisfaction INTEGER,
            image        TEXT,
            created_at   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS wants (
            id            TEXT PRIMARY KEY,
            name          TEXT NOT NULL,
            price         INTEGER NOT NULL DEFAULT 0,
            category      TEXT DEFAULT 'その他',
            cooldown_until TEXT NOT NULL,
            cooldown_days  INTEGER NOT NULL DEFAULT 3,
            status        TEXT NOT NULL DEFAULT 'waiting',
            created_at    TEXT NOT NULL,
            decided_at    TEXT
        );

        CREATE TABLE IF NOT EXISTS gaman_manual (
            id         TEXT PRIMARY KEY,
            amount     INTEGER NOT NULL,
            label      TEXT DEFAULT '',
            created_at TEXT NOT NULL
        );
        """
    )
    conn.execute("INSERT OR IGNORE INTO settings (id) VALUES (1)")
    conn.commit()
    conn.close()


def gen_id() -> str:
    return f"{int(time.time() * 1000):x}{secrets.token_hex(3)}"


def get_settings() -> dict:
    conn = _connect()
    row = conn.execute("SELECT monthly_budget, cooldown_days, gaman_goal FROM settings WHERE id = 1").fetchone()
    conn.close()
    return {
        "monthlyBudget": row["monthly_budget"],
        "cooldownDays": row["cooldown_days"],
        "gamanGoal": row["gaman_goal"],
    }


def update_settings(monthly_budget=None, cooldown_days=None, gaman_goal=None) -> dict:
    conn = _connect()
    cur = conn.execute("SELECT monthly_budget, cooldown_days, gaman_goal FROM settings WHERE id = 1").fetchone()
    mb = cur["monthly_budget"] if monthly_budget is None else max(0, int(monthly_budget))
    cd = cur["cooldown_days"] if cooldown_days is None else max(0, int(cooldown_days))
    gg = cur["gaman_goal"] if gaman_goal is None else max(0, int(gaman_goal))
    conn.execute(
        "UPDATE settings SET monthly_budget = ?, cooldown_days = ?, gaman_goal = ? WHERE id = 1",
        (mb, cd, gg),
    )
    conn.commit()
    conn.close()
    return {"monthlyBudget": mb, "cooldownDays": cd, "gamanGoal": gg}


# ---- transactions ----
def _tx_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "date": row["date"],
        "amount": row["amount"],
        "category": row["category"],
        "store": row["store"] or "",
        "memo": row["memo"] or "",
        "items": json.loads(row["items"] or "[]"),
        "satisfaction": row["satisfaction"],
        "image": row["image"],
        "createdAt": row["created_at"],
    }


def list_transactions(month: str | None = None) -> list[dict]:
    conn = _connect()
    if month:
        rows = conn.execute(
            "SELECT * FROM transactions WHERE substr(date,1,7) = ? ORDER BY date DESC, created_at DESC",
            (month,),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM transactions ORDER BY date DESC, created_at DESC").fetchall()
    conn.close()
    return [_tx_to_dict(r) for r in rows]


def add_transaction(tx: dict) -> dict:
    conn = _connect()
    conn.execute(
        """INSERT INTO transactions (id, date, amount, category, store, memo, items, satisfaction, image, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (
            tx["id"], tx["date"], tx["amount"], tx["category"], tx["store"], tx["memo"],
            json.dumps(tx["items"], ensure_ascii=False), tx["satisfaction"], tx.get("image"), tx["createdAt"],
        ),
    )
    conn.commit()
    conn.close()
    return tx


def get_transaction(tx_id: str) -> dict | None:
    conn = _connect()
    row = conn.execute("SELECT * FROM transactions WHERE id = ?", (tx_id,)).fetchone()
    conn.close()
    return _tx_to_dict(row) if row else None


def update_transaction(tx_id: str, fields: dict) -> dict | None:
    if not fields:
        return get_transaction(tx_id)
    cols, vals = [], []
    mapping = {
        "satisfaction": "satisfaction", "amount": "amount", "category": "category",
        "store": "store", "memo": "memo", "date": "date",
    }
    for k, col in mapping.items():
        if k in fields:
            cols.append(f"{col} = ?")
            vals.append(fields[k])
    if not cols:
        return get_transaction(tx_id)
    vals.append(tx_id)
    conn = _connect()
    conn.execute(f"UPDATE transactions SET {', '.join(cols)} WHERE id = ?", vals)
    conn.commit()
    conn.close()
    return get_transaction(tx_id)


def delete_transaction(tx_id: str) -> bool:
    conn = _connect()
    row = conn.execute("SELECT image FROM transactions WHERE id = ?", (tx_id,)).fetchone()
    cur = conn.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
    conn.commit()
    conn.close()
    if row and row["image"]:
        f = UPLOAD_DIR / Path(row["image"]).name
        if f.exists():
            try:
                f.unlink()
            except OSError:
                pass
    return cur.rowcount > 0


# ---- wants ----
def _want_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"], "name": row["name"], "price": row["price"], "category": row["category"],
        "cooldownUntil": row["cooldown_until"], "cooldownDays": row["cooldown_days"],
        "status": row["status"], "createdAt": row["created_at"], "decidedAt": row["decided_at"],
    }


def list_wants() -> list[dict]:
    conn = _connect()
    rows = conn.execute("SELECT * FROM wants ORDER BY created_at DESC").fetchall()
    conn.close()
    return [_want_to_dict(r) for r in rows]


def add_want(w: dict) -> dict:
    conn = _connect()
    conn.execute(
        """INSERT INTO wants (id, name, price, category, cooldown_until, cooldown_days, status, created_at, decided_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (w["id"], w["name"], w["price"], w["category"], w["cooldownUntil"], w["cooldownDays"],
         w["status"], w["createdAt"], w["decidedAt"]),
    )
    conn.commit()
    conn.close()
    return w


def get_want(want_id: str) -> dict | None:
    conn = _connect()
    row = conn.execute("SELECT * FROM wants WHERE id = ?", (want_id,)).fetchone()
    conn.close()
    return _want_to_dict(row) if row else None


def decide_want(want_id: str, status: str, decided_at: str) -> dict | None:
    conn = _connect()
    cur = conn.execute(
        "UPDATE wants SET status = ?, decided_at = ? WHERE id = ?",
        (status, decided_at, want_id),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return None
    return get_want(want_id)


def delete_want(want_id: str) -> bool:
    conn = _connect()
    cur = conn.execute("DELETE FROM wants WHERE id = ?", (want_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


# ---- gaman manual ----
def add_gaman(entry: dict) -> dict:
    conn = _connect()
    conn.execute(
        "INSERT INTO gaman_manual (id, amount, label, created_at) VALUES (?,?,?,?)",
        (entry["id"], entry["amount"], entry["label"], entry["createdAt"]),
    )
    conn.commit()
    conn.close()
    return entry


def gaman_manual_total() -> int:
    conn = _connect()
    row = conn.execute("SELECT COALESCE(SUM(amount), 0) AS s FROM gaman_manual").fetchone()
    conn.close()
    return row["s"]
