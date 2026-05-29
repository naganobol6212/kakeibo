// Python API(FastAPI) との通信をまとめる。
export const yen = (n: number) => '¥' + Math.round(n || 0).toLocaleString('ja-JP')

async function req(method: string, url: string, body?: any) {
  try {
    return await $fetch(url, { method, body } as any)
  } catch (e: any) {
    const detail = e?.data?.detail
    const msg: any = (detail && (detail.error ?? detail)) ?? e?.data?.error ?? e?.message
    const err: any = new Error(typeof msg === 'string' ? msg : 'エラーが発生しました')
    err.code = detail?.code
    err.status = e?.status ?? e?.statusCode
    throw err
  }
}

export interface Tx {
  id: string; date: string; amount: number; category: string; store: string;
  memo: string; items: { name: string; price: number }[]; satisfaction: number | null;
  image: string | null; createdAt: string
}

export function useApi() {
  return {
    dashboard: () => req('GET', '/api/dashboard'),
    getSettings: () => req('GET', '/api/settings'),
    saveSettings: (s: any) => req('PUT', '/api/settings', s),

    ocr: (image: string) => req('POST', '/api/ocr', { image }),

    listTx: (month?: string) => req('GET', `/api/transactions${month ? `?month=${month}` : ''}`),
    addTx: (tx: any) => req('POST', '/api/transactions', tx),
    updateTx: (id: string, patch: any) => req('PUT', `/api/transactions/${id}`, patch),
    deleteTx: (id: string) => req('DELETE', `/api/transactions/${id}`),

    listWants: () => req('GET', '/api/wants'),
    addWant: (w: any) => req('POST', '/api/wants', w),
    decideWant: (id: string, action: string) => req('POST', `/api/wants/${id}/decide`, { action }),
    deleteWant: (id: string) => req('DELETE', `/api/wants/${id}`),

    addGaman: (amount: number, label: string) => req('POST', '/api/gaman', { amount, label }),

    statsMonthly: (months = 6) => req('GET', `/api/stats/monthly?months=${months}`),
    statsCategories: (month?: string) => req('GET', `/api/stats/categories${month ? `?month=${month}` : ''}`),
  }
}
