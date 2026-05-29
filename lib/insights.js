// 「あと何日メーター」「我慢貯金」「後悔メーター」など、画面に出す指標の計算をまとめる。
import { load } from './store.js';

function ym(dateStr) {
  return (dateStr || '').slice(0, 7); // YYYY-MM
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysInMonth(year, month /* 1-12 */) {
  return new Date(year, month, 0).getDate();
}

// 今月の集計と「あと何日もつか」
export function monthlyStatus(now = new Date()) {
  const db = load();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const totalDays = daysInMonth(year, month);
  const dayOfMonth = now.getDate();
  const daysLeft = totalDays - dayOfMonth; // 今日を除いた残り日数

  const budget = db.settings.monthlyBudget || 0;
  const spent = db.transactions
    .filter((t) => ym(t.date) === key)
    .reduce((s, t) => s + (t.amount || 0), 0);

  const remaining = budget - spent;
  // 今のペース（1日あたりの使用額）
  const pacePerDay = spent / dayOfMonth;
  // 今の残高があと何日もつか（今のペースが続いた場合）
  let lastsDays;
  if (pacePerDay <= 0) {
    lastsDays = remaining > 0 ? Infinity : 0;
  } else {
    lastsDays = Math.max(0, Math.floor(remaining / pacePerDay));
  }
  // 月末まで安全に使える1日あたりの金額
  const safeDailyAllowance = daysLeft > 0 ? Math.floor(Math.max(0, remaining) / (daysLeft + 1)) : Math.max(0, remaining);
  // このペースで月末まで行った場合の着地予測
  const projected = Math.round(pacePerDay * totalDays);

  // 状態判定: もつ日数が月内の残り日数より少なければ危険
  let level = 'safe';
  if (remaining <= 0) level = 'over';
  else if (lastsDays !== Infinity && lastsDays <= daysLeft) level = 'danger';
  else if (lastsDays !== Infinity && lastsDays <= daysLeft + Math.ceil(totalDays * 0.2)) level = 'warn';

  return {
    key, budget, spent, remaining,
    totalDays, dayOfMonth, daysLeft,
    pacePerDay: Math.round(pacePerDay),
    lastsDays: lastsDays === Infinity ? null : lastsDays, // nullは「まだ余裕」
    safeDailyAllowance,
    projected,
    level,
  };
}

// 我慢貯金の合計（我慢したwants + 手動入力）
export function gamanTotal() {
  const db = load();
  const fromWants = db.wants
    .filter((w) => w.status === 'resisted')
    .reduce((s, w) => s + (w.price || 0), 0);
  const fromManual = db.gamanManual.reduce((s, g) => s + (g.amount || 0), 0);
  const total = fromWants + fromManual;
  return {
    total,
    fromWants,
    fromManual,
    goal: db.settings.gamanGoal || 0,
    resistedCount: db.wants.filter((w) => w.status === 'resisted').length,
  };
}

// 後悔メーター: カテゴリごとの平均満足度（評価済みのみ）
export function regretByCategory() {
  const db = load();
  const map = {};
  for (const t of db.transactions) {
    if (typeof t.satisfaction !== 'number') continue;
    const c = t.category || 'その他';
    if (!map[c]) map[c] = { sum: 0, count: 0 };
    map[c].sum += t.satisfaction;
    map[c].count += 1;
  }
  const result = {};
  for (const [c, v] of Object.entries(map)) {
    result[c] = { avg: v.sum / v.count, count: v.count };
  }
  return result;
}

// 指定カテゴリが「後悔しがち」かどうかの注意メッセージ
export function regretWarning(category) {
  const stats = regretByCategory()[category];
  if (!stats || stats.count < 2) return null;
  if (stats.avg <= 2.5) {
    return {
      category,
      avg: Math.round(stats.avg * 10) / 10,
      count: stats.count,
      message: `このカテゴリ、後悔しがちかも（平均満足度 ★${(Math.round(stats.avg * 10) / 10).toFixed(1)} / ${stats.count}件）`,
    };
  }
  return null;
}

// クールダウンが明けて「判定待ち」になっている欲しいモノ
export function dueWants(now = new Date()) {
  const db = load();
  const t = now.toISOString();
  return db.wants.filter((w) => w.status === 'waiting' && w.cooldownUntil <= t);
}

export { todayStr };
