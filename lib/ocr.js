// レシート画像をClaudeの画像認識に渡して、構造化データ（店名・日付・合計・品目）を取り出す。
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// カテゴリ候補（家計簿の定番）。Claudeにここから選ばせて表記ゆれを防ぐ。
export const CATEGORIES = [
  '食費', '日用品', '外食', 'カフェ', '交通費', '衣服・美容',
  '趣味・娯楽', '医療・健康', '交際費', '光熱費・通信', 'その他',
];

const SYSTEM_PROMPT = `あなたは日本のレシート読み取りアシスタントです。
受け取ったレシート画像から情報を抽出し、必ず指定のJSON形式だけを返してください。前後に説明文やマークダウンは付けないでください。

JSON形式:
{
  "store": "店名（不明なら空文字）",
  "date": "YYYY-MM-DD（読み取れなければ空文字）",
  "total": 合計金額の数値（税込・支払額。読み取れなければ0）,
  "category": "次のいずれか1つ: ${CATEGORIES.join(' / ')}",
  "items": [ { "name": "品名", "price": 金額の数値 } ]
}

注意:
- 金額は数値のみ（カンマや円記号を除く）。
- categoryは店や品目から最も妥当なものを上記リストから1つ選ぶ。
- itemsは主要な購入品。多すぎる場合は代表的なものに絞ってよい。
- レシートでないと判断した場合は total を 0、store を空にする。`;

export function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// dataUrl は "data:image/jpeg;base64,...." を想定
export async function parseReceipt(dataUrl) {
  if (!isConfigured()) {
    const err = new Error('ANTHROPIC_API_KEY が未設定です。.env にキーを設定してください。');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/s.exec(dataUrl || '');
  if (!match) {
    const err = new Error('画像データの形式が不正です。');
    err.code = 'BAD_IMAGE';
    throw err;
  }
  const mediaType = match[1];
  const base64 = match[2];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: 'このレシートを読み取って、指定のJSONだけを返してください。' },
        ],
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  return normalize(parseJsonLoosely(text));
}

// Claudeが万一マークダウン等を付けても拾えるようにする
function parseJsonLoosely(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch { /* fallthrough */ }
    }
    const err = new Error('レシートの解析結果を読み取れませんでした。');
    err.code = 'PARSE_FAILED';
    throw err;
  }
}

function normalize(obj) {
  const category = CATEGORIES.includes(obj.category) ? obj.category : 'その他';
  const items = Array.isArray(obj.items)
    ? obj.items
        .map((it) => ({ name: String(it?.name ?? '').slice(0, 60), price: toNumber(it?.price) }))
        .filter((it) => it.name)
    : [];
  return {
    store: String(obj.store ?? '').slice(0, 80),
    date: /^\d{4}-\d{2}-\d{2}$/.test(obj.date) ? obj.date : '',
    total: toNumber(obj.total),
    category,
    items,
  };
}

function toNumber(v) {
  if (typeof v === 'number') return Math.round(v);
  const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}
