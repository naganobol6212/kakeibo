// サーバーAPIとのやり取りをまとめる薄いラッパー。
async function request(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error((data && data.error) || `エラー (${res.status})`);
    err.code = data && data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  dashboard: () => request('GET', '/api/dashboard'),
  getSettings: () => request('GET', '/api/settings'),
  saveSettings: (s) => request('PUT', '/api/settings', s),

  ocr: (image) => request('POST', '/api/ocr', { image }),

  listTx: (month) => request('GET', `/api/transactions${month ? `?month=${month}` : ''}`),
  addTx: (tx) => request('POST', '/api/transactions', tx),
  updateTx: (id, patch) => request('PUT', `/api/transactions/${id}`, patch),
  deleteTx: (id) => request('DELETE', `/api/transactions/${id}`),

  listWants: () => request('GET', '/api/wants'),
  addWant: (w) => request('POST', '/api/wants', w),
  decideWant: (id, action) => request('POST', `/api/wants/${id}/decide`, { action }),
  deleteWant: (id) => request('DELETE', `/api/wants/${id}`),

  addGaman: (amount, label) => request('POST', '/api/gaman', { amount, label }),
};

export const yen = (n) => '¥' + (Math.round(n || 0)).toLocaleString('ja-JP');
