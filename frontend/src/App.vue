<template>
  <div class="app">
    <header class="header">
      <div class="header-inner">
        <h1>智能助手</h1>
        <!-- settings removed -->
      </div>
    </header>

    <main class="main">
      <div class="messages" ref="messagesRef">
        <div v-for="(m, idx) in messages" :key="idx" class="message" :class="m.role">
          <div class="role">
            <template v-if="m.role === 'assistant'">
              <svg class="role-icon" viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 2a7 7 0 0 0-7 7v3a5 5 0 0 0 5 5h1v2a1 1 0 0 0 1.6.8l3.4-2.6H17a5 5 0 0 0 5-5V9a7 7 0 0 0-7-7zm-3 9a1.5 1.5 0 1 1 3 0a1.5 1.5 0 1 1-3 0zm5 0a1.5 1.5 0 1 1 3 0a1.5 1.5 0 1 1-3 0z"/>
              </svg>
            </template>
            <template v-else>你</template>
          </div>
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
        <input v-model.trim="input" type="text" placeholder="请输入问题或指令" />
        <button type="submit" :disabled="sending">{{ sending ? '发送中...' : '发送' }}</button>
      </form>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
 

const messages = ref([])
const input = ref('')
const sending = ref(false)
const messagesRef = ref(null)
const sessionId = ref(localStorage.getItem('pm_session_id') || '')
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
    const r = await fetch('http://localhost:3334/api/agent/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userInput: text, sessionId: sessionId.value }) })
    const res = await r.json()
    messages.value[idx].content = String(res?.reply || '')
    messages.value[idx].citations = []
    messages.value[idx].events = []
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

// api key handling removed
</script>

<style scoped>
.app { color: #0f172a; background: #ffffff; min-height: 100vh; }
.header { position: sticky; top: 0; background: #ffffff; border-bottom: 1px solid #e5e7eb; z-index: 10; }
.header-inner { max-width: 960px; margin: 0 auto; padding: 12px 20px; display: flex; align-items: center; gap: 12px; }
.header h1 { margin: 0; font-size: 16px; font-weight: 700; }
.settings { margin-left: auto; display: flex; align-items: center; gap: 8px; color: #475569; }
.settings input { padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff; color: #0f172a; }
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
.tool-group-title { font-size: 13px; color: #475569; font-weight: 700; margin-bottom: 12px; }
.tool-list { display: grid; grid-template-columns: 1fr; gap: 12px; }
.tool-row { border: 1px solid #e5e7eb; border-radius: 14px; background: #ffffff; padding: 12px; box-shadow: 0 2px 10px rgba(17,24,39,0.06); }
.tool-row-head { display: flex; align-items: center; gap: 10px; }
.tool-row-name { font-weight: 400; color: #0f172a; font-size: 13px; }
.tool-row-state { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: #64748b; margin-left: auto; text-align: right; }
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
</style>
