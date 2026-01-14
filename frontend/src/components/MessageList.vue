<template>
  <div class="messages" ref="listRef">
    <MessageItem
      v-for="(m, idx) in messages"
      :key="idx"
      :message="m"
      :index="idx"
      :renderMarkdown="renderMarkdown"
      :isOpen="isOpen"
      :toggle="toggle"
    />
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import MessageItem from './MessageItem.vue'

defineProps({
  messages: { type: Array, required: true },
  renderMarkdown: { type: Function, required: true },
  isOpen: { type: Function, required: true },
  toggle: { type: Function, required: true },
})

const listRef = ref(null)

async function scrollToBottom() {
  await nextTick()
  const el = listRef.value
  if (el) el.scrollTop = el.scrollHeight
}

defineExpose({ scrollToBottom })
</script>

