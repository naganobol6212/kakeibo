<template>
  <div>
    <NuxtPage />
    <AppTabbar />
    <div v-if="toast.message.value" class="toast">{{ toast.message.value }}</div>
  </div>
</template>

<script setup lang="ts">
const toast = useToast()
</script>
