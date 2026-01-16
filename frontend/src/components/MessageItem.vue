<template>
  <div class="message" :class="message.role">
    <div class="role">
      <template v-if="message.role === 'assistant'">
        <svg class="role-icon" viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12 2a7 7 0 0 0-7 7v3a5 5 0 0 0 5 5h1v2a1 1 0 0 0 1.6.8l3.4-2.6H17a5 5 0 0 0 5-5V9a7 7 0 0 0-7-7zm-3 9a1.5 1.5 0 1 1 3 0a1.5 1.5 0 1 1-3 0zm5 0a1.5 1.5 0 1 1 3 0a1.5 1.5 0 1 1-3 0z"/>
        </svg>
      </template>
      <template v-else>你</template>
    </div>
    <div class="content">
      <template v-for="(part, pi) in message.content" :key="pi">
        <div v-if="part?.type === 'text' && message.role === 'assistant'" class="md" v-html="renderMarkdown(String(part?.text || ''))"></div>
        <pre v-else-if="part?.type === 'text'">{{ String(part?.text || '') }}</pre>
        <TaskTimeline v-else-if="part?.type === 'tasks' && message.role === 'assistant'" :tasks="message.tasks" :messageIndex="index" :isOpen="isOpen" :toggle="toggle" :renderMarkdown="renderMarkdown" />
        <ToolTimeline v-else-if="part?.type === 'tool_calls'" :message="message" :part="part" :isOpen="isOpen" :toggle="toggle" :renderMarkdown="renderMarkdown" />
        <MemoryUsedList v-else-if="part?.type === 'memory_used'" :memories="part.memories || []" />
      </template>
      <div v-if="message.role === 'assistant' && message.pending" class="message-loading">
        <i class="dot dot-amber"></i>
        执行中…
      </div>
      <div v-if="message.citations?.length" class="citations">
        引用：
        <span v-for="(c, i) in message.citations" :key="i" class="citation-item" :title="c.snippet || ''">
          {{ c.title }} · {{ c.source }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import MemoryUsedList from './MemoryUsedList.vue'
import TaskTimeline from './TaskTimeline.vue'
import ToolTimeline from './ToolTimeline.vue'

defineProps({
  message: { type: Object, required: true },
  index: { type: Number, required: true },
  renderMarkdown: { type: Function, required: true },
  isOpen: { type: Function, required: true },
  toggle: { type: Function, required: true },
})
</script>

