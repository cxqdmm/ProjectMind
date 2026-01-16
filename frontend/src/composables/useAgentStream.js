import { ref } from 'vue'

function taskKey(t) {
  const id = String(t?.id || '').trim()
  if (id) return id
  const idx = Number(t?.index)
  if (Number.isFinite(idx)) return `idx_${idx}`
  const title = String(t?.title || '').trim()
  return title ? `title_${title}` : 'idx_0'
}

function normalizeTasks(list) {
  const arr = Array.isArray(list) ? list : []
  return arr
    .map((t) => ({
      id: t?.id,
      index: Number.isFinite(Number(t?.index)) ? Number(t.index) : 0,
      title: String(t?.title || '').trim() || '未命名子任务',
      status: String(t?.status || 'pending'),
      result: t?.result ?? '',
      error: t?.error ?? '',
      toolEvents: Array.isArray(t?.toolEvents) ? t.toolEvents : [],
      memories: Array.isArray(t?.memories) ? t.memories : [],
    }))
    .sort((a, b) => Number(a.index) - Number(b.index))
}

function mergeMemories(target, list) {
  const prev = Array.isArray(target) ? target : []
  const arr = Array.isArray(list) ? list : []
  const seen = new Set(prev.map((m) => String(m?.key || `${m?.skill || ''}::${m?.toolName || ''}::${m?.reference || ''}::${m?.script || ''}`)))
  const next = [...prev]
  for (const m of arr) {
    const k = String(m?.key || `${m?.skill || ''}::${m?.toolName || ''}::${m?.reference || ''}::${m?.script || ''}`)
    if (!k || seen.has(k)) continue
    seen.add(k)
    next.push(m)
  }
  return next
}

function upsertTaskIntoMessage(messages, msgIndex, task) {
  const m = messages.value?.[msgIndex]
  if (!m || !task) return
  const existing = Array.isArray(m.tasks) ? [...m.tasks] : []
  const key = taskKey(task)
  const idx = existing.findIndex((x) => taskKey(x) === key)
  const prev = idx >= 0 ? existing[idx] : null
  const item = {
    id: task?.id,
    index: Number.isFinite(Number(task?.index)) ? Number(task.index) : idx >= 0 ? existing[idx].index : existing.length,
    title: String(task?.title || '').trim() || (idx >= 0 ? existing[idx].title : '未命名子任务'),
    status: String(task?.status || (idx >= 0 ? existing[idx].status : 'pending')),
    result: task?.result ?? (idx >= 0 ? existing[idx].result : ''),
    error: task?.error ?? (idx >= 0 ? existing[idx].error : ''),
    toolEvents: Array.isArray(prev?.toolEvents) ? prev.toolEvents : [],
    memories: Array.isArray(prev?.memories) ? prev.memories : [],
  }
  if (idx >= 0) existing[idx] = { ...existing[idx], ...item }
  else existing.push(item)
  existing.sort((a, b) => Number(a.index) - Number(b.index))
  m.tasks = existing
}

function ensureTaskInMessage(messages, msgIndex, taskCtx) {
  const m = messages.value?.[msgIndex]
  if (!m) return null
  const list = Array.isArray(m.tasks) ? [...m.tasks] : []
  const id = String(taskCtx?.id || '').trim()
  const index = Number(taskCtx?.index)
  let idx = -1
  if (id) idx = list.findIndex((t) => String(t?.id || '') === id)
  if (idx < 0 && Number.isFinite(index)) idx = list.findIndex((t) => Number(t?.index) === index)
  if (idx < 0) {
    list.push({
      id: id || undefined,
      index: Number.isFinite(index) ? index : list.length,
      title: String(taskCtx?.title || '').trim() || '未命名子任务',
      status: 'pending',
      result: '',
      error: '',
      toolEvents: [],
      memories: [],
    })
    list.sort((a, b) => Number(a.index) - Number(b.index))
    m.tasks = list
    return list.find((t) => (id ? String(t?.id || '') === id : Number(t?.index) === index)) || null
  }
  const t = list[idx]
  if (!Array.isArray(t.toolEvents)) t.toolEvents = []
  if (!Array.isArray(t.memories)) t.memories = []
  m.tasks = list
  return t
}

