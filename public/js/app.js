import { api, yen } from './api.js';

// ---------- 小さなヘルパー ----------
const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d)) return s;
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`;
}
function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}
function starsHtml(value, editable) {
  let h = `<span class="stars" ${editable ? 'data-editable="1"' : ''}>`;
  for (let i = 1; i <= 5; i++) h += `<span class="s ${value >= i ? 'on' : ''}" data-v="${i}">★</span>`;
  return h + '</span>';
}

// 画像を縮小してdataURL化（レシート写真は大きいので軽くする）
function fileToCompressedDataUrl(file, maxW = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- ルーター ----------
const routes = {
  '/': renderHome,
  '/add': renderAdd,
  '/wants': renderWants,
  '/history': renderHistory,
  '/settings': renderSettings,
};

async function router() {
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  const view = routes[path] || renderHome;
  // タブのactive表示
  document.querySelectorAll('#tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === path);
  });
  app.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    await view();
  } catch (e) {
    app.innerHTML = `<div class="empty"><div class="big">😵</div><p>読み込みに失敗しました</p><p class="muted">${esc(e.message)}</p></div>`;
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', router);
window.addEventListener('load', router);

// ================= ホーム =================
async function renderHome() {
  const d = await api.dashboard();
  const m = d.month;
  const g = d.gaman;

  // あと何日メーター
  const lasts = m.lastsDays;
  let bigText, levelMsg;
  if (m.level === 'over') {
    bigText = `<div class="meter-big">予算オーバー</div>`;
    levelMsg = `今月はすでに ${yen(-m.remaining)} 超過。来月に向けて我慢貯金で取り返そう。`;
  } else if (m.level === 'safe') {
    // 月末まで乗り切れる見込み（巨大な日数は出さない）
    bigText = `<div class="meter-big">月末まで<small> OK</small> ◎</div>`;
    levelMsg = `今のペースなら、あと${m.daysLeft}日の月末まで乗り切れそう。いい調子！`;
  } else {
    // 残高が月内に尽きそう（ここが「あと何日」が効く場面）
    bigText = `<div class="meter-big">あと<small> </small>${lasts}<small>日</small></div>`;
    levelMsg = m.level === 'danger'
      ? `⚠️ このペースだと月末（あと${m.daysLeft}日）より早く尽きます。1日 ${yen(m.safeDailyAllowance)} までに抑えて！`
      : `そろそろ注意。1日 ${yen(m.safeDailyAllowance)} までに抑えると安心。`;
  }

  const pct = m.budget > 0 ? Math.min(100, Math.round((m.spent / m.budget) * 100)) : 0;

  const dueHtml = d.due.length
    ? `<div class="banner danger row-between">
         <span>🛒 クールダウンが明けた欲しいモノが ${d.due.length} 件あります</span>
         <a class="btn ghost" href="#/wants">確認</a>
       </div>`
    : '';

  const goalHtml = g.goal > 0
    ? `<div class="meter-bar" style="margin-top:10px"><i style="width:${Math.min(100, Math.round((g.total / g.goal) * 100))}%;background:#92400e"></i></div>
       <div class="gaman-meta">目標 ${yen(g.goal)} まであと ${yen(Math.max(0, g.goal - g.total))}</div>`
    : '';

  app.innerHTML = `
    <h1 class="page-title">こんにちは 👋</h1>
    ${dueHtml}

    <div class="card meter-card ${m.level}">
      <div class="meter-days">${esc(m.key)} の残り予算でいくと…</div>
      ${bigText}
      <div class="meter-bar"><i style="width:${pct}%"></i></div>
      <div class="meter-row"><span>使った <b>${yen(m.spent)}</b></span><span>予算 <b>${yen(m.budget)}</b></span></div>
      <p class="meter-sub">${esc(levelMsg)}</p>
    </div>

    <div class="kpi">
      <div class="box"><div class="n">${yen(m.safeDailyAllowance)}</div><div class="t">今日からの1日あたり目安</div></div>
      <div class="box"><div class="n">${yen(m.projected)}</div><div class="t">このペースの着地予測</div></div>
    </div>

    <div class="card gaman-card mt">
      <div class="row-between">
        <div>
          <div class="label">💪 我慢貯金（買わずに我慢した額）</div>
          <div class="gaman-amount">${yen(g.total)}</div>
          <div class="gaman-meta">我慢した回数 ${g.resistedCount}回</div>
        </div>
      </div>
      ${goalHtml}
      <div class="btn-row mt">
        <button class="btn gold small" id="gaman-add">いま我慢した！</button>
      </div>
    </div>

    <div class="btn-row mt">
      <a class="btn" href="#/add">📷 支出を追加</a>
      <a class="btn secondary" href="#/wants">🛒 欲しいを登録</a>
    </div>
  `;

  document.getElementById('gaman-add').onclick = async () => {
    const amount = prompt('我慢した金額（円）を入力:');
    if (!amount) return;
    const label = prompt('何を我慢した？（任意）') || '';
    try {
      await api.addGaman(+amount, label);
      toast('我慢貯金に追加しました 💪');
      router();
    } catch (e) { toast(e.message); }
  };
}

// ================= 追加（レシート撮影 / 手入力）=================
let addForm = null;
async function renderAdd() {
  const d = await api.dashboard();
  const cats = d.categories;
  addForm = { date: d.today, amount: '', category: '食費', store: '', memo: '', items: [] };

  const ocrNote = d.ocrAvailable
    ? ''
    : `<div class="banner info">📷 レシート自動読み取りは未設定です（手入力でOK）。設定するとボタンが使えます。</div>`;

  app.innerHTML = `
    <h1 class="page-title">支出を追加</h1>
    ${ocrNote}

    <div class="card">
      <input type="file" id="receipt-file" accept="image/*" capture="environment" hidden />
      <div class="shoot" id="shoot">
        <div class="big">📷</div>
        <div><b>レシートを撮影 / 選択</b></div>
        <div class="muted">写真から店名・金額・品目を自動入力</div>
      </div>
      <img id="preview" class="preview" hidden />
      <div id="ocr-status"></div>
    </div>

    <div id="warn-area"></div>

    <div class="card">
      <label class="field">
        <span>金額</span>
        <input id="f-amount" class="amount-input" type="number" inputmode="numeric" placeholder="0" />
      </label>
      <label class="field">
        <span>カテゴリ</span>
        <div class="chips" id="f-cats">
          ${cats.map((c) => `<span class="chip ${c === addForm.category ? 'active' : ''}" data-c="${esc(c)}">${esc(c)}</span>`).join('')}
        </div>
      </label>
      <label class="field"><span>日付</span><input id="f-date" type="date" value="${addForm.date}" /></label>
      <label class="field"><span>店名（任意）</span><input id="f-store" type="text" placeholder="例: スーパー○○" /></label>
      <label class="field"><span>メモ（任意）</span><textarea id="f-memo" placeholder="品目など"></textarea></label>
      <button class="btn" id="f-save">保存する</button>
    </div>
  `;

  // カテゴリ選択
  const catsEl = document.getElementById('f-cats');
  catsEl.onclick = (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    catsEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    addForm.category = chip.dataset.c;
    showWarning(d.regret[addForm.category]);
  };

  // レシート撮影
  const fileInput = document.getElementById('receipt-file');
  document.getElementById('shoot').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const status = document.getElementById('ocr-status');
    const preview = document.getElementById('preview');
    let dataUrl;
    try {
      dataUrl = await fileToCompressedDataUrl(file);
    } catch { toast('画像を読み込めませんでした'); return; }
    preview.src = dataUrl;
    preview.hidden = false;
    status.innerHTML = `<div class="banner info"><span class="spin" style="border-color:#bfdbfe;border-top-color:#1e40af"></span> レシートを読み取り中…</div>`;
    try {
      const r = await api.ocr(dataUrl);
      // フォームに反映
      if (r.total) document.getElementById('f-amount').value = r.total;
      if (r.date) document.getElementById('f-date').value = r.date;
      if (r.store) document.getElementById('f-store').value = r.store;
      if (r.items && r.items.length) {
        document.getElementById('f-memo').value = r.items.map((it) => `${it.name} ${it.price ? yen(it.price) : ''}`.trim()).join('\n');
        addForm.items = r.items;
      }
      // カテゴリ反映
      catsEl.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.c === r.category));
      addForm.category = r.category;
      status.innerHTML = `<div class="banner info">✅ 読み取り完了。内容を確認して保存してください。</div>`;
      showWarning(r.warning || d.regret[r.category]);
    } catch (e) {
      const hint = e.code === 'NO_API_KEY' ? '（設定でAPIキーを登録すると使えます）' : '';
      status.innerHTML = `<div class="banner warn">読み取りに失敗: ${esc(e.message)} ${hint}<br>金額だけ手入力でも保存できます。</div>`;
    }
  };

  // 後悔警告（カテゴリ平均が低いとき）
  function showWarning(reg) {
    const area = document.getElementById('warn-area');
    // regは {avg,count} か OCRのwarning {message} のどちらか
    if (!reg) { area.innerHTML = ''; return; }
    if (reg.message) { area.innerHTML = `<div class="banner warn">🤔 ${esc(reg.message)}</div>`; return; }
    if (typeof reg.avg === 'number' && reg.count >= 2 && reg.avg <= 2.5) {
      area.innerHTML = `<div class="banner warn">🤔 このカテゴリ、後悔しがちかも（平均満足度 ★${reg.avg.toFixed(1)} / ${reg.count}件）。本当に必要？</div>`;
    } else { area.innerHTML = ''; }
  }
  showWarning(d.regret[addForm.category]);

  // 保存
  document.getElementById('f-save').onclick = async () => {
    const amount = +document.getElementById('f-amount').value;
    if (!amount || amount <= 0) { toast('金額を入力してください'); return; }
    const payload = {
      amount,
      category: addForm.category,
      date: document.getElementById('f-date').value,
      store: document.getElementById('f-store').value,
      memo: document.getElementById('f-memo').value,
      items: addForm.items,
    };
    try {
      const r = await api.addTx(payload);
      toast('保存しました ✅');
      location.hash = '#/';
    } catch (e) { toast(e.message); }
  };
}

// ================= 欲しいリスト（衝動買いクールダウン）=================
async function renderWants() {
  const [d, wants] = await Promise.all([api.dashboard(), api.listWants()]);
  const now = Date.now();

  const waiting = wants.filter((w) => w.status === 'waiting');
  const ready = waiting.filter((w) => new Date(w.cooldownUntil).getTime() <= now);
  const cooling = waiting.filter((w) => new Date(w.cooldownUntil).getTime() > now);
  const decided = wants.filter((w) => w.status !== 'waiting').slice(0, 20);

  const wantItem = (w) => {
    const ms = new Date(w.cooldownUntil).getTime() - now;
    const isReady = ms <= 0;
    const remain = isReady ? '判定待ち！' : `あと ${Math.ceil(ms / (1000 * 60 * 60 * 24))}日 待つ`;
    return `
      <div class="item">
        <span class="cat-tag">${esc(w.category)}</span>
        <div class="grow">
          <div class="ttl">${esc(w.name)}</div>
          <div class="cooldown ${isReady ? 'ready' : ''}">${esc(remain)}</div>
        </div>
        <div class="amt">${yen(w.price)}</div>
      </div>
      ${isReady ? `<div class="btn-row" style="margin:-6px 0 14px">
          <button class="btn gold small" data-resist="${w.id}">我慢する 💪</button>
          <button class="btn secondary small" data-buy="${w.id}">買う</button>
          <button class="btn ghost small" data-del="${w.id}">削除</button>
        </div>` : `<div style="margin:-8px 0 12px;text-align:right"><button class="btn ghost small" data-del="${w.id}">削除</button></div>`}
    `;
  };

  const decidedItem = (w) => `
    <div class="item">
      <span class="cat-tag" style="${w.status === 'resisted' ? 'background:#fef3c7;color:#92400e' : ''}">${w.status === 'resisted' ? '我慢した💪' : '買った'}</span>
      <div class="grow"><div class="ttl">${esc(w.name)}</div><div class="meta">${fmtDate((w.decidedAt || '').slice(0, 10))}</div></div>
      <div class="amt">${yen(w.price)}</div>
    </div>`;

  app.innerHTML = `
    <h1 class="page-title">欲しいモノ 🛒</h1>
    <div class="banner info">欲しい！と思ったらまず登録。<b>数日のクールダウン</b>後に「本当に欲しいか」を判定します。衝動買いを防ぐ仕組み。</div>

    <div class="card">
      <label class="field"><span>欲しいモノ</span><input id="w-name" type="text" placeholder="例: 新しいスニーカー" /></label>
      <div class="btn-row">
        <label class="field" style="flex:1"><span>金額</span><input id="w-price" type="number" inputmode="numeric" placeholder="0" /></label>
        <label class="field" style="width:120px"><span>冷却日数</span><input id="w-days" type="number" inputmode="numeric" placeholder="3" /></label>
      </div>
      <label class="field"><span>カテゴリ</span>
        <select id="w-cat">${d.categories.map((c) => `<option ${c === 'その他' ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      </label>
      <button class="btn" id="w-add">クールダウンに入れる ⏳</button>
    </div>

    ${ready.length ? `<h2 class="section">⏰ 判定待ち（${ready.length}）</h2><div class="card">${ready.map(wantItem).join('')}</div>` : ''}
    ${cooling.length ? `<h2 class="section">⏳ 冷却中（${cooling.length}）</h2><div class="card">${cooling.map(wantItem).join('')}</div>` : ''}
    ${decided.length ? `<h2 class="section">これまでの判定</h2><div class="card">${decided.map(decidedItem).join('')}</div>` : ''}
    ${!wants.length ? `<div class="empty"><div class="big">🛍️</div><p>まだ登録がありません</p></div>` : ''}
  `;

  // 既定冷却日数をプレースホルダに反映（settingsから）
  api.getSettings().then((s) => { document.getElementById('w-days').placeholder = String(s.cooldownDays); });

  document.getElementById('w-add').onclick = async () => {
    const name = document.getElementById('w-name').value.trim();
    if (!name) { toast('欲しいモノの名前を入れてください'); return; }
    const price = +document.getElementById('w-price').value || 0;
    const daysVal = document.getElementById('w-days').value;
    const body = { name, price, category: document.getElementById('w-cat').value };
    if (daysVal !== '') body.cooldownDays = +daysVal;
    try {
      await api.addWant(body);
      toast('クールダウン開始 ⏳');
      renderWants();
    } catch (e) { toast(e.message); }
  };

  app.querySelectorAll('[data-resist]').forEach((b) => b.onclick = async () => {
    try { await api.decideWant(b.dataset.resist, 'resisted'); toast('えらい！我慢貯金に追加 💪'); renderWants(); }
    catch (e) { toast(e.message); }
  });
  app.querySelectorAll('[data-buy]').forEach((b) => b.onclick = async () => {
    if (!confirm('購入として支出に記録します。よろしいですか？')) return;
    try { await api.decideWant(b.dataset.buy, 'bought'); toast('支出に記録しました'); renderWants(); }
    catch (e) { toast(e.message); }
  });
  app.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    try { await api.deleteWant(b.dataset.del); renderWants(); } catch (e) { toast(e.message); }
  });
}

