<template>
  <div class="tool-events" v-if="batches.length">
    <div v-for="(batch, bi) in batches" :key="bi" class="tool-group compact">
      <div class="tool-list">
        <div v-for="call in batch.calls" :key="call.id" class="tool-row">
          <div class="tool-row-head">
            <span class="tool-row-name">{{ callTitle(call) }}</span>
            <span v-if="toolInfoLabel(call)" class="tool-row-ref">{{ toolInfoLabel(call) }}</span>
            <span class="tool-row-state-dot">
              <i :class="stateDotClass(call.status)"></i>
            </span>
            <button class="tool-row-toggle" type="button" @click="toggle(call.id)">{{ isOpen(call.id) ? '收起' : '展开' }}</button>
          </div>
          <div class="tool-row-meta" v-if="false">
            <span v-if="call.startedAt">开始 {{ formatTime(call.startedAt) }}</span>
            <span v-if="call.completedAt">结束 {{ formatTime(call.completedAt) }}</span>
            <span v-if="call.durationMs">耗时 {{ formatDuration(call.durationMs) }}</span>
          </div>
          <div class="tool-row-body" v-show="isOpen(call.id)">
            <div class="tool-pane">
              <div class="tool-pane-title">输入</div>
              <pre class="tool-pane-pre">{{ formatJSON(call.inputPreview || call.input || {}) }}</pre>
            </div>
            <div class="tool-pane">
              <div class="tool-pane-title">输出</div>
              <pre class="tool-pane-pre">{{ call.error ? String(call.error) : formatJSON(call.result) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { buildToolView, buildBatchForItem, callTitle, toolInfoLabel, stateDotClass, formatDuration, formatTime, formatJSON } from '../composables/useToolView.js'

const props = defineProps({
  events: { type: Array, default: null },
  message: { type: Object, default: null },
  part: { type: Object, default: null },
  isOpen: { type: Function, required: true },
  toggle: { type: Function, required: true },
  renderMarkdown: { type: Function, required: true },
})

const batches = computed(() => {
  if (props.message && props.part) return buildBatchForItem(props.message, props.part)
  const evs = Array.isArray(props.events) ? props.events : []
  if (evs.length > 0 && evs[0] && typeof evs[0] === 'object' && 'id' in evs[0] && !('messageType' in evs[0])) {
    const calls = [...evs].sort((a, b) => Number(a?.createdAt || a?.startedAt || a?.timestamp || 0) - Number(b?.createdAt || b?.startedAt || b?.timestamp || 0))
    return [{ calls }]
  }
  return buildToolView(evs)
})
</script>
