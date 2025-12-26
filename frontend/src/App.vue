<template>
  <div class="app">
    <header class="header">
      <h1>智能助手</h1>
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
            <div v-if="m.role === 'assistant'" class="md" v-html="renderMarkdown(m.content)"></div>
            <pre v-else>{{ m.content }}</pre>
            <div v-if="m.citations?.length" class="citations">
              引用：
              <span v-for="(c, i) in m.citations" :key="i" class="citation-item" :title="c.snippet || ''">
                {{ c.title }} · {{ c.source }}
              </span>
            </div>

            <div v-if="m.events?.length" class="tool-events">
              <div v-for="(batch, bi) in buildToolView(m.events)" :key="bi" class="tool-group">
                <div class="tool-group-title">函数批次 · {{ batch.calls.length }} 个调用</div>
                <div class="tool-list">
                  <div v-for="call in batch.calls" :key="call.id" class="tool-row">
                    <div class="tool-row-head">
                      <span class="tool-row-name">{{ callTitle(call) }}</span>
                      <span class="tool-row-state">
                        <i :class="stateDotClass(call.status)"></i>
                        {{ statusText(call.status) }}
                      </span>
                      <button class="tool-row-toggle" @click="toggleTool(call.id)">{{ isOpen(call.id) ? '收起' : '展开' }}</button>
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
import { marked } from 'marked'
import DOMPurify from 'dompurify'
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

marked.setOptions({ gfm: true, breaks: true })

function formatJSON(v) {
  try { return JSON.stringify(v ?? {}, null, 2) } catch (_) { return String(v) }
}

function renderMarkdown(t) {
  try {
    return DOMPurify.sanitize(marked.parse(String(t || '')))
  } catch (_) {
    return DOMPurify.sanitize(String(t || ''))
  }
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

function callTitle(x) {
  const provider = String(x?.provider || '').trim()
  const tool = String(x?.toolName || x?.tool || '').trim()
  if (provider === 'skill') {
    // Prefer final result details
    const r = x?.result || {}
    const key = String(r?.key || x?.input?.skill || '')
    if (tool.startsWith('execute')) {
      const fn = String(r?.function || x?.input?.function || '')
      return fn ? `skill.execute · ${key ? 'skill=' + key + ' · ' : ''}function=${fn}` : `skill.execute${key ? ' · skill=' + key : ''}`
    }
    if (tool.startsWith('loadReference')) {
      const files = Array.isArray(r?.extras) ? r.extras.map(e => e.file).filter(Boolean) : (Array.isArray(x?.input?.files) ? x.input.files : (x?.input?.file ? [x.input.file] : []))
      const filesText = files && files.length ? `files=${files.join(',')}` : ''
      return `skill.loadReference${filesText ? ' · ' + filesText : ''}${key ? ' · skill=' + key : ''}`
    }
    if (tool.startsWith('load')) {
      return `skill.load${key ? ' · skill=' + key : ''}`
    }
  }
  // Fallback
  return tool ? `${provider}.${tool}` : (x?.name || '未知工具')
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
  addMessage('assistant', '你好！我是智能助手，可以帮助你解决问题。\n\n请输入你的需求开始吧。')
})

function onApiKeyChange() {
  localStorage.setItem('pm_qwen_api_key', apiKey.value)
}
</script>