// ================= 履歴（＋後悔メーター評価）=================
async function renderHistory() {
  const month = thisMonth();
  const list = await api.listTx(month);
  const total = list.reduce((s, t) => s + t.amount, 0);

  const row = (t) => `
    <div class="item">
      <span class="cat-tag">${esc(t.category)}</span>
      <div class="grow">
        <div class="ttl">${esc(t.store || t.memo.split('\n')[0] || t.category)}</div>
        <div class="meta">${fmtDate(t.date)}</div>
        <div class="rate-row">
          ${starsHtml(t.satisfaction || 0, true)}
          <span class="muted" data-rl="${t.id}">${t.satisfaction ? '満足度を記録済み' : '満足度は？'}</span>
        </div>
      </div>
      <div style="text-align:right">
        <div class="amt">${yen(t.amount)}</div>
        <button class="btn ghost small" data-del="${t.id}" style="color:var(--danger)">削除</button>
      </div>
    </div>`;

  app.innerHTML = `
    <h1 class="page-title">履歴</h1>
    <div class="kpi">
      <div class="box"><div class="n">${yen(total)}</div><div class="t">${month} の合計</div></div>
      <div class="box"><div class="n">${list.length}</div><div class="t">件数</div></div>
    </div>
    <div class="banner info mt">⭐ 買ったものに満足度をつけると、後悔しがちなカテゴリを次回の追加時に教えてくれます。</div>
    ${list.length ? `<div class="card mt">${list.map(row).join('')}</div>` : `<div class="empty"><div class="big">🧾</div><p>今月の記録はまだありません</p></div>`}
  `;

  // 星評価
  app.querySelectorAll('.stars[data-editable]').forEach((stars) => {
    const id = stars.closest('.item').querySelector('[data-rl]').dataset.rl;
    stars.querySelectorAll('.s').forEach((s) => s.onclick = async () => {
      const v = +s.dataset.v;
      stars.querySelectorAll('.s').forEach((x) => x.classList.toggle('on', +x.dataset.v <= v));
      try {
        await api.updateTx(id, { satisfaction: v });
        stars.closest('.item').querySelector('[data-rl]').textContent = '記録しました ✓';
        toast('満足度を記録しました');
      } catch (e) { toast(e.message); }
    });
  });

  app.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('この記録を削除しますか？')) return;
    try { await api.deleteTx(b.dataset.del); renderHistory(); } catch (e) { toast(e.message); }
  });
}

