<template>
  <form class="input-row" @submit.prevent="onSubmit">
    <input v-model.trim="text" type="text" placeholder="请输入问题或指令" />
    <button type="submit" :disabled="sending">{{ sending ? '发送中...' : '发送' }}</button>
  </form>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  sending: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'send'])

const text = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', String(v ?? '')),
})

function onSubmit() {
  emit('send', String(props.modelValue || '').trim())
}
</script>

