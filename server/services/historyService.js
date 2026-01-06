// 会话历史服务：内存存储 + 文件持久化
import fs from 'fs'
import path from 'path'

const store = new Map()
const dataDir = path.join(process.cwd(), 'server', 'data')

function ensureDir() {
  try {
    fs.mkdirSync(dataDir, { recursive: true })
  } catch {}
}

export function listSessions() {
  return Array.from(store.keys())
}

export function getSessionHistory(sessionId) {
  const id = String(sessionId || 'default')
  return store.get(id) || []
}

export function appendSessionSegments(sessionId, segments, maxTurns = 12) {
  const id = String(sessionId || 'default')
  const prev = store.get(id) || []
  const next = [...prev, ...segments.filter((m) => m && m.role && m.content)]
  const trimmed = next.slice(-Math.max(0, Number(maxTurns) || 12) * 2)
  store.set(id, trimmed)
  return trimmed
}

export function clearSession(sessionId) {
  const id = String(sessionId || 'default')
  store.delete(id)
}

ensureDir()

