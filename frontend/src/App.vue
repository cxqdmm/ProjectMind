<template>
  <div class="app">
    <ChatHeader
      :currentModelLabel="currentModelLabel"
      :skills="skills"
      :skillsLoading="skillsLoading"
      :skillsError="skillsError"
      :models="models"
      :modelsLoading="modelsLoading"
      :modelsError="modelsError"
      @refreshSkills="onSkillsRefresh"
      @refreshModels="onModelsRefresh"
      @chooseModel="onChooseModel"
      @insertSkill="onInsertSkill"
      @openMemories="showMemoryManager = true"
    />

    <main class="main">
      <TokenPanel :visible="tokenVisible" :tokenLast="tokenLast" :tokenTotal="tokenTotal" />
      <MessageList ref="messageListRef" :messages="messages" :renderMarkdown="renderMarkdown" :isOpen="isOpen" :toggle="toggleTool" />
      <ChatInput v-model="input" :sending="sending" @send="onSend" />
    </main>
    <MemoryManager :open="showMemoryManager" @close="showMemoryManager = false" />
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import ChatHeader from './components/ChatHeader.vue'
import TokenPanel from './components/TokenPanel.vue'
import ChatInput from './components/ChatInput.vue'
import MessageList from './components/MessageList.vue'
import MemoryManager from './components/MemoryManager.vue'
import { useOpenState } from './composables/useOpenState.js'
import { useSkills } from './composables/useSkills.js'
import { useModels } from './composables/useModels.js'
import { useAgentStream } from './composables/useAgentStream.js'
 
 
const input = ref('')
const messageListRef = ref(null)
const sessionId = ref(localStorage.getItem('pm_session_id') || '')
const showMemoryManager = ref(false)
const { isOpen, toggle: toggleOpen } = useOpenState()
const { skills, loading: skillsLoading, error: skillsError, refresh: onSkillsRefresh } = useSkills()
const { models, loading: modelsLoading, error: modelsError, selectedModel, currentLabel: currentModelLabel, refresh: onModelsRefresh, choose: onChooseModel } = useModels()
const { messages, sending, tokenVisible, tokenLast, tokenTotal, send, addMessage } = useAgentStream()

function scrollToBottom() {
  nextTick(() => {
    messageListRef.value?.scrollToBottom?.()
  })
}

marked.setOptions({ gfm: true, breaks: true })

function renderMarkdown(t) {
  try {
    return DOMPurify.sanitize(marked.parse(String(t || '')))
  } catch (_) {
    return DOMPurify.sanitize(String(t || ''))
  }
}
function onInsertSkill(name) {
  const t = String(name || '').trim()
  if (!t) return
  input.value = input.value ? input.value + ' ' + t : t
}

function toggleTool(id) {
  toggleOpen(id)
}

async function onSend(text) {
  const value = String(text || '').trim()
  if (!value) return
  input.value = ''
  await send(value, { sessionId: sessionId.value, selection: selectedModel.value, onUpdate: scrollToBottom })
}

