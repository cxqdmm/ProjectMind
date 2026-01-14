<template>
  <div class="token-panel" v-if="visible">
    <div class="token-line">
      最近一次：输入 {{ formatTokens(tokenLast?.promptTokens) }} / 输出 {{ formatTokens(tokenLast?.completionTokens) }} / 合计 {{ formatTokens(tokenLast?.totalTokens) }}
      <span v-if="tokenLast?.estimated" class="token-hint">（估算）</span>
    </div>
    <div class="token-line">
      累计：输入 {{ formatTokens(tokenTotal?.promptTokens) }} / 输出 {{ formatTokens(tokenTotal?.completionTokens) }} / 合计 {{ formatTokens(tokenTotal?.totalTokens) }}
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  visible: { type: Boolean, default: false },
  tokenLast: { type: Object, default: () => ({}) },
  tokenTotal: { type: Object, default: () => ({}) },
})

function formatTokens(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '-'
  return String(Math.max(0, Math.floor(v)))
}
</script>