<style scoped>
.app { color: #1f2937; background: #fff7ed; min-height: 100vh;}
.header { background: linear-gradient(135deg,#fb923c 0%, #f97316 70%); color: #fff; padding: 28px 20px; }
.header h1 { margin: 0; font-size: 24px; letter-spacing: 0.2px; }
.subtitle { color: #ffedd5; margin-top: 6px; }
.settings { margin-top: 12px; display: flex; align-items: center; gap: 10px; }
.settings input { padding: 8px 10px; border: 1px solid #fdba74; border-radius: 10px; background: #fff7ed; color: #7c2d12; }
.main { margin: 0 auto; padding: 20px; }
.messages { background: #ffffff; border: 1px solid #fed7aa; border-radius: 14px; padding: 16px; min-height: 360px; max-height: 70vh; overflow-y: auto; box-shadow: 0 6px 20px rgba(249,115,22,0.12); }
.message { display: flex; gap: 14px; margin-bottom: 14px; }
.role { font-weight: 700; min-width: 64px; }
.user .role { color: #1d4ed8; }
.assistant .role { color: #f97316; }
.content pre { white-space: pre-wrap; line-height: 1.6; margin: 0; font-size: 14px; }
.content { text-align: left; }
.citations { font-size: 12px; color: #a16207; margin-top: 8px; }
.citation-item { display: inline-block; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 999px; padding: 4px 10px; margin-right: 8px; }
.input-row { display: flex; gap: 10px; margin-top: 14px; }
.input-row input { flex: 1; padding: 12px; border: 1px solid #fdba74; border-radius: 12px; background: #fff; }
.input-row button { padding: 0 18px; border: none; border-radius: 12px; background: #f97316; color: #fff; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(249,115,22,0.25); }
.input-row button:hover { background: #ea580c; }
.tip { font-size: 12px; color: #a16207; margin-top: 10px; }

.tool-events { margin-top: 12px; }
.tool-group { border: 1px solid #fed7aa; border-radius: 14px; padding: 14px; background: #fffaf3; }
.tool-group-title { font-size: 13px; color: #c2410c; font-weight: 700; margin-bottom: 12px; }
.tool-list { display: grid; grid-template-columns: 1fr; gap: 12px; }
.tool-row { border: 1px solid #fed7aa; border-radius: 14px; background: #ffffff; padding: 12px; box-shadow: 0 4px 14px rgba(249,115,22,0.08); }
.tool-row-head { display: flex; align-items: center; gap: 10px; }
.tool-row-name { font-weight: 400; color: #0f172a; font-size: 13px; }
.tool-row-state { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: #c2410c; margin-left: auto; text-align: right; }
.tool-row-toggle { border: 1px solid #fdba74; background: #fff; color: #c2410c; font-size: 11px; border-radius: 12px; padding: 3px 10px; }
.tool-row-toggle:hover { background: #fff7ed; }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.dot-blue { background: #60a5fa; }
.dot-green { background: #f97316; }
.dot-red { background: #ef4444; }
.dot-amber { background: #f59e0b; }
.tool-row-meta { display: flex; gap: 18px; font-size: 12px; color: #a16207; margin: 8px 0; }
.tool-row-body { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.tool-pane-title { font-size: 12px; color: #c2410c; margin-bottom: 6px; }
.tool-pane-pre { font-size: 12px; line-height: 1.6; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 10px; }

/* Markdown 内容主题 */
.md { color: #1f2937; }
.md { text-align: left; }
.md * { text-align: left; }
.md h1, .md h2, .md h3 { color: #c2410c; margin: 12px 0 8px; font-weight: 800; }
.md h1 { font-size: 22px; }
.md h2 { font-size: 18px; }
.md h3 { font-size: 16px; }
.md p { margin: 8px 0; }
.md ul, .md ol { margin: 8px 0 8px 20px; padding-left: 20px; }
.md ul { list-style: disc; }
.md ol { list-style: decimal; }
.md li { margin: 4px 0; }
.md code { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; padding: 2px 6px; }
.md pre code { display: block; padding: 10px; border-radius: 10px; }
.md a { color: #f97316; text-decoration: none; }
.md a:hover { text-decoration: underline; }
.md blockquote { margin: 10px 0; padding: 10px 12px; border-left: 4px solid #f59e0b; background: #fffaf3; color: #7c2d12; border-radius: 8px; }
.md hr { border: none; border-top: 1px dashed #fdba74; margin: 12px 0; }
.md table { border-collapse: collapse; margin: 10px 0; width: 100%; }
.md th, .md td { border: 1px solid #fed7aa; padding: 8px; }
.md th { background: #fff7ed; color: #c2410c; font-weight: 700; }
.md img { max-width: 100%; border-radius: 10px; border: 1px solid #fed7aa; }
.md center { text-align: left; display: block; }
</style>
