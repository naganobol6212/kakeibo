// 個人利用向けの超シンプルなJSONファイル保存層。
// DBを立てる手間なく「ファイル1個」で完結させる。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

// 初期データ構造
const DEFAULT_DB = {
  settings: {
    monthlyBudget: 50000,    // 1か月の予算（円）
    cooldownDays: 3,         // 衝動買いクールダウンの既定日数
    gamanGoal: 0,            // 我慢貯金の目標額（0なら未設定）
  },
  // 支出
  transactions: [],          // {id, date, amount, category, store, memo, items[], satisfaction|null, imageRef|null, createdAt}
  // 欲しいリスト（衝動買いクールダウン）
  wants: [],                 // {id, name, price, category, cooldownUntil, status:'waiting'|'bought'|'resisted', createdAt, decidedAt|null}
  // 我慢貯金の手動入力分（resisted な wants は別途集計）
  gamanManual: [],           // {id, amount, label, createdAt}
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

let cache = null;

export function load() {
  if (cache) return cache;
  ensureDir();
  if (!fs.existsSync(DB_PATH)) {
    cache = structuredClone(DEFAULT_DB);
    save();
    return cache;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    // 既定値で穴埋め（後からフィールドを足しても壊れないように）
    cache = {
      ...structuredClone(DEFAULT_DB),
      ...parsed,
      settings: { ...DEFAULT_DB.settings, ...(parsed.settings || {}) },
    };
    return cache;
  } catch (e) {
    console.error('db.json の読み込みに失敗しました。新規作成します。', e);
    cache = structuredClone(DEFAULT_DB);
    save();
    return cache;
  }
}

export function save() {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

// 変更を加えてから保存するヘルパー
export function update(mutator) {
  const db = load();
  const result = mutator(db);
  save();
  return result;
}

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