function ensureTasksPart(messages, msgIndex) {
  const m = messages.value?.[msgIndex]
  if (!m) return
  const arr = Array.isArray(m.content) ? m.content : []
  if (!m.__tasks_part_added) {
    arr.push({ type: 'tasks', timestamp: Date.now() })
    m.content = arr
    m.__tasks_part_added = true
  }
}

function applyUsage(tokenLast, tokenTotal, u) {
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

function upsertToolUpdateEvent(events, update) {
  const list = Array.isArray(events) ? events : []
  const id = String(update?.id || '')
  if (!id) return list
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i]
    if (it?.messageType === 'tool_update' && String(it?.id || '') === id) {
      list[i] = { ...it, ...update, messageType: 'tool_update', id }
      return list
    }
  }
  list.push({ ...update, messageType: 'tool_update', id })
  return list
}

function upsertToolUpdatePart(contentParts, update) {
  const list = Array.isArray(contentParts) ? contentParts : []
  const id = String(update?.id || '')
  if (!id) return list
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i]
    if (it?.type === 'tool_update' && String(it?.id || '') === id) {
      list[i] = { ...it, ...update, type: 'tool_update', id }
      return list
    }
  }
  list.push({ ...update, type: 'tool_update', id })
  return list
}

function upsertTaskToolCall(toolEvents, call, timestamp) {
  const list = Array.isArray(toolEvents) ? toolEvents : []
  const id = String(call?.id || '')
  if (!id) return list
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i]
    if (it && String(it.id || '') === id) {
      list[i] = { ...it, ...call, id, timestamp: Number(timestamp || it.timestamp || Date.now()) }
      return list
    }
  }
  list.push({ ...call, id, timestamp: Number(timestamp || Date.now()) })
  return list
}

function applyToolUpdateToTaskToolEvents(toolEvents, update) {
  const list = Array.isArray(toolEvents) ? toolEvents : []
  const id = String(update?.id || '')
  if (!id) return list
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i]
    if (it && String(it.id || '') === id) {
      list[i] = {
        ...it,
        status: update.status ?? it.status,
        result: update.result ?? it.result,
        error: update.error ?? it.error,
        startedAt: update.startedAt ?? it.startedAt,
        completedAt: update.completedAt ?? it.completedAt,
        durationMs: update.durationMs ?? it.durationMs,
        timestamp: Number(update.timestamp || it.timestamp || Date.now()),
      }
      return list
    }
  }
  list.push({
    id,
    provider: '',
    tool: '',
    toolName: '',
    name: '',
    input: null,
    inputPreview: null,
    status: update.status ?? 'pending',
    result: update.result ?? null,
    error: update.error ?? null,
    startedAt: update.startedAt ?? null,
    completedAt: update.completedAt ?? null,
    durationMs: update.durationMs ?? null,
    timestamp: Number(update.timestamp || Date.now()),
  })
  return list
}

