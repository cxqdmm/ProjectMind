<template>
  <div
    class="debug-log-panel"
    v-if="logs && logs.length"
    :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
  >
    <div
      class="debug-log-header"
      @mousedown="startDrag"
    >
      <div class="debug-log-title" @click.stop="expanded = !expanded">
        <span class="debug-icon">🐞</span>
        <span>调试日志 ({{ logs.length }})</span>
      </div>
      <button class="debug-toggle" @click.stop="expanded = !expanded">
        {{ expanded ? '收起' : '展开' }}
      </button>
    </div>
    <div class="debug-log-body" v-if="expanded">
      <div class="debug-log-list">
        <div v-for="(log, i) in logs" :key="i" class="debug-log-item" :class="getLogType(log.title).class">
          <div class="debug-item-head" @click="toggleItem(i)">
            <div class="debug-indicator" :style="{ background: getLogType(log.title).color }"></div>
            <span class="debug-icon-small">{{ getLogType(log.title).icon }}</span>
            <span class="debug-time">{{ formatTime(log.timestamp) }}</span>
            <span class="debug-name">{{ log.title }}</span>
            <span class="debug-arrow" :class="{ open: openItems[i] }">▼</span>
          </div>
          <div class="debug-item-content" v-if="openItems[i]">
            <pre>{{ formatContent(log.content) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'

const props = defineProps({
  logs: { type: Array, default: () => [] }
})

const expanded = ref(false)
const openItems = ref({})
const pos = ref({ x: 20, y: 100 })
let dragging = false
let startX = 0
let startY = 0
let initialX = 0
let initialY = 0

function getLogType(title) {
  const t = String(title || '')
  if (t.includes('模型')) return { icon: '🧠', color: '#8b5cf6', class: 'type-llm' } // Violet
  if (t.includes('任务') || t.includes('规划')) return { icon: '📋', color: '#f59e0b', class: 'type-task' } // Amber
  if (t.includes('工具')) return { icon: '🛠️', color: '#10b981', class: 'type-tool' } // Emerald
  if (t.includes('记忆')) return { icon: '💡', color: '#06b6d4', class: 'type-memory' } // Cyan
  if (t.includes('决策') || t.includes('最终')) return { icon: '⚖️', color: '#ec4899', class: 'type-decision' } // Pink
  return { icon: 'ℹ️', color: '#64748b', class: 'type-info' } // Slate
}

function formatContent(content) {
  return JSON.stringify(content, null, 2)
}

function startDrag(e) {
  if (e.target.tagName === 'BUTTON') return
  dragging = true
  startX = e.clientX
  startY = e.clientY
  initialX = pos.value.x
  initialY = pos.value.y
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', stopDrag)
}

function onDrag(e) {
  if (!dragging) return
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  pos.value.x = initialX + dx
  pos.value.y = initialY + dy
}

function stopDrag() {
  dragging = false
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
}

onUnmounted(() => {
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
})

function toggleItem(i) {
  openItems.value[i] = !openItems.value[i]
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}
</script>

<style scoped>
.debug-log-panel {
  position: fixed;
  z-index: 9999;
  width: 420px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #ffffff;
  overflow: hidden;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
.debug-log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f8fafc;
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid #e2e8f0;
}
.debug-log-header:active {
  cursor: grabbing;
}
.debug-log-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}
.debug-icon {
  font-size: 16px;
}
.debug-toggle {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #64748b;
  font-size: 11px;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
  transition: all 0.2s;
}
.debug-toggle:hover {
  background: #f1f5f9;
  color: #0f172a;
}
.debug-log-body {
  max-height: 500px;
  overflow-y: auto;
  background: #ffffff;
}
.debug-log-item {
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.15s;
}
.debug-log-item:last-child {
  border-bottom: none;
}
.debug-log-item:hover {
  background: #f8fafc;
}
.debug-item-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  font-size: 12px;
  position: relative;
}
.debug-indicator {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
}
.debug-icon-small {
  font-size: 14px;
  min-width: 18px;
  text-align: center;
}
.debug-time {
  color: #94a3b8;
  font-size: 11px;
  min-width: 85px;
}
.debug-name {
  font-weight: 600;
  color: #334155;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Log Type Colors */
.type-llm .debug-name { color: #7c3aed; }
.type-task .debug-name { color: #d97706; }
.type-tool .debug-name { color: #059669; }
.type-memory .debug-name { color: #0891b2; }
.type-decision .debug-name { color: #db2777; }

.debug-arrow {
  font-size: 10px;
  color: #cbd5e1;
  transition: transform 0.2s;
}
.debug-arrow.open {
  transform: rotate(180deg);
  color: #64748b;
}
.debug-item-content {
  padding: 12px 16px;
  background: #f8fafc;
  border-top: 1px solid #f1f5f9;
  overflow-x: auto;
  text-align: left;
}
.debug-item-content pre {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: #475569;
  word-break: break-all;
  white-space: pre;
}
</style>