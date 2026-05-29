import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { load, update, genId } from './lib/store.js';
import { parseReceipt, isConfigured, CATEGORIES } from './lib/ocr.js';
import {
  monthlyStatus, gamanTotal, regretByCategory, regretWarning, dueWants, todayStr,
} from './lib/insights.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' })); // レシート画像(base64)を受けるため大きめ
app.use(express.static(path.join(__dirname, 'public')));

// ---- 設定 ----
app.get('/api/settings', (req, res) => {
  res.json(load().settings);
});
app.put('/api/settings', (req, res) => {
  const { monthlyBudget, cooldownDays, gamanGoal } = req.body || {};
  const s = update((db) => {
    if (monthlyBudget != null) db.settings.monthlyBudget = Math.max(0, Math.round(+monthlyBudget) || 0);
    if (cooldownDays != null) db.settings.cooldownDays = Math.max(0, Math.round(+cooldownDays) || 0);
    if (gamanGoal != null) db.settings.gamanGoal = Math.max(0, Math.round(+gamanGoal) || 0);
    return db.settings;
  });
  res.json(s);
});

// ---- ダッシュボード（ホーム画面用のまとめ）----
app.get('/api/dashboard', (req, res) => {
  res.json({
    month: monthlyStatus(),
    gaman: gamanTotal(),
    regret: regretByCategory(),
    due: dueWants(),
    categories: CATEGORIES,
    ocrAvailable: isConfigured(),
    today: todayStr(),
  });
});

// ---- レシートOCR ----
app.post('/api/ocr', async (req, res) => {
  try {
    const { image } = req.body || {};
    if (!image) return res.status(400).json({ error: '画像が送られていません。' });
    const parsed = await parseReceipt(image);
    const warning = regretWarning(parsed.category);
    res.json({ ...parsed, warning });
  } catch (e) {
    const status = e.code === 'NO_API_KEY' ? 503 : 400;
    res.status(status).json({ error: e.message, code: e.code || 'ERROR' });
  }
});

// ---- 支出 ----
app.get('/api/transactions', (req, res) => {
  const { month } = req.query;
  let list = load().transactions;
  if (month) list = list.filter((t) => (t.date || '').slice(0, 7) === month);
  list = [...list].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  res.json(list);
});

app.post('/api/transactions', (req, res) => {
  const { date, amount, category, store, memo, items, satisfaction } = req.body || {};
  if (!amount || +amount <= 0) return res.status(400).json({ error: '金額を入力してください。' });
  const tx = {
    id: genId(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayStr(),
    amount: Math.round(+amount),
    category: CATEGORIES.includes(category) ? category : 'その他',
    store: (store || '').slice(0, 80),
    memo: (memo || '').slice(0, 200),
    items: Array.isArray(items) ? items.slice(0, 50) : [],
    satisfaction: typeof satisfaction === 'number' ? satisfaction : null,
    createdAt: new Date().toISOString(),
  };
  update((db) => db.transactions.push(tx));
  res.status(201).json({ tx, warning: regretWarning(tx.category) });
});

// 満足度（後悔メーター）の更新 ＆ その他編集
app.put('/api/transactions/:id', (req, res) => {
  const { id } = req.params;
  const { satisfaction, amount, category, store, memo, date } = req.body || {};
  const tx = update((db) => {
    const t = db.transactions.find((x) => x.id === id);
    if (!t) return null;
    if (satisfaction !== undefined) {
      t.satisfaction = satisfaction === null ? null : Math.min(5, Math.max(1, Math.round(+satisfaction)));
    }
    if (amount != null && +amount > 0) t.amount = Math.round(+amount);
    if (category && CATEGORIES.includes(category)) t.category = category;
    if (store != null) t.store = String(store).slice(0, 80);
    if (memo != null) t.memo = String(memo).slice(0, 200);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) t.date = date;
    return t;
  });
  if (!tx) return res.status(404).json({ error: '見つかりませんでした。' });
  res.json(tx);
});

app.delete('/api/transactions/:id', (req, res) => {
  const { id } = req.params;
  const ok = update((db) => {
    const i = db.transactions.findIndex((x) => x.id === id);
    if (i === -1) return false;
    db.transactions.splice(i, 1);
    return true;
  });
  if (!ok) return res.status(404).json({ error: '見つかりませんでした。' });
  res.json({ ok: true });
});

// ---- 欲しいリスト（衝動買いクールダウン）----
app.get('/api/wants', (req, res) => {
  const list = [...load().wants].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(list);
});

app.post('/api/wants', (req, res) => {
  const { name, price, category, cooldownDays } = req.body || {};
  if (!name) return res.status(400).json({ error: '欲しいモノの名前を入力してください。' });
  const days = cooldownDays != null ? Math.max(0, Math.round(+cooldownDays)) : load().settings.cooldownDays;
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const want = {
    id: genId(),
    name: String(name).slice(0, 80),
    price: Math.max(0, Math.round(+price) || 0),
    category: CATEGORIES.includes(category) ? category : 'その他',
    cooldownUntil: until,
    cooldownDays: days,
    status: 'waiting',
    createdAt: new Date().toISOString(),
    decidedAt: null,
  };
  update((db) => db.wants.push(want));
  res.status(201).json(want);
});

// 判定: 買う / 我慢する
app.post('/api/wants/:id/decide', (req, res) => {
  const { id } = req.params;
  const { action } = req.body || {}; // 'bought' | 'resisted'
  if (!['bought', 'resisted'].includes(action)) {
    return res.status(400).json({ error: 'action は bought か resisted を指定してください。' });
  }
  let createdTx = null;
  const want = update((db) => {
    const w = db.wants.find((x) => x.id === id);
    if (!w) return null;
    w.status = action;
    w.decidedAt = new Date().toISOString();
    // 買った場合は支出としても記録する
    if (action === 'bought' && w.price > 0) {
      createdTx = {
        id: genId(),
        date: todayStr(),
        amount: w.price,
        category: w.category,
        store: '',
        memo: `欲しいリストから購入: ${w.name}`,
        items: [],
        satisfaction: null,
        createdAt: new Date().toISOString(),
      };
      db.transactions.push(createdTx);
    }
    return w;
  });
  if (!want) return res.status(404).json({ error: '見つかりませんでした。' });
  res.json({ want, createdTx });
});

app.delete('/api/wants/:id', (req, res) => {
  const { id } = req.params;
  const ok = update((db) => {
    const i = db.wants.findIndex((x) => x.id === id);
    if (i === -1) return false;
    db.wants.splice(i, 1);
    return true;
  });
  if (!ok) return res.status(404).json({ error: '見つかりませんでした。' });
  res.json({ ok: true });
});

// ---- 我慢貯金（手動入力分）----
app.post('/api/gaman', (req, res) => {
  const { amount, label } = req.body || {};
  if (!amount || +amount <= 0) return res.status(400).json({ error: '金額を入力してください。' });
  const entry = { id: genId(), amount: Math.round(+amount), label: (label || '').slice(0, 80), createdAt: new Date().toISOString() };
  update((db) => db.gamanManual.push(entry));
  res.status(201).json({ entry, gaman: gamanTotal() });
});

// SPA: 未知のGETはindexへ
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  家計簿アプリ起動: http://localhost:${PORT}`);
  console.log(`  レシートOCR: ${isConfigured() ? '有効' : '無効（ANTHROPIC_API_KEY 未設定 → 手入力でご利用ください）'}\n`);
});
