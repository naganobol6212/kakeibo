<template>
  <div class="page">
    <h1 class="page-title">設定</h1>
    <div class="card">
      <label class="field"><span>1か月の予算（円）</span><input v-model.number="s.monthlyBudget" type="number" inputmode="numeric" /></label>
      <label class="field"><span>衝動買いクールダウンの既定日数</span><input v-model.number="s.cooldownDays" type="number" inputmode="numeric" /></label>
      <label class="field"><span>我慢貯金の目標額（任意・0で非表示）</span><input v-model.number="s.gamanGoal" type="number" inputmode="numeric" /></label>
      <button class="btn" @click="save">保存</button>
    </div>

    <h2 class="section">レシート自動読み取り（OCR）</h2>
    <div class="card">
      <div class="row-between">
        <div>状態</div>
        <b :style="{ color: ocr ? 'var(--brand)' : 'var(--sub)' }">{{ ocr ? '✅ 有効' : '⚠️ 未設定' }}</b>
      </div>
      <p v-if="!ocr" class="muted mt">
        バックエンドの <code>backend/.env</code> に <code>ANTHROPIC_API_KEY</code> を設定すると、レシート写真からの自動入力が使えます。設定しなくても手入力で全機能使えます。
      </p>
    </div>

    <h2 class="section">このアプリについて</h2>
    <div class="card">
      <p class="muted">
        ズボラさん向け家計簿。<br>
        ・📷 レシート撮影で自動入力（画像も保存）<br>
        ・⏳ 衝動買いクールダウン<br>
        ・💪 我慢貯金（我慢した額が貯まる）<br>
        ・📅 「あと何日もつ」メーター<br>
        ・⭐ 後悔メーター（満足度の記録）<br>
        ・📊 月推移・カテゴリ別グラフ
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
const api = useApi()
const toast = useToast()

const { data } = await useAsyncData('settings', async () => {
  const [settings, dash] = await Promise.all([api.getSettings(), api.dashboard()])
  return { settings, ocr: dash.ocrAvailable }
})

const s = reactive({
  monthlyBudget: data.value?.settings.monthlyBudget ?? 50000,
  cooldownDays: data.value?.settings.cooldownDays ?? 3,
  gamanGoal: data.value?.settings.gamanGoal ?? 0,
})
const ocr = computed(() => data.value?.ocr ?? false)

async function save() {
  try {
    await api.saveSettings({ monthlyBudget: s.monthlyBudget, cooldownDays: s.cooldownDays, gamanGoal: s.gamanGoal })
    toast.show('保存しました ✅')
  } catch (e: any) { toast.show(e.message) }
}
</script>
