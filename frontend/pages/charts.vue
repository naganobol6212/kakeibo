<template>
  <div class="page">
    <h1 class="page-title">グラフ 📊</h1>

    <h2 class="section">月ごとの支出（直近6か月）</h2>
    <div class="card">
      <BarChart v-if="monthly.length" :data="monthly" />
      <div v-else class="empty"><p>データがありません</p></div>
    </div>

    <h2 class="section">今月のカテゴリ別内訳</h2>
    <div class="card">
      <DonutChart v-if="categories.length" :data="categories" />
      <div v-else class="empty"><div class="big">🍩</div><p>今月の支出がまだありません</p></div>
    </div>
  </div>
</template>

<script setup lang="ts">
const api = useApi()
const { data } = await useAsyncData('charts', async () => {
  const [monthly, categories] = await Promise.all([api.statsMonthly(6), api.statsCategories()])
  return { monthly, categories }
})
const monthly = computed<any[]>(() => data.value?.monthly ?? [])
const categories = computed<any[]>(() => data.value?.categories ?? [])
</script>