export function useAgentStream(opts = {}) {
  const baseUrl = String(opts.baseUrl || 'http://localhost:3334').replace(/\/$/, '')
  const messages = ref([])
  const logs = ref([])
  const sending = ref(false)
  const tokenVisible = ref(false)
  const tokenLast = ref({ promptTokens: 0, completionTokens: 0, totalTokens: 0, estimated: false })
  const tokenTotal = ref({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })

  function addMessage(role, content, citations = [], onUpdate) {
    messages.value.push({ role, content: [{ type: 'text', text: String(content || '') }], citations })
    if (typeof onUpdate === 'function') onUpdate()
  }

  async function send(text, ctx = {}) {
    const value = String(text || '').trim()
    if (!value) return
    const sessionId = String(ctx.sessionId || '')
    const selection = ctx.selection || null
    const onUpdate = typeof ctx.onUpdate === 'function' ? ctx.onUpdate : null

    addMessage('user', value, [], onUpdate)
    sending.value = true
    tokenVisible.value = true
    try {
      const placeholder = { role: 'assistant', content: [{ type: 'text', text: '处理中…' }], citations: [], pending: true }
      messages.value.push(placeholder)
      if (onUpdate) onUpdate()
      const idx = messages.value.length - 1
      const body = {
        userInput: value,
        sessionId,
        provider: selection?.provider,
        model: selection?.model,
      }
      const r = await fetch(`${baseUrl}/api/agent/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let hadPlaceholder = false
      let buf = ''
      while (true) {
        const { done, value: chunkValue } = await reader.read()
        if (done) break
        buf += decoder.decode(chunkValue, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() || ''
        for (const chunk of parts) {
          const line = chunk.split('\n').find((l) => l.startsWith('data:'))
          if (!line) continue
          if (!hadPlaceholder) {
            hadPlaceholder = true
            messages.value[idx].content = []
          }
          let data = null
          try {
            data = JSON.parse(line.slice(5).trim())
          } catch (_) {
            data = null
          }
          if (!data) continue

          if (data.type === 'assistant') {
            const arr = Array.isArray(messages.value[idx].content) ? messages.value[idx].content : []
            arr.push({ type: 'text', text: String(data.content || '') })
            messages.value[idx].content = arr
          } else if (data.type === 'tool_calls') {
            if (data.task && (data.task.id != null || data.task.index != null)) {
              const t = ensureTaskInMessage(messages, idx, data.task)
              if (t) {
                t.toolEvents = Array.isArray(t.toolEvents) ? t.toolEvents : []
                const calls = Array.isArray(data.calls) ? data.calls : []
                const ts = Date.now()
                for (const c of calls) upsertTaskToolCall(t.toolEvents, c, ts)
              }
            } else {
              const arr = Array.isArray(messages.value[idx].content) ? messages.value[idx].content : []
              arr.push({ type: 'tool_calls', calls: data.calls || [], timestamp: Date.now() })
              messages.value[idx].content = arr
            }
          } else if (data.type === 'tool_update') {
            if (data.task && (data.task.id != null || data.task.index != null)) {
              const t = ensureTaskInMessage(messages, idx, data.task)
              if (t) {
                t.toolEvents = Array.isArray(t.toolEvents) ? t.toolEvents : []
                applyToolUpdateToTaskToolEvents(t.toolEvents, { id: data.id, status: data.status, result: data.result, error: data.error, startedAt: data.startedAt, completedAt: data.completedAt, durationMs: data.durationMs, timestamp: Date.now() })
              }
            } else {
              const arr = Array.isArray(messages.value[idx].content) ? messages.value[idx].content : []
              upsertToolUpdatePart(arr, { id: data.id, status: data.status, result: data.result, error: data.error, startedAt: data.startedAt, completedAt: data.completedAt, durationMs: data.durationMs, timestamp: Date.now() })
              messages.value[idx].content = arr
            }
          } else if (data.type === 'memory_used') {
            const list = Array.isArray(data.memories) ? data.memories : []
            if (list.length) {
              if (data.task && (data.task.id != null || data.task.index != null)) {
                const t = ensureTaskInMessage(messages, idx, data.task)
                if (t) t.memories = mergeMemories(t.memories, list)
              } else {
                const arr = Array.isArray(messages.value[idx].content) ? messages.value[idx].content : []
                arr.push({ type: 'memory_used', memories: list, timestamp: Date.now() })
                messages.value[idx].content = arr
              }
            }
          } else if (data.type === 'llm_usage') {
            applyUsage(tokenLast, tokenTotal, data.usage)
          } else if (data.type === 'task_list') {
            const m = messages.value[idx]
            if (m) {
              m.tasks = normalizeTasks(data.tasks || [])
              ensureTasksPart(messages, idx)
            }
          } else if (data.type === 'task_update') {
            ensureTasksPart(messages, idx)
            upsertTaskIntoMessage(messages, idx, data.task)
          } else if (data.type === 'debug_log') {
            if (data.log) {
              logs.value.push(data.log)
            }
          }

          if (data.type === 'done' || (data.type === 'assistant' && typeof data.reply === 'string')) {
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

          if (onUpdate) onUpdate()
        }
      }
    } catch (e) {
      addMessage('assistant', '调用失败，请检查网络或密钥。', [], onUpdate)
      sending.value = false
    }
  }

  return { messages, logs, sending, tokenVisible, tokenLast, tokenTotal, send, addMessage }
}
