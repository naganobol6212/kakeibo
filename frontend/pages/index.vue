<template>
  <div class="page">
    <div v-if="pending" class="loading">読み込み中…</div>
    <template v-else-if="d">
      <h1 class="page-title">こんにちは 👋</h1>

      <NuxtLink v-if="d.due.length" to="/wants" class="banner danger row-between" style="text-decoration:none">
        <span>🛒 クールダウンが明けた欲しいモノが {{ d.due.length }} 件あります</span>
        <span class="btn ghost">確認</span>
      </NuxtLink>

      <div class="card meter-card" :class="m.level">
        <div class="meter-days">{{ m.key }} の残り予算でいくと…</div>
        <div class="meter-big" v-html="bigText"></div>
        <div class="meter-bar"><i :style="{ width: pct + '%' }"></i></div>
        <div class="meter-row">
          <span>使った <b>{{ yen(m.spent) }}</b></span>
          <span>予算 <b>{{ yen(m.budget) }}</b></span>
        </div>
        <p class="meter-sub">{{ levelMsg }}</p>
      </div>

      <div class="kpi">
        <div class="box"><div class="n">{{ yen(m.safeDailyAllowance) }}</div><div class="t">今日からの1日あたり目安</div></div>
        <div class="box"><div class="n">{{ yen(m.projected) }}</div><div class="t">このペースの着地予測</div></div>
      </div>

      <div class="card gaman-card mt">
        <div class="label">💪 我慢貯金（買わずに我慢した額）</div>
        <div class="gaman-amount">{{ yen(g.total) }}</div>
        <div class="gaman-meta">我慢した回数 {{ g.resistedCount }}回</div>
        <template v-if="g.goal > 0">
          <div class="meter-bar" style="margin-top:10px"><i :style="{ width: goalPct + '%', background: '#92400e' }"></i></div>
          <div class="gaman-meta">目標 {{ yen(g.goal) }} まであと {{ yen(Math.max(0, g.goal - g.total)) }}</div>
        </template>
        <div class="btn-row mt">
          <button class="btn gold small" @click="addGaman">いま我慢した！</button>
        </div>
      </div>

      <div class="btn-row mt">
        <NuxtLink class="btn" to="/add">📷 支出を追加</NuxtLink>
        <NuxtLink class="btn secondary" to="/wants">🛒 欲しいを登録</NuxtLink>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
const api = useApi()
const toast = useToast()

const { data: d, pending, refresh } = await useAsyncData('dashboard', () => api.dashboard())

const m = computed<any>(() => d.value?.month ?? {})
const g = computed<any>(() => d.value?.gaman ?? {})
const pct = computed(() => (m.value.budget > 0 ? Math.min(100, Math.round((m.value.spent / m.value.budget) * 100)) : 0))
const goalPct = computed(() => (g.value.goal > 0 ? Math.min(100, Math.round((g.value.total / g.value.goal) * 100)) : 0))

const bigText = computed(() => {
  const lv = m.value.level
  if (lv === 'over') return '予算オーバー'
  if (lv === 'safe') return '月末まで<small> OK</small> ◎'
  return `あと<small> </small>${m.value.lastsDays}<small>日</small>`
})

const levelMsg = computed(() => {
  const lv = m.value.level
  if (lv === 'over') return `今月はすでに ${yen(-m.value.remaining)} 超過。来月に向けて我慢貯金で取り返そう。`
  if (lv === 'safe') return `今のペースなら、あと${m.value.daysLeft}日の月末まで乗り切れそう。いい調子！`
  if (lv === 'danger') return `⚠️ このペースだと月末（あと${m.value.daysLeft}日）より早く尽きます。1日 ${yen(m.value.safeDailyAllowance)} までに抑えて！`
  return `そろそろ注意。1日 ${yen(m.value.safeDailyAllowance)} までに抑えると安心。`
})

async function addGaman() {
  const amount = prompt('我慢した金額（円）を入力:')
  if (!amount) return
  const label = prompt('何を我慢した？（任意）') || ''
  try {
    await api.addGaman(Number(amount), label)
    toast.show('我慢貯金に追加しました 💪')
    refresh()
  } catch (e: any) { toast.show(e.message) }
}
</script>
