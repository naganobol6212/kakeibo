<template>
  <span class="stars">
    <span
      v-for="i in 5" :key="i"
      class="s" :class="{ on: i <= modelValue }"
      @click="$emit('update:modelValue', i)"
    >★</span>
  </span>
</template>

<script setup lang="ts">
defineProps<{ modelValue: number }>()
defineEmits<{ (e: 'update:modelValue', v: number): void }>()
</script>
