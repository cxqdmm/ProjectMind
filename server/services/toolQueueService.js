const queue = []

function now() {
  return Date.now()
}

function newId() {
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function normalizeCall(c) {
  return {
    id: String(c?.id || newId()),
    provider: String(c?.provider || '').trim(),
    tool: String(c?.tool || '').trim(),
    toolName: String(c?.toolName || '').trim(),
    input: c?.input ?? {},
    status: 'pending',
    createdAt: now(),
    startedAt: null,
    completedAt: null,
    durationMs: null,
    result: null,
    error: null,
  }
}

export function resetToolQueue() {
  queue.length = 0
}

export function enqueueToolCalls(calls = []) {
  const arr = Array.isArray(calls) ? calls : []
  const prepared = arr.map((c) => normalizeCall(c))
  queue.push(...prepared)
  return prepared
}

export function hasPendingToolCalls() {
  return queue.some((c) => c.status === 'pending' || c.status === 'running')
}

export function getNextPendingToolCall() {
  return queue.find((c) => c.status === 'pending') || null
}

export function markToolCallStarted(id) {
  const item = queue.find((c) => String(c.id) === String(id))
  if (!item) return null
  item.status = 'running'
  item.startedAt = now()
  return item
}

export function markToolCallCompleted(id, result) {
  const item = queue.find((c) => String(c.id) === String(id))
  if (!item) return null
  item.status = 'completed'
  item.result = result
  item.completedAt = now()
  item.durationMs = item.startedAt ? item.completedAt - item.startedAt : null
  return item
}

export function markToolCallFailed(id, error) {
  const item = queue.find((c) => String(c.id) === String(id))
  if (!item) return null
  item.status = 'failed'
  item.error = String(error || '')
  item.completedAt = now()
  item.durationMs = item.startedAt ? item.completedAt - item.startedAt : null
  return item
}

