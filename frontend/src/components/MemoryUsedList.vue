<template>
  <div v-if="items.length" class="memory-card">
    <div class="memory-card-head">
      <span class="memory-pill">记忆</span>
      <span class="memory-subtitle">本轮使用的技能记忆</span>
    </div>
    <div class="memory-list">
      <div v-for="(m, idx) in items" :key="m.key || `${m.skill || ''}::${m.toolName || ''}::${m.reference || ''}::${m.script || ''}::${idx}`" class="memory-item">
        <div class="memory-item-title">
          <span class="memory-item-skill">{{ m.skill || '未知技能' }}</span>
          <span class="memory-item-kind" :class="kindClass(m)">{{ kindText(m) }}</span>
          <span v-if="m.toolName === 'readReference' && m.reference" class="memory-item-ref">{{ m.reference }}</span>
          <span v-else-if="m.toolName === 'call' && m.script" class="memory-item-ref">{{ scriptName(m.script) }}</span>
        </div>
        <div v-if="m.snippet" class="memory-item-snippet">{{ m.snippet }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  memories: {
    type: Array,
    default: () => [],
  },
})

const items = computed(() => {
  return Array.isArray(props.memories) ? props.memories : []
})

function kindText(m) {
  const t = String(m?.toolName || '')
  if (t === 'readReference') return '参考文件'
  if (t === 'call') return '脚本调用'
  return '技能描述'
}

function kindClass(m) {
  const t = String(m?.toolName || '')
  if (t === 'readReference') return 'kind-ref'
  if (t === 'call') return 'kind-call'
  return 'kind-skill'
}

function scriptName(p) {
  const s = String(p || '').trim()
  if (!s) return ''
  const parts = s.split('/')
  return parts[parts.length - 1] || s
}
</script>

<style scoped>
.memory-card {
  margin: 12px 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #f8fafc;
}

.memory-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.memory-pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0369a1;
  font-weight: 600;
}

.memory-subtitle {
  font-size: 12px;
  color: #64748b;
}

.memory-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.memory-item {
  font-size: 12px;
  color: #0f172a;
}

.memory-item-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.memory-item-skill {
  font-weight: 600;
}

.memory-item-kind {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  color: #475569;
  background: #ffffff;
}

.memory-item-kind.kind-skill {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}

.memory-item-kind.kind-ref {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #334155;
}

.memory-item-kind.kind-call {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #047857;
}

.memory-item-ref {
  font-size: 11px;
  color: #64748b;
}

.memory-item-snippet {
  font-size: 12px;
  color: #475569;
  white-space: pre-wrap;
}
</style>
