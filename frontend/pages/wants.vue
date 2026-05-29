<template>
  <div class="page">
    <h1 class="page-title">欲しいモノ 🛒</h1>
    <div class="banner info">
      欲しい！と思ったらまず登録。<b>数日のクールダウン</b>後に「本当に欲しいか」を判定します。衝動買いを防ぐ仕組み。
    </div>

    <div class="card">
      <label class="field"><span>欲しいモノ</span><input v-model="form.name" type="text" placeholder="例: 新しいスニーカー" /></label>
      <div class="btn-row">
        <label class="field" style="flex:1"><span>金額</span><input v-model.number="form.price" type="number" inputmode="numeric" placeholder="0" /></label>
        <label class="field" style="width:120px"><span>冷却日数</span><input v-model.number="form.cooldownDays" type="number" inputmode="numeric" :placeholder="String(defaultCooldown)" /></label>
      </div>
      <label class="field"><span>カテゴリ</span>
        <select v-model="form.category">
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <button class="btn" @click="add">クールダウンに入れる ⏳</button>
    </div>

    <template v-if="ready.length">
      <h2 class="section">⏰ 判定待ち（{{ ready.length }}）</h2>
      <div class="card">
        <div v-for="w in ready" :key="w.id">
          <div class="item">
            <span class="cat-tag">{{ w.category }}</span>
            <div class="grow"><div class="ttl">{{ w.name }}</div><div class="cooldown ready">判定待ち！</div></div>
            <div class="amt">{{ yen(w.price) }}</div>
          </div>
          <div class="btn-row" style="margin:-6px 0 14px">
            <button class="btn gold small" @click="decide(w, 'resisted')">我慢する 💪</button>
            <button class="btn secondary small" @click="decide(w, 'bought')">買う</button>
            <button class="btn ghost small" @click="del(w)">削除</button>
          </div>
        </div>
      </div>
    </template>

    <template v-if="cooling.length">
      <h2 class="section">⏳ 冷却中（{{ cooling.length }}）</h2>
      <div class="card">
        <div v-for="w in cooling" :key="w.id" class="item">
          <span class="cat-tag">{{ w.category }}</span>
          <div class="grow"><div class="ttl">{{ w.name }}</div><div class="cooldown">あと {{ remainDays(w) }}日 待つ</div></div>
          <div class="amt">{{ yen(w.price) }}</div>
          <button class="btn ghost small" @click="del(w)">×</button>
        </div>
      </div>
    </template>

    <template v-if="decided.length">
      <h2 class="section">これまでの判定</h2>
      <div class="card">
        <div v-for="w in decided" :key="w.id" class="item">
          <span class="cat-tag" :style="w.status === 'resisted' ? 'background:#fef3c7;color:#92400e' : ''">
            {{ w.status === 'resisted' ? '我慢した💪' : '買った' }}
          </span>
          <div class="grow"><div class="ttl">{{ w.name }}</div><div class="meta">{{ fmtDate((w.decidedAt || '').slice(0, 10)) }}</div></div>
          <div class="amt">{{ yen(w.price) }}</div>
        </div>
      </div>
    </template>

    <div v-if="!wants.length" class="empty"><div class="big">🛍️</div><p>まだ登録がありません</p></div>
  </div>
</template>

<script setup lang="ts">
const api = useApi()
const toast = useToast()

const wants = ref<any[]>([])
const defaultCooldown = ref(3)

const form = reactive({ name: '', price: null as number | null, cooldownDays: null as number | null, category: 'その他' })
const categories = ref<string[]>([])

async function load() {
  const [list, settings, dash] = await Promise.all([api.listWants(), api.getSettings(), api.dashboard()])
  wants.value = list
  defaultCooldown.value = settings.cooldownDays
  categories.value = dash.categories
}
await load()

const now = () => Date.now()
const isReady = (w: any) => new Date(w.cooldownUntil).getTime() <= now()
const ready = computed(() => wants.value.filter((w) => w.status === 'waiting' && isReady(w)))
const cooling = computed(() => wants.value.filter((w) => w.status === 'waiting' && !isReady(w)))
const decided = computed(() => wants.value.filter((w) => w.status !== 'waiting').slice(0, 20))

function remainDays(w: any) {
  return Math.ceil((new Date(w.cooldownUntil).getTime() - now()) / (1000 * 60 * 60 * 24))
}

async function add() {
  if (!form.name.trim()) { toast.show('欲しいモノの名前を入れてください'); return }
  const body: any = { name: form.name.trim(), price: form.price || 0, category: form.category }
  if (form.cooldownDays !== null && form.cooldownDays !== undefined) body.cooldownDays = form.cooldownDays
  try {
    await api.addWant(body)
    toast.show('クールダウン開始 ⏳')
    form.name = ''; form.price = null; form.cooldownDays = null; form.category = 'その他'
    await load()
  } catch (e: any) { toast.show(e.message) }
}

async function decide(w: any, action: string) {
  if (action === 'bought' && !confirm('購入として支出に記録します。よろしいですか？')) return
  try {
    await api.decideWant(w.id, action)
    toast.show(action === 'resisted' ? 'えらい！我慢貯金に追加 💪' : '支出に記録しました')
    await load()
  } catch (e: any) { toast.show(e.message) }
}

async function del(w: any) {
  try { await api.deleteWant(w.id); await load() } catch (e: any) { toast.show(e.message) }
}
</script>
