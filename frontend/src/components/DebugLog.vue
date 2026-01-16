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
        <div v-for="(log, i) in logs" :key="i" class="debug-log-item">
          <div class="debug-item-head" @click="toggleItem(i)">
            <span class="debug-time">{{ formatTime(log.timestamp) }}</span>
            <span class="debug-name">{{ log.title }}</span>
            <span class="debug-arrow" :class="{ open: openItems[i] }">▼</span>
          </div>
          <div class="debug-item-content" v-if="openItems[i]">
            <pre>{{ JSON.stringify(log.content, null, 2) }}</pre>
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
  width: 400px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #ffffff;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}
.debug-log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #f8fafc;
  cursor: grab;
  user-select: none;
}
.debug-log-header:active {
  cursor: grabbing;
}
.debug-log-header:hover {
  background: #f1f5f9;
}
.debug-log-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
}
.debug-icon {
  font-size: 14px;
}
.debug-toggle {
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
}
.debug-log-body {
  border-top: 1px solid #e5e7eb;
  max-height: 400px;
  overflow-y: auto;
  padding: 0;
}
.debug-log-item {
  border-bottom: 1px solid #f1f5f9;
}
.debug-log-item:last-child {
  border-bottom: none;
}
.debug-item-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 12px;
}
.debug-item-head:hover {
  background: #f8fafc;
}
.debug-time {
  color: #94a3b8;
  font-family: monospace;
}
.debug-name {
  font-weight: 500;
  color: #334155;
  flex: 1;
}
.debug-arrow {
  font-size: 10px;
  color: #94a3b8;
  transition: transform 0.2s;
}
.debug-arrow.open {
  transform: rotate(180deg);
}
.debug-item-content {
  padding: 10px 14px;
  background: #f8fafc;
  border-top: 1px solid #f1f5f9;
  overflow-x: auto;
}
.debug-item-content pre {
  margin: 0;
  font-size: 11px;
  font-family: monospace;
  color: #475569;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>