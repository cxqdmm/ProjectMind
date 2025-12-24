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

            <div v-if="m.events?.length" class="tool-events">
              <div v-for="(batch, bi) in buildToolView(m.events)" :key="bi" class="tool-group">
                <div class="tool-group-title">工具批次 · {{ batch.calls.length }} 个调用</div>
                <div class="tool-list">
                  <div v-for="call in batch.calls" :key="call.id" class="tool-row">
                    <div class="tool-row-head">
                      <span class="tool-row-name">{{ toolLabel(call) }}</span>
                      <span class="tool-row-state">
                        <i :class="stateDotClass(call.status)"></i>
                        {{ statusText(call.status) }}
                      </span>
                      <button class="tool-row-toggle" @click="toggleTool(call.id)">{{ isOpen(call.id) ? '收起' : '展开' }}</button>
                    </div>
                    <div class="tool-row-meta">
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
const openIds = ref(new Set())

function scrollToBottom() {
  nextTick(() => {
    const el = messagesRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function formatJSON(v) {
  try { return JSON.stringify(v ?? {}, null, 2) } catch (_) { return String(v) }
}

function isOpen(id) { return openIds.value.has(String(id)) }
function toggleTool(id) {
  const k = String(id)
  const s = new Set(openIds.value)
  if (s.has(k)) s.delete(k)
  else s.add(k)
  openIds.value = s
}

function buildToolView(events) {
  const out = []
  const maps = []
  const sorted = [...(events || [])].sort((a, b) => {
    const ta = Number(a?.timestamp || a?.startedAt || 0)
    const tb = Number(b?.timestamp || b?.startedAt || 0)
    return ta - tb
  })
  for (const ev of sorted) {
    if (ev?.messageType === 'tool_calls') {
      const map = new Map()
      const batch = { calls: [] }
      for (const c of (ev.calls || [])) {
        const item = {
          id: c.id,
          provider: c.provider,
          tool: c.tool,
          toolName: c.toolName,
          name: c.name,
          status: 'pending',
          input: c.input,
          inputPreview: c.inputPreview,
          result: null,
          error: null,
          startedAt: c.startedAt,
          completedAt: null,
          durationMs: null
        }
        map.set(c.id, item)
        batch.calls.push(item)
      }
      maps.push(map)
      out.push(batch)
    } else if (ev?.messageType === 'tool_update') {
      let target = null
      for (let i = maps.length - 1; i >= 0; i--) {
        const m = maps[i]
        if (m && m.has(ev.id)) { target = m.get(ev.id); break }
      }
      if (target) {
        target.status = ev.status || target.status
        target.result = ev.result ?? target.result
        target.error = ev.error ?? null
        target.startedAt = ev.startedAt ?? target.startedAt
        target.completedAt = ev.completedAt ?? target.completedAt
        target.durationMs = ev.durationMs ?? target.durationMs
      }
    }
  }
  for (const b of out) {
    b.calls.sort((a, b) => {
      const sa = Number(a.startedAt || 0), sb = Number(b.startedAt || 0)
      return sa - sb
    })
  }
  return out
}

function toolLabel(x) {
  const p = String(x?.provider || '').trim()
  const t = String(x?.toolName || x?.tool || '').trim()
  const name = String(x?.name || '').trim()
  if (name) return name
  if (p && t) return `${p}.${t}`
  return t || p || '未知工具'
}

function statusClass(s) {
  const k = String(s || '').toLowerCase()
  if (k === 'running') return 'running'
  if (k === 'failed') return 'failed'
  return 'completed'
}

function stateDotClass(s) {
  const k = String(s || '').toLowerCase()
  if (k === 'running') return 'dot dot-blue'
  if (k === 'failed') return 'dot dot-red'
  if (k === 'started' || k === 'pending') return 'dot dot-amber'
  return 'dot dot-green'
}

function statusText(s) {
  const k = String(s || '').toLowerCase()
  if (k === 'running') return '执行中'
  if (k === 'failed') return '失败'
  if (k === 'started' || k === 'pending') return '排队'
  return '完成'
}

function formatDuration(ms) {
  const n = Number(ms) || 0
  if (n < 1000) return `${n}ms`
  const sec = (n / 1000)
  return `${sec.toFixed(sec >= 10 ? 0 : 1)}s`
}

function pad2(n) { return String(n).padStart(2, '0') }
function formatTime(ts) {
  const d = new Date(Number(ts) || Date.now())
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
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

.tool-events { margin-top: 8px; }
.tool-group { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; background: #fdfdfd; }
.tool-group-title { font-size: 13px; color: #111827; font-weight: 600; margin-bottom: 12px; }
.tool-list { display: grid; grid-template-columns: 1fr; gap: 10px; }
.tool-row { border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff; padding: 12px; }
.tool-row-head { display: flex; align-items: center; justify-content: space-between; }
.tool-row-name { font-weight: 600; color: #0f172a; }
.tool-row-state { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: #374151; }
.tool-row-toggle { border: 1px solid #e5e7eb; background: #fff; color: #374151; font-size: 12px; border-radius: 8px; padding: 4px 10px; }
.tool-row-toggle:hover { background: #f9fafb; }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.dot-blue { background: #3b82f6; }
.dot-green { background: #10b981; }
.dot-red { background: #ef4444; }
.dot-amber { background: #f59e0b; }
.tool-row-meta { display: flex; gap: 16px; font-size: 12px; color: #6b7280; margin: 8px 0; }
.tool-row-body { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.tool-pane-title { font-size: 12px; color: #374151; margin-bottom: 6px; }
.tool-pane-pre { font-size: 12px; line-height: 1.6; background: #fbfbfb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; }
</style>
