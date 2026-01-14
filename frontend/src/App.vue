<template>
  <div class="app">
    <header class="header">
      <div class="header-inner">
        <h1>智能助手</h1>
        <div class="toolbar">
          <button class="tool-btn" @click="onSkillsToggle" title="技能">
            <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 2l3 6l6 1l-4.5 4.2L18 20l-6-3.2L6 20l1.5-6.8L3 9l6-1z" fill="#0ea5e9"/></svg>
            技能
          </button>
          <div v-show="skillsOpen" ref="skillsDropdownRef" class="skills-dropdown">
            <div class="skills-head">
              <span>技能列表</span>
              <button class="refresh-btn" @click="onSkillsRefresh" :disabled="skillsLoading">{{ skillsLoading ? '加载中…' : '刷新' }}</button>
            </div>
            <div class="skills-body">
              <div v-if="skillsError" class="skills-empty">加载失败</div>
              <div v-else-if="skillsLoading" class="skills-empty">加载中…</div>
              <div v-else-if="!skills.length" class="skills-empty">暂无技能</div>
              <div v-else class="skills-list">
                <div v-for="s in skills" :key="s.key" class="skill-item">
                  <div class="skill-text">
                    <div class="skill-name">{{ s.name || s.key }}</div>
                    <div class="skill-desc">{{ s.description || '' }}</div>
                  </div>
                  <button class="skill-insert" @click="onInsertSkill(s.name || s.key)">插入</button>
                </div>
              </div>
            </div>
          </div>
          <button class="tool-btn" @click="onModelsToggle" title="模型">
            <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 3l9 5v8l-9 5-9-5V8l9-5zm0 2.2L6 8l6 3.3L18 8 12 5.2zm7 5.6l-7 3.9-7-3.9v4.4l7 3.9 7-3.9v-4.4z" fill="#111827"/></svg>
            {{ currentModelLabel || '模型' }}
          </button>
          <div v-show="modelsOpen" ref="modelsDropdownRef" class="skills-dropdown">
            <div class="skills-head">
              <span>可用模型</span>
              <button class="refresh-btn" @click="onModelsRefresh" :disabled="modelsLoading">{{ modelsLoading ? '加载中…' : '刷新' }}</button>
            </div>
            <div class="skills-body">
              <div v-if="modelsError" class="skills-empty">加载失败</div>
              <div v-else-if="modelsLoading" class="skills-empty">加载中…</div>
              <div v-else-if="!models.length" class="skills-empty">暂无模型</div>
              <div v-else class="skills-list">
                <div v-for="m in models" :key="m.id" class="skill-item">
                  <div class="skill-text">
                    <div class="skill-name">{{ m.label }}</div>
                    <div class="skill-desc">{{ m.provider }} · {{ m.model }}</div>
                  </div>
                  <button class="skill-insert" :disabled="!m.enabled" @click="onChooseModel(m)">{{ m.enabled ? '选择' : '不可用' }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>

    <main class="main">
      <div class="side-panels">
        <div class="token-panel" v-if="tokenVisible">
          <div class="token-line">
            最近一次：输入 {{ formatTokens(tokenLast.promptTokens) }} / 输出 {{ formatTokens(tokenLast.completionTokens) }} / 合计 {{ formatTokens(tokenLast.totalTokens) }}
            <span v-if="tokenLast.estimated" class="token-hint">（估算）</span>
          </div>
          <div class="token-line">
            累计：输入 {{ formatTokens(tokenTotal.promptTokens) }} / 输出 {{ formatTokens(tokenTotal.completionTokens) }} / 合计 {{ formatTokens(tokenTotal.totalTokens) }}
          </div>
        </div>
        <div class="task-panel" v-if="taskVisible">
          <div class="task-head">
            <span>子任务</span>
            <span class="task-count">{{ tasks.length }}</span>
          </div>
          <div v-if="!tasks.length" class="task-empty">暂无子任务</div>
          <div v-else class="task-list">
            <div v-for="t in tasks" :key="taskKey(t)" class="task-item">
              <div class="task-row">
                <span class="task-index">{{ (Number(t.index) || 0) + 1 }}</span>
                <span class="task-title" :title="t.title">{{ t.title }}</span>
                <span class="task-status" :class="taskStatusClass(t.status)">{{ taskStatusText(t.status) }}</span>
                <button class="task-toggle" type="button" @click="toggleTask(taskKey(t))">{{ isTaskOpen(taskKey(t)) ? '收起' : '展开' }}</button>
              </div>
              <div class="task-body" v-show="isTaskOpen(taskKey(t))">
                <pre v-if="t.result" class="task-result">{{ t.result }}</pre>
                <pre v-else-if="t.status === 'failed'" class="task-result">{{ t.error || '执行失败' }}</pre>
                <div v-else class="task-result-empty">暂无结果</div>
              </div>
            </div>
          </div>
        </div>
      </div>
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
            <template v-for="(part, pi) in m.content" :key="pi">
              <div v-if="part?.type === 'text' && m.role === 'assistant'" class="md" v-html="renderMarkdown(String(part?.text || ''))"></div>
              <pre v-else-if="part?.type === 'text'">{{ String(part?.text || '') }}</pre>
              <div v-else-if="part?.type === 'tool_calls'" class="tool-events">
                <div v-for="(batch, bi) in buildBatchForItem(m, part)" :key="bi" class="tool-group compact">
                  <div class="tool-list">
                    <div v-for="call in batch.calls" :key="call.id" class="tool-row">
                      <div class="tool-row-head">
                        <span class="tool-row-name">{{ callTitle(call) }}</span>
                        <span v-if="toolInfoLabel(call)" class="tool-row-ref">{{ toolInfoLabel(call) }}</span>
                        <span class="tool-row-state-dot">
                          <i :class="stateDotClass(call.status)"></i>
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
              <MemoryUsedList
                v-else-if="part?.type === 'memory_used'"
                :memories="part.memories || []"
              />
            </template>
            <div v-if="m.role === 'assistant' && m.pending" class="message-loading">
              <i class="dot dot-amber"></i>
              执行中…
            </div>
            <div v-if="m.citations?.length" class="citations">
              引用：
              <span v-for="(c, i) in m.citations" :key="i" class="citation-item" :title="c.snippet || ''">
                {{ c.title }} · {{ c.source }}
              </span>
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
import MemoryUsedList from './components/MemoryUsedList.vue'
 
 
const messages = ref([])
const input = ref('')
const sending = ref(false)
const messagesRef = ref(null)
const sessionId = ref(localStorage.getItem('pm_session_id') || '')
const openIds = ref(new Set())
const skillsOpen = ref(false)
const skills = ref([])
const skillsLoading = ref(false)
const skillsError = ref('')
const skillsDropdownRef = ref(null)
const tokenLast = ref({ promptTokens: 0, completionTokens: 0, totalTokens: 0, estimated: false })
const tokenTotal = ref({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })
const tokenVisible = ref(false)
const tasks = ref([])
const taskVisible = ref(false)
const openTaskIds = ref(new Set())
const modelsOpen = ref(false)
const models = ref([])
const modelsLoading = ref(false)
const modelsError = ref('')
const modelsDropdownRef = ref(null)
const selectedModel = ref(null)
const currentModelLabel = ref('')

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

function taskKey(t) {
  const id = String(t?.id || '').trim()
  if (id) return id
  const idx = Number(t?.index)
  if (Number.isFinite(idx)) return `idx_${idx}`
  return `task_${Math.random().toString(36).slice(2, 10)}`
}

function isTaskOpen(id) {
  return openTaskIds.value.has(String(id))
}

function toggleTask(id) {
  const k = String(id)
  const s = new Set(openTaskIds.value)
  if (s.has(k)) s.delete(k)
  else s.add(k)
  openTaskIds.value = s
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

function setTaskList(list) {
  const arr = Array.isArray(list) ? list : []
  tasks.value = arr.map((t) => ({
    id: t?.id,
    index: Number.isFinite(Number(t?.index)) ? Number(t.index) : 0,
    title: String(t?.title || '').trim() || '未命名子任务',
    status: String(t?.status || 'pending'),
    result: t?.result ?? '',
    error: t?.error ?? '',
  })).sort((a, b) => Number(a.index) - Number(b.index))
}

function upsertTask(task) {
  if (!task) return
  const key = taskKey(task)
  const next = Array.isArray(tasks.value) ? [...tasks.value] : []
  const idx = next.findIndex((x) => taskKey(x) === key)
  const item = {
    id: task?.id,
    index: Number.isFinite(Number(task?.index)) ? Number(task.index) : (idx >= 0 ? next[idx].index : next.length),
    title: String(task?.title || '').trim() || (idx >= 0 ? next[idx].title : '未命名子任务'),
    status: String(task?.status || (idx >= 0 ? next[idx].status : 'pending')),
    result: task?.result ?? (idx >= 0 ? next[idx].result : ''),
    error: task?.error ?? (idx >= 0 ? next[idx].error : ''),
  }
  if (idx >= 0) next[idx] = { ...next[idx], ...item }
  else next.push(item)
  next.sort((a, b) => Number(a.index) - Number(b.index))
  tasks.value = next
}

async function fetchSkills() {
  try {
    skillsLoading.value = true
    skillsError.value = ''
    const r = await fetch('http://localhost:3334/api/skills/manifest')
    const j = await r.json()
    const arr = Array.isArray(j?.skills) ? j.skills : []
    skills.value = arr.map(x => ({ key: String(x?.key || ''), name: String(x?.name || ''), description: String(x?.description || '') }))
  } catch (e) {
    skillsError.value = '加载失败'
  } finally {
    skillsLoading.value = false
  }
}
function onSkillsToggle() {
  skillsOpen.value = !skillsOpen.value
  if (skillsOpen.value && skills.value.length === 0 && !skillsLoading.value) {
    fetchSkills()
  }
}
function onSkillsRefresh() {
  fetchSkills()
}
function onInsertSkill(name) {
  const t = String(name || '').trim()
  if (!t) return
  input.value = input.value ? input.value + ' ' + t : t
  skillsOpen.value = false
}
async function fetchModels() {
  try {
    modelsLoading.value = true
    modelsError.value = ''
    const r = await fetch('http://localhost:3334/api/models')
    const j = await r.json()
    const arr = Array.isArray(j?.models) ? j.models : []
    models.value = arr.map(x => ({
      id: String(x?.id || ''),
      label: String(x?.label || ''),
      provider: String(x?.provider || ''),
      model: String(x?.model || ''),
      baseURL: String(x?.baseURL || ''),
      enabled: Boolean(x?.enabled),
    }))
    const cur = selectedModel.value
    if (cur) {
      const found = models.value.find(m => m.provider === cur.provider && m.model === cur.model)
      currentModelLabel.value = found ? found.label : ''
    } else {
      const firstEnabled = models.value.find(m => m.enabled)
      if (firstEnabled) {
        selectedModel.value = { provider: firstEnabled.provider, model: firstEnabled.model }
        currentModelLabel.value = firstEnabled.label
      } else {
        currentModelLabel.value = ''
      }
    }
  } catch (e) {
    modelsError.value = '加载失败'
  } finally {
    modelsLoading.value = false
  }
}
function onModelsToggle() {
  modelsOpen.value = !modelsOpen.value
  if (modelsOpen.value && models.value.length === 0 && !modelsLoading.value) {
    fetchModels()
  }
}
function onModelsRefresh() {
  fetchModels()
}
function onChooseModel(m) {
  if (!m?.enabled) return
  selectedModel.value = { provider: m.provider, model: m.model }
  currentModelLabel.value = m.label
  modelsOpen.value = false
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

function textItems(m) {
  const arr = Array.isArray(m?.content) ? m.content : []
  return arr.filter(x => x && x.type === 'text').map(x => String(x.text || ''))
}
function joinText(m) {
  return textItems(m).join('\n\n')
}
function extractEvents(m) {
  const arr = Array.isArray(m?.content) ? m.content : []
  const out = []
  for (const x of arr) {
    if (x && (x.type === 'tool_calls' || x.type === 'tool_update')) {
      out.push({ messageType: x.type === 'tool_calls' ? 'tool_calls' : 'tool_update', ...x })
    }
  }
  return out
}

function buildBatchForItem(m, part) {
  try {
    const events = extractEvents(m)
    const batches = buildToolView(events)
    const ids = new Set((part?.calls || []).map((c) => String(c?.id || '')))
    const match = batches.find((b) => b.calls.some((c) => ids.has(String(c.id || ''))))
    return match ? [match] : []
  } catch (_) {
    return []
  }
}
function callTitle(x) {
  const provider = String(x?.provider || '').trim()
  const tool = String(x?.toolName || x?.tool || '').trim()
  // Fallback
  return tool ? `${provider}.${tool}` : (x?.name || '未知工具')
}

function toolLabel(x) {
  const p = String(x?.provider || '').trim()
  const t = String(x?.toolName || x?.tool || '').trim()
  const name = String(x?.name || '').trim()
  if (name) return name
  if (p && t) return `${p}.${t}`
  return t || p || ''
}

function toolInfoLabel(call) {
  const tool = String(call?.toolName || call?.tool || '')
  const skill = String(call?.input?.skill || call?.result?.key || '')
  const script = String(call?.input?.script || call?.result?.script || '')
  const files = Array.isArray(call?.input?.files)
    ? call.input.files
    : (call?.input?.file ? [call.input.file] : [])
  const extras = Array.isArray(call?.result?.extras) ? call.result.extras.map(e => e?.file).filter(Boolean) : []
  const names = files.length ? files : extras
  if (/readReference/i.test(tool)) {
    const namesText = names.join(', ')
    if (skill && namesText) return `${skill} · ${namesText}`
    return namesText || skill
  }
  if (/read(\b|$)/i.test(tool)) {
    return skill
  }
  if (/call(\b|$)/i.test(tool)) {
    const scriptName = script ? script.split('/').pop() : ''
    if (skill && scriptName) return `${skill} · ${scriptName}`
    return skill || scriptName
  }
  return ''
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

function addMessage(role, content, citations = []) {
  messages.value.push({ role, content: [{ type: 'text', text: String(content || '') }], citations })
  scrollToBottom()
}

async function onSend() {
  const text = input.value
  if (!text) return
  
  addMessage('user', text)
  input.value = ''
  sending.value = true
  tokenVisible.value = true
  taskVisible.value = false
  tasks.value = []
  openTaskIds.value = new Set()
  try {
    const placeholder = { role: 'assistant', content: [{ type: 'text', text: '处理中…' }], citations: [], pending: true }
    messages.value.push(placeholder)
    const idx = messages.value.length - 1
    const body = {
      userInput: text,
      sessionId: sessionId.value,
      provider: selectedModel.value?.provider,
      model: selectedModel.value?.model,
    }
    const r = await fetch('http://localhost:3334/api/agent/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const reader = r.body.getReader()
    const decoder = new TextDecoder()
    let hadPlaceholder = false
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const parts = buf.split('\n\n')
      buf = parts.pop() || ''
      for (const chunk of parts) {
        const line = chunk.split('\n').find(l => l.startsWith('data:'))
        if (!line) continue
        if (!hadPlaceholder) {
          hadPlaceholder = true
          messages.value[idx].content = []
        }
        let data = null
        try { data = JSON.parse(line.slice(5).trim()) } catch (_) { data = null }
        if (!data) continue
        if (data.type === 'assistant') {
          const arr = Array.isArray(messages.value[idx].content) ? messages.value[idx].content : []
          arr.push({ type: 'text', text: String(data.content || '') })
          messages.value[idx].content = arr
        } else if (data.type === 'tool_calls') {
          const arr = Array.isArray(messages.value[idx].content) ? messages.value[idx].content : []
          arr.push({ type: 'tool_calls', calls: data.calls || [], timestamp: Date.now() })
          messages.value[idx].content = arr
        } else if (data.type === 'tool_update') {
          const arr = Array.isArray(messages.value[idx].content) ? messages.value[idx].content : []
          arr.push({ type: 'tool_update', id: data.id, status: data.status, result: data.result, error: data.error, startedAt: data.startedAt, completedAt: data.completedAt, durationMs: data.durationMs, timestamp: Date.now() })
          messages.value[idx].content = arr
        } else if (data.type === 'memory_used') {
          const arr = Array.isArray(messages.value[idx].content) ? messages.value[idx].content : []
          const list = Array.isArray(data.memories) ? data.memories : []
          if (list.length) {
            arr.push({ type: 'memory_used', memories: list, timestamp: Date.now() })
            messages.value[idx].content = arr
          }
        } else if (data.type === 'llm_usage') {
          applyUsage(data.usage)
        } else if (data.type === 'task_list') {
          debugger
          taskVisible.value = true
          setTaskList(data.tasks || [])
          openTaskIds.value = new Set()
        } else if (data.type === 'task_update') {
          debugger
          taskVisible.value = true
          upsertTask(data.task)
        } else if (data.type === 'done') {
          const arr = Array.isArray(messages.value[idx].content) ? messages.value[idx].content : []
          if (typeof data.reply === 'string') arr.push({ type: 'text', text: String(data.reply) })
          messages.value[idx].content = arr
          messages.value[idx].pending = false
          sending.value = false
        } else if (data.type === 'error') {
          messages.value[idx].content = [{ type: 'text', text: '执行失败' }]
          messages.value[idx].pending = false
          sending.value = false
        } else if (data.type === 'end') {
          messages.value[idx].pending = false
          sending.value = false
        }
      }
    }
  } catch (e) {
    addMessage('assistant', '调用失败，请检查网络或密钥。')
    sending.value = false
  }
}

function formatTokens(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '-'
  return String(Math.max(0, Math.floor(v)))
}

function applyUsage(u) {
  if (!u || typeof u !== 'object') return
  const p = Number(u.promptTokens)
  const c = Number(u.completionTokens)
  const t = Number(u.totalTokens)
  const nextLast = { ...tokenLast.value }
  if (Number.isFinite(p)) nextLast.promptTokens = p
  if (Number.isFinite(c)) nextLast.completionTokens = c
  if (Number.isFinite(t)) nextLast.totalTokens = t
  nextLast.estimated = Boolean(u.estimated)
  tokenLast.value = nextLast

  const tot = { ...tokenTotal.value }
  if (Number.isFinite(p)) tot.promptTokens += p
  if (Number.isFinite(c)) tot.completionTokens += c
  if (Number.isFinite(t)) tot.totalTokens += t
  tokenTotal.value = tot
}

onMounted(() => {
  if (!sessionId.value) {
    sessionId.value = `pm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem('pm_session_id', sessionId.value)
  }
  addMessage('assistant', '你好！我是智能助手，可以帮助你解决问题。\n\n请输入你的需求开始吧。')
  document.addEventListener('click', (ev) => {
    const el = skillsDropdownRef.value
    const el2 = modelsDropdownRef.value
    const toolbar = document.querySelector('.toolbar')
    if (!el || !toolbar) return
    const target = ev.target
    if (skillsOpen.value && target && !toolbar.contains(target)) {
      skillsOpen.value = false
    }
    if (modelsOpen.value && target && !toolbar.contains(target)) {
      modelsOpen.value = false
    }
  })
  fetchModels()
})

// api key handling removed
</script>

<style scoped>
.app { color: #0f172a; background: #ffffff; min-height: 100vh; }
.header { position: sticky; top: 0; background: #ffffff; border-bottom: 1px solid #e5e7eb; z-index: 10; }
.header-inner { max-width: 960px; margin: 0 auto; padding: 12px 20px; display: flex; align-items: center; gap: 12px; }
.header h1 { margin: 0; font-size: 16px; font-weight: 700; }
.toolbar { margin-left: auto; display: flex; align-items: center; gap: 8px; position: relative; }
.tool-btn { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid #e5e7eb; background: #fff; color: #0f172a; font-size: 12px; border-radius: 12px; }
.tool-btn:hover { background: #f8fafc; }
.side-panels { position: fixed; right: 20px; top: 76px; z-index: 9; width: 320px; display: flex; flex-direction: column; gap: 10px; }
.token-panel { padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff; font-size: 12px; color: #475569; box-shadow: 0 12px 28px rgba(17,24,39,0.08); }
.token-line { line-height: 1.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.token-hint { color: #94a3b8; margin-left: 4px; }
.task-panel { padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff; font-size: 12px; color: #0f172a; box-shadow: 0 12px 28px rgba(17,24,39,0.08); max-height: 52vh; overflow: auto; }
.task-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #475569; font-weight: 600; }
.task-count { margin-left: auto; font-size: 11px; color: #64748b; background: #f1f5f9; border: 1px solid #e5e7eb; padding: 1px 6px; border-radius: 999px; }
.task-empty { color: #64748b; padding: 6px 0; }
.task-list { display: grid; grid-template-columns: 1fr; gap: 8px; }
.task-item { border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff; }
.task-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
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
@media (max-width: 1100px) {
  .side-panels { position: sticky; top: 64px; right: auto; width: min(820px, calc(100% - 40px)); margin: 8px auto 0; box-shadow: none; background: transparent; }
  .token-panel, .task-panel { box-shadow: none; background: #f8fafc; }
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