onMounted(() => {
  if (!sessionId.value) {
    sessionId.value = `pm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem('pm_session_id', sessionId.value)
  }
  addMessage('assistant', '你好！我是智能助手，可以帮助你解决问题。\n\n请输入你的需求开始吧。', [], scrollToBottom)
  onModelsRefresh()
})

// api key handling removed
</script>

<style>
.app { color: #0f172a; background: #ffffff; min-height: 100vh; }
.header { position: sticky; top: 0; background: #ffffff; border-bottom: 1px solid #e5e7eb; z-index: 10; }
.header-inner { max-width: 960px; margin: 0 auto; padding: 12px 20px; display: flex; align-items: center; gap: 12px; }
.header h1 { margin: 0; font-size: 16px; font-weight: 700; }
.toolbar { margin-left: auto; display: flex; align-items: center; gap: 8px; position: relative; }
.tool-btn { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid #e5e7eb; background: #fff; color: #0f172a; font-size: 12px; border-radius: 12px; }
.tool-btn:hover { background: #f8fafc; }
.token-panel { position: fixed; right: 20px; top: 76px; z-index: 9; width: 280px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff; font-size: 12px; color: #475569; box-shadow: 0 12px 28px rgba(17,24,39,0.08); }
.token-line { line-height: 1.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.token-hint { color: #94a3b8; margin-left: 4px; }
.task-card { margin: 10px 0 14px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 12px; background: #f8fafc; }
.task-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.task-pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #e0f2fe; color: #0369a1; font-weight: 600; }
.task-count { margin-left: auto; font-size: 11px; color: #64748b; background: #f1f5f9; border: 1px solid #e5e7eb; padding: 1px 6px; border-radius: 999px; }
.task-card-list { display: grid; grid-template-columns: 1fr; gap: 8px; }
.task-card-item { border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff; }
.task-card-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
.task-index { font-size: 11px; color: #64748b; width: 18px; text-align: right; }
.task-title { flex: 1; font-weight: 500; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.task-status { font-size: 11px; padding: 1px 6px; border-radius: 999px; border: 1px solid #e5e7eb; color: #475569; background: #ffffff; }
.task-status.status-pending { background: #f8fafc; color: #64748b; border-color: #e2e8f0; }
.task-status.status-progress { background: #fffbeb; color: #b45309; border-color: #fde68a; }
.task-status.status-done { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
.task-status.status-failed { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
.task-toggle { border: 1px solid #e5e7eb; background: #fff; color: #475569; font-size: 11px; border-radius: 12px; padding: 3px 10px; }
.task-toggle:hover { background: #f8fafc; }
.task-body { border-top: 1px solid #e5e7eb; padding: 8px 10px; background: #f8fafc; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; }
.task-result { margin: 0; white-space: pre-wrap; line-height: 1.6; font-size: 12px; color: #0f172a; }
.task-result-empty { color: #64748b; }
.task-sub { margin-top: 10px; }
.task-subhead { font-size: 12px; font-weight: 600; color: #475569; margin: 6px 0; }
.task-tools { max-width: none; margin: 8px 0 0; }
@media (max-width: 1100px) {
  .token-panel { position: sticky; top: 64px; right: auto; width: min(820px, calc(100% - 40px)); margin: 8px auto 0; box-shadow: none; background: #f8fafc; }
  .token-line { white-space: normal; }
}
.skills-dropdown { position: absolute; right: 0; top: 40px; width: 320px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 12px 28px rgba(17,24,39,0.08); }
.skills-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #475569; }
.refresh-btn { border: 1px solid #e5e7eb; background: #fff; color: #475569; font-size: 11px; border-radius: 12px; padding: 3px 10px; }
.refresh-btn:hover { background: #f8fafc; }
.skills-body { max-height: 300px; overflow: auto; }
.skills-empty { padding: 14px; font-size: 12px; color: #64748b; }
.skills-list { display: grid; grid-template-columns: 1fr; }
.skill-item { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
.skill-item:last-child { border-bottom: none; }
.skill-text { flex: 1; overflow: hidden; }
.skill-name { font-size: 13px; font-weight: 600; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.skill-desc { font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.skill-insert { border: 1px solid #e5e7eb; background: #fff; color: #475569; font-size: 11px; border-radius: 12px; padding: 3px 10px; }
.skill-insert:hover { background: #f8fafc; }
.main { margin: 0 auto; padding: 0 20px 120px; }
.messages { max-width: 820px; margin: 24px auto; background: transparent; border: none; border-radius: 0; padding: 0; min-height: 60vh; max-height: none; overflow: visible; box-shadow: none; }
.message { display: flex; align-items: flex-start; gap: 14px; margin: 28px auto; max-width: 720px; }
.role { font-weight: 600; min-width: 28px; color: #64748b; display: flex; align-items: flex-start; }
.role-icon { fill: #0ea5e9; width: 20px; height: 20px; }
.assistant .role { color: #0ea5e9; }
.content { text-align: left; flex: 1; }
.content pre { white-space: pre-wrap; line-height: 1.8; margin: 0; font-size: 14px; }
.user .content pre { background: #f1f5f9; border: 1px solid #e5e7eb; border-radius: 18px; padding: 10px 14px; display: inline-block; max-width: 60%; margin-left: auto; }
.md { color: #0f172a; text-align: left; }
.md :deep(h1), .md :deep(h2), .md :deep(h3) { color: #0f172a; margin: 12px 0 8px; font-weight: 700; }
.md :deep(h1) { font-size: 20px; }
.md :deep(h2) { font-size: 18px; }
.md :deep(h3) { font-size: 16px; }
.md :deep(p) { margin: 0; }
.md :deep(ul), .md :deep(ol) { margin: 8px 0 8px 20px; padding-left: 20px; }
.md :deep(ul) { list-style: disc; }
.md :deep(ol) { list-style: decimal; }
.md :deep(li) { margin: 6px 0; }
.md :deep(code) { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 2px 6px; }
.md :deep(pre code) { display: block; padding: 10px; border-radius: 10px; }
.md :deep(a) { color: #0ea5e9; text-decoration: none; }
.md :deep(a:hover) { text-decoration: underline; }
.md :deep(blockquote) { margin: 10px 0; padding: 10px 12px; border-left: 4px solid #e5e7eb; background: #f8fafc; color: #334155; border-radius: 8px; }

.tool-events { max-width: 720px; margin: 12px auto; }
.tool-group { border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; background: #ffffff; }
.tool-group.compact { padding: 10px; }
.tool-list { display: grid; grid-template-columns: 1fr; gap: 12px; }
.tool-row { border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff; padding: 10px 12px; box-shadow: 0 2px 10px rgba(17,24,39,0.06); }
.tool-row-head { display: flex; align-items: center; gap: 8px; }
.tool-row-name { font-weight: 500; color: #0f172a; font-size: 13px; }
.tool-row-ref { font-size: 12px; color: #64748b; }
.tool-row-state-dot { display: inline-flex; align-items: center; margin-left: auto; }
.tool-row-toggle { border: 1px solid #e5e7eb; background: #fff; color: #475569; font-size: 11px; border-radius: 12px; padding: 3px 10px; }
.tool-row-toggle:hover { background: #f8fafc; }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.dot-blue { background: #60a5fa; }
.dot-green { background: #22c55e; }
.dot-red { background: #ef4444; }
.dot-amber { background: #f59e0b; }
.tool-row-meta { display: flex; gap: 18px; font-size: 12px; color: #64748b; margin: 8px 0; }
.tool-row-body { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.tool-pane-title { font-size: 12px; color: #64748b; margin-bottom: 6px; }
.tool-pane-pre { font-size: 12px; line-height: 1.6; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px; }

.input-row { position: fixed; left: 50%; transform: translateX(-50%); bottom: 24px; width: min(820px, calc(100% - 48px)); display: flex; gap: 10px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 999px; padding: 8px; box-shadow: 0 12px 28px rgba(17,24,39,0.08); }
.input-row input { flex: 1; padding: 12px 14px; border: none; outline: none; background: transparent; }
.input-row button { padding: 0 18px; border: none; border-radius: 999px; background: #111827; color: #fff; font-weight: 700; cursor: pointer; }
.input-row button:hover { background: #0f172a; }
.message-loading { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: #64748b; margin-top: 6px; }
</style>
