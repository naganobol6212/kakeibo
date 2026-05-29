"""レシート画像を Claude の画像認識に渡して構造化データを取り出す。"""
import os
import re
import json
import base64

from anthropic import Anthropic

from db import CATEGORIES

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")

SYSTEM_PROMPT = f"""あなたは日本のレシート読み取りアシスタントです。
受け取ったレシート画像から情報を抽出し、必ず指定のJSON形式だけを返してください。前後に説明文やマークダウンは付けないでください。

JSON形式:
{{
  "store": "店名（不明なら空文字）",
  "date": "YYYY-MM-DD（読み取れなければ空文字）",
  "total": 合計金額の数値（税込・支払額。読み取れなければ0）,
  "category": "次のいずれか1つ: {' / '.join(CATEGORIES)}",
  "items": [ {{ "name": "品名", "price": 金額の数値 }} ]
}}

注意:
- 金額は数値のみ（カンマや円記号を除く）。
- categoryは店や品目から最も妥当なものを上記リストから1つ選ぶ。
- itemsは主要な購入品。多すぎる場合は代表的なものに絞ってよい。
- レシートでないと判断した場合は total を 0、store を空にする。"""


class OcrError(Exception):
    def __init__(self, message: str, code: str = "ERROR"):
        super().__init__(message)
        self.code = code


def is_configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def parse_receipt(data_url: str) -> dict:
    if not is_configured():
        raise OcrError("ANTHROPIC_API_KEY が未設定です。.env にキーを設定してください。", "NO_API_KEY")

    m = re.match(r"^data:(image/[a-zA-Z+]+);base64,(.+)$", data_url or "", re.DOTALL)
    if not m:
        raise OcrError("画像データの形式が不正です。", "BAD_IMAGE")
    media_type, b64 = m.group(1), m.group(2)

    client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                    {"type": "text", "text": "このレシートを読み取って、指定のJSONだけを返してください。"},
                ],
            }
        ],
    )
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    return _normalize(_parse_json_loosely(text))


def _parse_json_loosely(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
        raise OcrError("レシートの解析結果を読み取れませんでした。", "PARSE_FAILED")


def _to_number(v) -> int:
    if isinstance(v, (int, float)):
        return round(v)
    digits = re.sub(r"[^\d]", "", str(v or ""))
    return int(digits) if digits else 0


def _normalize(obj: dict) -> dict:
    category = obj.get("category") if obj.get("category") in CATEGORIES else "その他"
    items = []
    if isinstance(obj.get("items"), list):
        for it in obj["items"]:
            name = str((it or {}).get("name", ""))[:60]
            if name:
                items.append({"name": name, "price": _to_number((it or {}).get("price"))})
    date = obj.get("date", "")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date or ""):
        date = ""
    return {
        "store": str(obj.get("store", ""))[:80],
        "date": date,
        "total": _to_number(obj.get("total")),
        "category": category,
        "items": items,
    }
