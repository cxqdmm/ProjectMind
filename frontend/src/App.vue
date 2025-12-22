<template>
  <div class="app">
    <header class="header">
      <h1>ProjectMind · Vue3 聊天演示</h1>
      <p class="subtitle">产品咨询与客诉问题最小可用骨架</p>
      <div class="settings">
        <label>
          Qwen API Key:
          <input v-model.trim="apiKey" @change="onApiKeyChange" type="password" placeholder="在此粘贴密钥" />
        </label>
      </div>
    </header>

    <main class="main">
      <div class="messages" ref="messagesRef">
        <div v-for="(m, idx) in messages" :key="idx" class="message" :class="m.role">
          <div class="role">{{ m.role === 'user' ? '你' : '助手' }}</div>
          <div class="content">
            <pre>{{ m.content }}</pre>
            <div v-if="m.citations?.length" class="citations">
              引用：
              <span v-for="(c, i) in m.citations" :key="i" class="citation-item" :title="c.snippet || ''">
                {{ c.title }} · {{ c.source }}
              </span>
            </div>

            <!-- 工具事件可视化 -->
            <div v-if="m.events?.length" class="tool-events">
              <div v-for="(ev, ei) in m.events" :key="ei">
                <div v-if="ev.messageType === 'tool_calls'" class="tool-group">
                  <div class="tool-group-title">工具批次 · {{ ev.calls.length }} 个调用</div>
                  <div v-for="call in ev.calls" :key="call.id" class="tool-card">
                    <div class="tool-head">
                      <div class="tool-name">{{ call.name || call.tool }}</div>
                      <div class="tool-status pending">排队</div>
                    </div>
                    <pre class="tool-input">{{ formatJSON(call.inputPreview || call.input || {}) }}</pre>
                    <pre class="tool-output"></pre>
                  </div>
                </div>
                <div v-else-if="ev.messageType === 'tool_update'" class="tool-card">
                  <div class="tool-head">
                    <div class="tool-name">{{ ev.name || ev.tool || '未知工具' }}</div>
                    <div class="tool-status" :class="ev.status || 'completed'">
                      {{ ev.status === 'running' ? '执行中' : ev.status === 'failed' ? '失败' : '完成' }}
                    </div>
                  </div>
                  <pre class="tool-output">{{ ev.error ? String(ev.error) : formatJSON(ev.result) }}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <form class="input-row" @submit.prevent="onSend">
        <input v-model.trim="input" type="text" placeholder="例如：ProjectMind Pro 的价格？或 如何申请退款？" />
        <button type="submit" :disabled="sending">{{ sending ? '发送中...' : '发送' }}</button>
      </form>
      <p class="tip">前端直接调用模型与工具，后台可选。</p>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { runAgentBrowser } from './lib/agent'

const messages = ref([])
const input = ref('')
const sending = ref(false)
const messagesRef = ref(null)
const sessionId = ref(localStorage.getItem('pm_session_id') || '')
const apiKey = ref(localStorage.getItem('pm_qwen_api_key') || '')

function scrollToBottom() {
  nextTick(() => {
    const el = messagesRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function formatJSON(v) {
  try { return JSON.stringify(v ?? {}, null, 2) } catch (_) { return String(v) }
}

function addMessage(role, content, citations = [], events = []) {
  messages.value.push({ role, content, citations, events })
  scrollToBottom()
}

async function onSend() {
  const text = input.value
  if (!text) return
  
  addMessage('user', text)
  input.value = ''
  sending.value = true
  try {
    const placeholder = { role: 'assistant', content: '处理中…', citations: [], events: [] }
    messages.value.push(placeholder)
    const idx = messages.value.length - 1
    const onEvent = (ev) => {
      if (ev.messageType === 'tool_calls' || ev.messageType === 'tool_update') {
        messages.value[idx].events.push(ev)
      } else if (ev.messageType === 'assistant_final') {
        messages.value[idx].content = ev.reply || (ev.error ? `错误：${ev.error}` : '')
        messages.value[idx].citations = ev.citations || []
        sending.value = false
      }
      scrollToBottom()
    }
    const res = await runAgentBrowser(text, { sessionId: sessionId.value, apiKey: apiKey.value }, onEvent)
    messages.value[idx].content = res.reply
    messages.value[idx].citations = res.citations || []
    messages.value[idx].events = Array.isArray(res.events) ? res.events : messages.value[idx].events
    sending.value = false
  } catch (e) {
    addMessage('assistant', '调用失败，请检查网络或密钥。')
    sending.value = false
  }
}

onMounted(() => {
  if (!sessionId.value) {
    sessionId.value = `pm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem('pm_session_id', sessionId.value)
  }
  addMessage('assistant', '你好！我可以帮助你了解产品信息或解答常见客诉问题。试着问我：\n- “ProjectMind Pro 的价格和主要功能？”\n- “如何申请退款？”')
})

function onApiKeyChange() {
  localStorage.setItem('pm_qwen_api_key', apiKey.value)
}
</script>

<style scoped>
.app { color: #222; background: #f7f7f7; min-height: 100vh; }
.header { background: #111827; color: #fff; padding: 24px 16px; }
.header h1 { margin: 0; font-size: 20px; }
.subtitle { color: #cbd5e1; margin-top: 4px; }
.settings { margin-top: 8px; display: flex; align-items: center; gap: 8px; }
.settings input { padding: 6px 8px; border: 1px solid #334155; border-radius: 6px; background: #0b1220; color: #e5e7eb; }
.main { max-width: 840px; margin: 0 auto; padding: 16px; }
.messages { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; min-height: 300px; max-height: 60vh; overflow-y: auto; }
.message { display: flex; gap: 12px; margin-bottom: 12px; }
.role { font-weight: 600; min-width: 64px; }
.user .role { color: #2563eb; }
.assistant .role { color: #16a34a; }
.content pre { white-space: pre-wrap; line-height: 1.5; margin: 0; }
.citations { font-size: 12px; color: #6b7280; margin-top: 6px; }
.citation-item { display: inline-block; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; margin-right: 8px; }
.input-row { display: flex; gap: 8px; margin-top: 12px; }
.input-row input { flex: 1; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; }
.input-row button { padding: 0 16px; border: none; border-radius: 6px; background: #111827; color: #fff; font-weight: 600; cursor: pointer; }
.input-row button:hover { background: #374151; }
.tip { font-size: 12px; color: #6b7280; margin-top: 8px; }
</style>
