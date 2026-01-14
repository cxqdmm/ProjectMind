function normalizeCall(c) {
  return {
    id: c.id,
    provider: c.provider,
    tool: c.tool,
    toolName: c.toolName,
    name: c.name,
    status: c.status || 'pending',
    input: c.input,
    inputPreview: c.inputPreview,
    result: c.result ?? null,
    error: c.error ?? null,
    startedAt: c.startedAt,
    completedAt: c.completedAt ?? null,
    durationMs: c.durationMs ?? null,
  }
}

export function buildToolView(events) {
  const out = []
  const sorted = [...(events || [])].sort((a, b) => {
    const ta = Number(a?.timestamp || a?.startedAt || 0)
    const tb = Number(b?.timestamp || b?.startedAt || 0)
    return ta - tb
  })
  const maps = []
  for (const ev of sorted) {
    if (ev?.messageType === 'tool_calls') {
      const map = new Map()
      const batch = { calls: [] }
      for (const c of (ev.calls || [])) {
        const item = normalizeCall({ ...c, status: 'pending', result: null, error: null, completedAt: null, durationMs: null })
        map.set(c.id, item)
        batch.calls.push(item)
      }
      maps.push(map)
      out.push(batch)
    } else if (ev?.messageType === 'tool_update') {
      const id = ev.id
      if (!id) continue
      for (let i = maps.length - 1; i >= 0; i--) {
        const map = maps[i]
        if (!map.has(id)) continue
        const cur = map.get(id)
        const next = {
          ...cur,
          status: ev.status || cur.status,
          result: ev.result ?? cur.result,
          error: ev.error ?? cur.error,
          startedAt: ev.startedAt ?? cur.startedAt,
          completedAt: ev.completedAt ?? cur.completedAt,
          durationMs: ev.durationMs ?? cur.durationMs,
        }
        map.set(id, next)
        break
      }
    }
  }
  return out
}

export function extractEvents(message) {
  const parts = Array.isArray(message?.content) ? message.content : []
  const evs = []
  for (const p of parts) {
    if (p?.type === 'tool_calls') {
      evs.push({ messageType: 'tool_calls', calls: p.calls || [], timestamp: p.timestamp })
    } else if (p?.type === 'tool_update') {
      evs.push({ messageType: 'tool_update', id: p.id, status: p.status, result: p.result, error: p.error, startedAt: p.startedAt, completedAt: p.completedAt, durationMs: p.durationMs, timestamp: p.timestamp })
    }
  }
  return evs
}

export function buildBatchForItem(message, part) {
  const events = extractEvents(message)
  const idSet = new Set((part?.calls || []).map((c) => c.id))
  const filtered = events.filter((ev) => {
    if (ev.messageType === 'tool_calls') return ev.calls?.some((c) => idSet.has(c.id))
    return idSet.has(ev.id)
  })
  const batches = buildToolView(filtered)
  return batches.slice(0, 1)
}

export function callTitle(x) {
  if (!x) return ''
  if (x.provider === 'openskills') {
    const tool = String(x.tool || x.toolName || '')
    const skill = String(x.input?.skill || '')
    const script = String(x.input?.script || '')
    if (tool === 'openskills.call') return `${skill} · ${script ? script.split('/').pop() : 'call'}`
    if (tool === 'openskills.readReference') return `${skill} · readReference`
    if (tool === 'openskills.read') return `${skill} · read`
    return `${skill} · ${tool.split('.').pop() || tool}`
  }
  const t = String(x.toolName || x.tool || x.name || '')
  return t
}

export function toolInfoLabel(call) {
  const tool = String(call?.tool || call?.toolName || '')
  if (tool === 'openskills.readReference') {
    const f = String(call?.input?.file || '')
    return f ? f : ''
  }
  if (tool === 'openskills.call') {
    const s = String(call?.input?.script || '')
    return s ? s : ''
  }
  return ''
}

export function stateDotClass(s) {
  const k = String(s || '').toLowerCase()
  if (k === 'running') return 'dot dot-blue'
  if (k === 'failed') return 'dot dot-red'
  if (k === 'started' || k === 'pending') return 'dot dot-amber'
  return 'dot dot-green'
}

export function formatDuration(ms) {
  const n = Number(ms) || 0
  if (n < 1000) return `${n}ms`
  const sec = n / 1000
  return `${sec.toFixed(sec >= 10 ? 0 : 1)}s`
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

export function formatTime(ts) {
  const d = new Date(Number(ts) || Date.now())
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

export function formatJSON(v) {
  if (v == null) return ''
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v, null, 2)
  } catch (_) {
    return String(v)
  }
}

