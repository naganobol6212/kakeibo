<template>
  <div class="page">
    <h1 class="page-title">支出を追加</h1>

    <div v-if="d && !d.ocrAvailable" class="banner info">
      📷 レシート自動読み取りは未設定です（手入力でOK）。設定するとボタンが使えます。
    </div>

    <div class="card">
      <input ref="fileInput" type="file" accept="image/*" capture="environment" hidden @change="onFile" />
      <div class="shoot" @click="fileInput?.click()">
        <div class="big">📷</div>
        <div><b>レシートを撮影 / 選択</b></div>
        <div class="muted">写真から店名・金額・品目を自動入力</div>
      </div>
      <img v-if="preview" :src="preview" class="preview" />
      <div v-if="ocrState" class="banner mt" :class="ocrState.type">
        <span v-if="ocrState.loading" class="spin"></span>
        {{ ocrState.msg }}
      </div>
    </div>

    <div v-if="warning" class="banner warn">🤔 {{ warning }} 本当に必要？</div>

    <div class="card">
      <label class="field">
        <span>金額</span>
        <input v-model.number="form.amount" class="amount-input" type="number" inputmode="numeric" placeholder="0" />
      </label>
      <label class="field">
        <span>カテゴリ</span>
        <div class="chips">
          <span
            v-for="c in categories" :key="c"
            class="chip" :class="{ active: form.category === c }"
            @click="selectCat(c)"
          >{{ c }}</span>
        </div>
      </label>
      <label class="field"><span>日付</span><input v-model="form.date" type="date" /></label>
      <label class="field"><span>店名（任意）</span><input v-model="form.store" type="text" placeholder="例: スーパー○○" /></label>
      <label class="field"><span>メモ（任意）</span><textarea v-model="form.memo" placeholder="品目など"></textarea></label>
      <button class="btn" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存する' }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
const api = useApi()
const toast = useToast()
const router = useRouter()

const { data: d } = await useAsyncData('add-dashboard', () => api.dashboard())
const categories = computed<string[]>(() => d.value?.categories ?? [])
const regret = computed<any>(() => d.value?.regret ?? {})

const fileInput = ref<HTMLInputElement | null>(null)
const preview = ref('')
const imageData = ref('')
const ocrState = ref<{ type: string; msg: string; loading: boolean } | null>(null)
const warning = ref('')
const saving = ref(false)

const form = reactive({
  amount: null as number | null,
  category: 'その他',
  date: '',
  store: '',
  memo: '',
  items: [] as any[],
})

watchEffect(() => {
  if (d.value && !form.date) form.date = d.value.today
  if (d.value && form.category === 'その他' && categories.value[0]) form.category = categories.value[0]
})

function checkRegret(cat: string) {
  const r = regret.value[cat]
  warning.value = r && r.count >= 2 && r.avg <= 2.5
    ? `このカテゴリ、後悔しがちかも（平均満足度 ★${(Math.round(r.avg * 10) / 10).toFixed(1)} / ${r.count}件）。`
    : ''
}

function selectCat(c: string) {
  form.category = c
  checkRegret(c)
}

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    imageData.value = await fileToCompressedDataUrl(file)
    preview.value = imageData.value
  } catch { toast.show('画像を読み込めませんでした'); return }

  ocrState.value = { type: 'info', msg: 'レシートを読み取り中…', loading: true }
  try {
    const r: any = await api.ocr(imageData.value)
    if (r.total) form.amount = r.total
    if (r.date) form.date = r.date
    if (r.store) form.store = r.store
    if (r.items?.length) {
      form.items = r.items
      form.memo = r.items.map((it: any) => `${it.name} ${it.price ? yen(it.price) : ''}`.trim()).join('\n')
    }
    if (r.category) form.category = r.category
    ocrState.value = { type: 'info', msg: '✅ 読み取り完了。内容を確認して保存してください。', loading: false }
    warning.value = r.warning?.message ? `${r.warning.message}。` : ''
    if (!warning.value) checkRegret(form.category)
  } catch (e: any) {
    const hint = e.code === 'NO_API_KEY' ? '（設定でAPIキーを登録すると使えます）' : ''
    ocrState.value = { type: 'warn', msg: `読み取りに失敗: ${e.message} ${hint} 金額だけ手入力でも保存できます。`, loading: false }
  }
}

async function save() {
  if (!form.amount || form.amount <= 0) { toast.show('金額を入力してください'); return }
  saving.value = true
  try {
    await api.addTx({
      amount: form.amount,
      category: form.category,
      date: form.date,
      store: form.store,
      memo: form.memo,
      items: form.items,
      image: imageData.value || null,
    })
    toast.show('保存しました ✅')
    router.push('/')
  } catch (e: any) {
    toast.show(e.message)
  } finally {
    saving.value = false
  }
}
</script>
