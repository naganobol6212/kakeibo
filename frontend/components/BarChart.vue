<template>
  <svg :viewBox="`0 0 ${W} ${H}`" width="100%" :height="H" role="img">
    <g v-for="(d, i) in bars" :key="i">
      <rect :x="d.x" :y="d.y" :width="bw" :height="d.h" rx="4" :fill="d.color" />
      <text :x="d.cx" :y="H - 18" text-anchor="middle" class="bar-x">{{ d.label }}</text>
      <text v-if="d.value > 0" :x="d.cx" :y="d.y - 4" text-anchor="middle" class="bar-v">{{ short(d.value) }}</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
const props = defineProps<{ data: { month: string; total: number }[] }>()

const W = 340
const H = 180
const padTop = 22
const padBottom = 30
const bw = 28

const max = computed(() => Math.max(1, ...props.data.map((d) => d.total)))
const step = computed(() => (props.data.length ? W / props.data.length : W))

const bars = computed(() =>
  props.data.map((d, i) => {
    const h = Math.round(((H - padTop - padBottom) * d.total) / max.value)
    const cx = step.value * i + step.value / 2
    const isLast = i === props.data.length - 1
    return {
      x: cx - bw / 2,
      cx,
      y: H - padBottom - h,
      h,
      value: d.total,
      label: d.month.slice(5) + '月',
      color: isLast ? '#10b981' : '#a7f3d0',
    }
  }),
)

function short(n: number) {
  if (n >= 10000) return (n / 10000).toFixed(n % 10000 === 0 ? 0 : 1) + '万'
  if (n >= 1000) return (n / 1000).toFixed(0) + 'k'
  return String(n)
}
</script>
