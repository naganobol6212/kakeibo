<template>
  <div class="page">
    <h1 class="page-title">履歴</h1>
    <div class="kpi">
      <div class="box"><div class="n">{{ yen(total) }}</div><div class="t">{{ month }} の合計</div></div>
      <div class="box"><div class="n">{{ list.length }}</div><div class="t">件数</div></div>
    </div>
    <div class="banner info mt">⭐ 買ったものに満足度をつけると、後悔しがちなカテゴリを次回の追加時に教えてくれます。</div>

    <div v-if="list.length" class="card mt">
      <div v-for="t in list" :key="t.id" class="item">
        <img v-if="t.image" :src="t.image" class="thumb" @click="zoom = t.image" />
        <span v-else class="cat-tag">{{ t.category }}</span>
        <div class="grow">
          <div class="ttl">{{ t.store || (t.memo.split('\n')[0]) || t.category }}</div>
          <div class="meta">{{ fmtDate(t.date) }}・{{ t.category }}</div>
          <div class="rate-row">
            <StarRating :model-value="t.satisfaction || 0" @update:model-value="(v) => rate(t, v)" />
            <span class="muted">{{ t.satisfaction ? '記録済み ✓' : '満足度は？' }}</span>
          </div>
        </div>
        <div style="text-align:right">
          <div class="amt">{{ yen(t.amount) }}</div>
          <button class="btn ghost small" style="color:var(--danger)" @click="del(t)">削除</button>
        </div>
      </div>
    </div>
    <div v-else class="empty"><div class="big">🧾</div><p>今月の記録はまだありません</p></div>

    <div v-if="zoom" class="modal" @click="zoom = ''"><img :src="zoom" /></div>
  </div>
</template>

<script setup lang="ts">
const api = useApi()
const toast = useToast()

const month = thisMonth()
const list = ref<any[]>([])
const zoom = ref('')

async function load() { list.value = await api.listTx(month) }
await load()

const total = computed(() => list.value.reduce((s, t) => s + t.amount, 0))

async function rate(t: any, v: number) {
  t.satisfaction = v
  try { await api.updateTx(t.id, { satisfaction: v }); toast.show('満足度を記録しました') }
  catch (e: any) { toast.show(e.message) }
}

async function del(t: any) {
  if (!confirm('この記録を削除しますか？')) return
  try { await api.deleteTx(t.id); await load() } catch (e: any) { toast.show(e.message) }
}
</script>
