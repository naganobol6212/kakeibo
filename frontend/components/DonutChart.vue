<template>
  <div>
    <svg :viewBox="`0 0 ${size} ${size}`" :width="size" :height="size" style="display:block;margin:0 auto" role="img">
      <circle :cx="c" :cy="c" :r="r" fill="none" stroke="#f3f4f6" :stroke-width="sw" />
      <circle
        v-for="(seg, i) in segments" :key="i"
        :cx="c" :cy="c" :r="r" fill="none"
        :stroke="seg.color" :stroke-width="sw"
        :stroke-dasharray="`${seg.len} ${circ - seg.len}`"
        :stroke-dashoffset="seg.offset"
        :transform="`rotate(-90 ${c} ${c})`"
      />
      <text :x="c" :y="c - 4" text-anchor="middle" font-size="13" fill="#6b7280">合計</text>
      <text :x="c" :y="c + 16" text-anchor="middle" font-size="18" font-weight="800" fill="#1f2937">{{ yen(total) }}</text>
    </svg>
    <div class="chart-legend">
      <div class="lg" v-for="(seg, i) in segments" :key="i">
        <span class="dot" :style="{ background: seg.color }"></span>
        <span class="nm">{{ seg.category }}</span>
        <span class="va">{{ yen(seg.value) }}・{{ seg.pct }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ data: { category: string; total: number }[] }>()

const size = 200
const sw = 26
const c = size / 2
const r = c - sw / 2 - 2
const circ = 2 * Math.PI * r

const PALETTE = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#9ca3af']

const total = computed(() => props.data.reduce((s, d) => s + d.total, 0))

const segments = computed(() => {
  let acc = 0
  const t = total.value || 1
  return props.data.map((d, i) => {
    const frac = d.total / t
    const len = frac * circ
    const offset = -acc * circ
    acc += frac
    return {
      category: d.category,
      value: d.total,
      pct: Math.round(frac * 100),
      color: PALETTE[i % PALETTE.length],
      len,
      offset,
    }
  })
})
</script>
