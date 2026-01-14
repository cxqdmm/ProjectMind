<template>
  <div class="task-card">
    <div class="task-card-head">
      <span class="task-pill">子任务</span>
      <span class="task-count">{{ Array.isArray(tasks) ? tasks.length : 0 }}</span>
    </div>
    <div v-if="!Array.isArray(tasks) || !tasks.length" class="task-result-empty">暂无子任务</div>
    <div v-else class="task-card-list">
      <div v-for="t in tasks" :key="taskKey(t)" class="task-card-item">
        <div class="task-card-row">
          <span class="task-index">{{ (Number(t.index) || 0) + 1 }}</span>
          <span class="task-title" :title="t.title">{{ t.title }}</span>
          <span class="task-status" :class="taskStatusClass(t.status)">{{ taskStatusText(t.status) }}</span>
          <button class="task-toggle" type="button" @click="toggleTask(t)">{{ isTaskOpen(t) ? '收起' : '展开' }}</button>
        </div>
        <div class="task-body" v-show="isTaskOpen(t)">
          <div v-if="Array.isArray(t.toolEvents) && t.toolEvents.length" class="task-sub">
            <div class="task-subhead">工具</div>
            <ToolTimeline class="task-tools" :events="t.toolEvents" :isOpen="(id) => isToolOpen(t, id)" :toggle="(id) => toggleTool(t, id)" />
          </div>
          <div v-if="Array.isArray(t.memories) && t.memories.length" class="task-sub">
            <div class="task-subhead">记忆</div>
            <MemoryUsedList :memories="t.memories" />
          </div>
          <pre v-if="t.result" class="task-result">{{ t.result }}</pre>
          <pre v-else-if="t.status === 'failed'" class="task-result">{{ t.error || '执行失败' }}</pre>
          <div v-else class="task-result-empty">暂无结果</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import MemoryUsedList from './MemoryUsedList.vue'
import ToolTimeline from './ToolTimeline.vue'

const props = defineProps({
  tasks: { type: Array, default: () => [] },
  messageIndex: { type: Number, required: true },
  isOpen: { type: Function, required: true },
  toggle: { type: Function, required: true },
})

function taskKey(t) {
  const id = String(t?.id || '').trim()
  if (id) return id
  const idx = Number(t?.index)
  if (Number.isFinite(idx)) return `idx_${idx}`
  const title = String(t?.title || '').trim()
  return title ? `title_${title}` : 'idx_0'
}

function taskToggleId(t) {
  return `task::${String(props.messageIndex)}::${taskKey(t)}`
}

function toolToggleId(t, callId) {
  return `tool::${String(props.messageIndex)}::${taskKey(t)}::${String(callId || '')}`
}

function isTaskOpen(t) {
  return props.isOpen(taskToggleId(t))
}

function toggleTask(t) {
  props.toggle(taskToggleId(t))
}

function isToolOpen(t, callId) {
  return props.isOpen(toolToggleId(t, callId))
}

function toggleTool(t, callId) {
  props.toggle(toolToggleId(t, callId))
}

function taskStatusText(s) {
  const v = String(s || '')
  if (v === 'in_progress') return '进行中'
  if (v === 'completed') return '已完成'
  if (v === 'failed') return '失败'
  return '待执行'
}

function taskStatusClass(s) {
  const v = String(s || '')
  if (v === 'in_progress') return 'status-progress'
  if (v === 'completed') return 'status-done'
  if (v === 'failed') return 'status-failed'
  return 'status-pending'
}
</script>

