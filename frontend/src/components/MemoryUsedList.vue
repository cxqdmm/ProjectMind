<template>
  <div v-if="items.length" class="memory-card">
    <div class="memory-card-head">
      <span class="memory-pill">记忆</span>
      <span class="memory-subtitle">本轮使用的技能记忆</span>
    </div>
    <div class="memory-list">
      <div v-for="m in items" :key="m.id" class="memory-item">
        <div class="memory-item-title">
          <span class="memory-item-skill">{{ m.skill || '未知技能' }}</span>
          <span v-if="m.reference" class="memory-item-ref">{{ m.reference }}</span>
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