// ================= 設定 =================
async function renderSettings() {
  const [s, d] = await Promise.all([api.getSettings(), api.dashboard()]);
  app.innerHTML = `
    <h1 class="page-title">設定</h1>
    <div class="card">
      <label class="field"><span>1か月の予算（円）</span><input id="s-budget" type="number" inputmode="numeric" value="${s.monthlyBudget}" /></label>
      <label class="field"><span>衝動買いクールダウンの既定日数</span><input id="s-cool" type="number" inputmode="numeric" value="${s.cooldownDays}" /></label>
      <label class="field"><span>我慢貯金の目標額（任意・0で非表示）</span><input id="s-goal" type="number" inputmode="numeric" value="${s.gamanGoal}" /></label>
      <button class="btn" id="s-save">保存</button>
    </div>

    <h2 class="section">レシート自動読み取り（OCR）</h2>
    <div class="card">
      <div class="row-between">
        <div>状態</div>
        <b style="color:${d.ocrAvailable ? 'var(--brand)' : 'var(--sub)'}">${d.ocrAvailable ? '✅ 有効' : '⚠️ 未設定'}</b>
      </div>
      ${d.ocrAvailable ? '' : `<p class="muted mt">サーバーの <code>.env</code> に <code>ANTHROPIC_API_KEY</code> を設定すると、レシート写真からの自動入力が使えます。設定しなくても手入力で全機能使えます。</p>`}
    </div>

    <h2 class="section">このアプリについて</h2>
    <div class="card">
      <p class="muted">ズボラさん向け家計簿。<br>
      ・📷 レシート撮影で自動入力<br>
      ・⏳ 衝動買いクールダウン<br>
      ・💪 我慢貯金（我慢した額が貯まる）<br>
      ・📅 「あと何日もつ」メーター<br>
      ・⭐ 後悔メーター（満足度の記録）</p>
    </div>
  `;

  document.getElementById('s-save').onclick = async () => {
    try {
      await api.saveSettings({
        monthlyBudget: +document.getElementById('s-budget').value,
        cooldownDays: +document.getElementById('s-cool').value,
        gamanGoal: +document.getElementById('s-goal').value,
      });
      toast('保存しました ✅');
    } catch (e) { toast(e.message); }
  };
}

// ---------- Service Worker 登録 ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
