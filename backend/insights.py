"""「あと何日メーター」「我慢貯金」「後悔メーター」など画面用の指標を計算する。"""
import calendar
from datetime import datetime, timezone

import db


def _now():
    return datetime.now()


def monthly_status(now: datetime | None = None) -> dict:
    now = now or _now()
    year, month = now.year, now.month
    key = f"{year}-{month:02d}"
    total_days = calendar.monthrange(year, month)[1]
    day_of_month = now.day
    days_left = total_days - day_of_month  # 今日を除いた残り日数

    settings = db.get_settings()
    budget = settings["monthlyBudget"]
    spent = sum(t["amount"] for t in db.list_transactions(key))
    remaining = budget - spent

    pace_per_day = spent / day_of_month if day_of_month else 0
    if pace_per_day <= 0:
        lasts_days = None if remaining > 0 else 0
    else:
        lasts_days = max(0, int(remaining / pace_per_day))

    safe_daily = int(max(0, remaining) / (days_left + 1)) if days_left > 0 else max(0, remaining)
    projected = round(pace_per_day * total_days)

    level = "safe"
    if remaining <= 0:
        level = "over"
    elif lasts_days is not None and lasts_days <= days_left:
        level = "danger"
    elif lasts_days is not None and lasts_days <= days_left + (total_days * 0.2):
        level = "warn"

    return {
        "key": key, "budget": budget, "spent": spent, "remaining": remaining,
        "totalDays": total_days, "dayOfMonth": day_of_month, "daysLeft": days_left,
        "pacePerDay": round(pace_per_day), "lastsDays": lasts_days,
        "safeDailyAllowance": safe_daily, "projected": projected, "level": level,
    }


def gaman_total() -> dict:
    wants = db.list_wants()
    from_wants = sum(w["price"] for w in wants if w["status"] == "resisted")
    from_manual = db.gaman_manual_total()
    resisted_count = sum(1 for w in wants if w["status"] == "resisted")
    settings = db.get_settings()
    return {
        "total": from_wants + from_manual,
        "fromWants": from_wants,
        "fromManual": from_manual,
        "goal": settings["gamanGoal"],
        "resistedCount": resisted_count,
    }


def regret_by_category() -> dict:
    agg: dict[str, dict] = {}
    for t in db.list_transactions():
        s = t["satisfaction"]
        if not isinstance(s, int):
            continue
        c = t["category"] or "その他"
        agg.setdefault(c, {"sum": 0, "count": 0})
        agg[c]["sum"] += s
        agg[c]["count"] += 1
    return {c: {"avg": v["sum"] / v["count"], "count": v["count"]} for c, v in agg.items()}


def regret_warning(category: str) -> dict | None:
    stats = regret_by_category().get(category)
    if not stats or stats["count"] < 2:
        return None
    if stats["avg"] <= 2.5:
        avg = round(stats["avg"] * 10) / 10
        return {
            "category": category, "avg": avg, "count": stats["count"],
            "message": f"このカテゴリ、後悔しがちかも（平均満足度 ★{avg:.1f} / {stats['count']}件）",
        }
    return None


def due_wants(now: datetime | None = None) -> list[dict]:
    now = now or _now()
    iso = now.astimezone(timezone.utc).isoformat()
    return [w for w in db.list_wants() if w["status"] == "waiting" and w["cooldownUntil"] <= iso]


def monthly_trend(months: int = 6, now: datetime | None = None) -> list[dict]:
    """直近 months か月の支出合計（古い→新しい順）。"""
    now = now or _now()
    result = []
    y, m = now.year, now.month
    keys = []
    for _ in range(months):
        keys.append(f"{y}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    keys.reverse()
    for key in keys:
        total = sum(t["amount"] for t in db.list_transactions(key))
        result.append({"month": key, "total": total})
    return result


def category_breakdown(month: str | None = None, now: datetime | None = None) -> list[dict]:
    now = now or _now()
    key = month or f"{now.year}-{now.month:02d}"
    agg: dict[str, int] = {}
    for t in db.list_transactions(key):
        agg[t["category"]] = agg.get(t["category"], 0) + t["amount"]
    items = [{"category": c, "total": v} for c, v in agg.items()]
    items.sort(key=lambda x: x["total"], reverse=True)
    return items


def today_str() -> str:
    return _now().strftime("%Y-%m-%d")
