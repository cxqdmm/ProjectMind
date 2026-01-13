// 记忆服务：基于技能内容与参考文件构建“记忆”，并在决策前检索相关记忆

import { loadDocumentedMemories, createMemoryFromSkillData, saveMemory } from './memoryFileService.js'

const memoryStore = new Map()
let documentedMemoriesCache = null
let documentedMemoriesCacheTime = 0
const CACHE_TTL = 60000 // 1 分钟缓存

function safeStringify(val) {
  if (typeof val === 'string') return val
  try {
    return JSON.stringify(val, null, 2)
  } catch {
    return String(val ?? '')
  }
}

function tryParseJsonObject(text) {
  const t = String(text || '').trim()
  if (!t) return null
  if (!(t.startsWith('{') && t.endsWith('}'))) return null
  try {
    const obj = JSON.parse(t)
    return obj && typeof obj === 'object' ? obj : null
  } catch {
    return null
  }
}

function buildSkillMemoriesFromMessages(messages) {
  const raw = Array.isArray(messages) ? messages : []
  const memories = []
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i]
    if (!m || m.role !== 'openSkill') continue
    const toolName = String(m.toolName || '')
    const skill = String(m.skill || '').trim()
    const reference = String(m.reference || '').trim()
    const rawContent = m.content
    if (rawContent == null) continue

    if (toolName !== 'read' && toolName !== 'readReference' && toolName !== 'call') continue

    const now = Date.now()
    const meta = m.meta && typeof m.meta === 'object' ? m.meta : {}
    const script = toolName === 'call' ? String(m.script || '') : ''

    const contentText = safeStringify(rawContent)

    let snippet = ''
    let nextMeta = meta
    if (toolName === 'call') {
      const obj = typeof rawContent === 'object' && rawContent ? rawContent : tryParseJsonObject(contentText)
      const desc = String(obj?.desc || meta?.desc || '').trim()
      snippet = desc || `${skill} 调用脚本 ${script || '未知脚本'}`
      nextMeta = { ...meta, desc }
    } else {
      const name = String(meta.name || '').trim()
      const description = String(meta.description || '').trim()
      snippet = `${name}${description ? `: ${description}` : ''}`.trim()
      if (!snippet) {
        snippet = contentText.slice(0, 120)
      }
    }

    memories.push({
      toolName,
      skill,
      reference: toolName === 'readReference' ? reference : '',
      script: toolName === 'call' ? script : '',
      content: contentText,
      snippet,
      meta: nextMeta,
      createdAt: now,
      updatedAt: now,
    })
  }
  return memories
}

export function appendSkillMemories(sessionId, messages, maxPerSession = 200) {
  const id = String(sessionId || 'default')
  const prev = memoryStore.get(id) || []
  const added = buildSkillMemoriesFromMessages(messages)
  if (!added.length) return { all: prev, added: [] }
  // 尝试将新记忆保存为文档化记忆（可选，可以后续优化为自动保存）
  for (const mem of added) {
    try {
      const docMem = createMemoryFromSkillData(mem)
      // 注意：这里可以选择性地保存，避免每次对话都创建文件
      saveMemory(docMem)
    } catch {}
  }
  const next = [...prev, ...added]
  const trimmed =
    next.length > maxPerSession ? next.slice(next.length - maxPerSession) : next
  memoryStore.set(id, trimmed)
  return { all: trimmed, added }
}

function normalizeMemoryForSelection(mem) {
  // 统一文档化记忆和运行时记忆的格式
  const toolName = String(
    mem.toolName ||
      (mem.type === 'skill' ? 'read' : mem.type === 'reference' ? 'readReference' : mem.type === 'call' ? 'call' : '')
  )
  const key = `${mem.skill || ''}::${toolName}::${mem.reference || ''}::${mem.script || ''}`
  return {
    key,
    toolName,
    skill: mem.skill,
    reference: mem.reference,
    script: mem.script,
    content: mem.content,
    snippet: mem.snippet,
    meta: mem.meta || {},
    updatedAt: mem.updatedAt || Date.now(),
  }
}

export function getSkillMemories(sessionId) {
  const id = String(sessionId || 'default')
  const runtime = memoryStore.get(id) || []
  // 合并文档化记忆
  const now = Date.now()
  if (!documentedMemoriesCache || now - documentedMemoriesCacheTime > CACHE_TTL) {
    documentedMemoriesCache = loadDocumentedMemories()
    documentedMemoriesCacheTime = now
  }
  // 去重：相同 skill + toolName + reference + script 时，优先使用文档化记忆
  const merged = []
  const seen = new Map()
  // 先添加文档化记忆
  for (const doc of documentedMemoriesCache) {
    const nd = normalizeMemoryForSelection(doc)
    if (!seen.has(nd.key)) {
      seen.set(nd.key, nd)
      merged.push(normalizeMemoryForSelection(doc))
    }
  }
  // 再添加运行时记忆（如果不存在或更新）
  for (const rt of runtime) {
    const nr = normalizeMemoryForSelection(rt)
    if (!seen.has(nr.key)) {
      merged.push(normalizeMemoryForSelection(rt))
    } else {
      // 如果运行时记忆更新，则替换文档化记忆
      const doc = seen.get(nr.key)
      const rtTime = rt.updatedAt || Date.now()
      const docTime = doc.updatedAt || 0
      if (rtTime > docTime) {
        const idx = merged.findIndex((m) => m.key === doc.key)
        if (idx > -1) {
          merged[idx] = normalizeMemoryForSelection(rt)
        }
      }
    }
  }
  return merged
}

function buildSelectorMessages(userInputs, memories) {
  const inputs = Array.isArray(userInputs) ? userInputs : [String(userInputs || '')]
  const questionContext = inputs
    .map((inp, idx) => {
      const text = String(inp || '').trim()
      if (!text) return ''
      return inputs.length > 1 ? `[${idx + 1}] ${text}` : text
    })
    .filter(Boolean)
    .join('\n')
  const items = memories.map((m, idx) => ({
    idx,
    toolName: m.toolName,
    skill: m.skill,
    reference: m.reference,
    script: m.script,
    snippet: m.snippet,
  }))
  const payload = JSON.stringify(
    {
      userQuestions: questionContext,
      memories: items,
      instructions:
        'From the memories list, pick only entries that are clearly helpful to answer the userQuestions (which may include recent conversation context). Prefer high semantic relevance. Return ONLY a JSON array of selected idx numbers, like [0,2]. If nothing is relevant, return an empty array []. Do not include any other text.',
    },
    null,
    2
  )
  const system =
    'You are a selector that chooses useful memory entries for an AI assistant based on recent user questions and conversation context. ' +
    'You MUST respond with a single JSON array of ids and nothing else.'
  const user =
    'Here is the selection task input:\n\n' +
    payload +
    '\n\nReturn ONLY the JSON array of selected ids. No explanation.'
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

function parseSelectedIds(rawText) {
  const txt = String(rawText || '').trim()
  if (!txt) return []
  try {
    // 直接整体解析
    const full = JSON.parse(txt)
    if (Array.isArray(full)) {
      return full.map((x) => Number(x)).filter((x) => Number.isFinite(x))
    }
  } catch {}
  // 回退：尝试从文本中提取第一个 JSON 数组片段
  const match = txt.match(/\[[\s\S]*\]/)
  if (match) {
    try {
      const arr = JSON.parse(match[0])
      if (Array.isArray(arr)) {
        return arr.map((x) => Number(x)).filter((x) => Number.isFinite(x))
      }
    } catch {}
  }
  return []
}

export async function selectSkillMemoriesForQuestion(provider, userInputs, sessionId, limit = 5) {
  const all = getSkillMemories(sessionId)
  if (all.length === 0) {
    return { selected: [], all }
  }
  const base = all.slice(-Math.max(1, limit * 2)) // 最近的一批作为候选
  // 如果没有 provider 或 FAKE_LLM 模式下不希望额外请求，可以简单返回最近几条
  if (!provider || typeof provider.chat !== 'function') {
    const fallback = base.slice(-limit)
    return { selected: fallback, all }
  }
  try {
    const messages = buildSelectorMessages(userInputs, base)
    const raw = await provider.chat(messages)
    const idxs = parseSelectedIds(raw)
    const picked = base.filter((_, idx) => idxs.includes(idx))
    if (picked.length > 0) {
      return { selected: picked, all }
    } else {
      return { selected: [], all }
    }
  } catch {
    const fallback = base.slice(-limit)
    return { selected: fallback, all }
  }
}

export function buildMemoryMessages(selected) {
  const arr = Array.isArray(selected) ? selected : []
  return arr.map((m) => {
    const lines = []
    const skill = m.skill || ''
    const ref = m.reference || ''
    const script = m.script || ''
    const toolName = m.toolName || ''
    const desc = String(m.meta?.desc || '').trim()

    let header = ''
    if (toolName === 'call') {
      header = `已执行技能「${skill || '未知技能'}」的脚本「${script || '未知脚本'}」${desc ? `（${desc}）` : ''}，结果是：`
    } else if (toolName === 'readReference') {
      header = `已加载技能「${skill || '未知技能'}」的参考文件「${ref}」，内容是：`
    } else {
      header = `已加载技能「${skill || '未知技能'}」的正文，内容是：`
    }

    lines.push(header)
    lines.push('')
    lines.push(m.content || '')
    return {
      role: 'assistant',
      content: lines.join('\n'),
    }
  })
}

export function buildMemoryEventPayload(selected) {
  const arr = Array.isArray(selected) ? selected : []
  const now = Date.now()
  return arr.map((m) => ({
    key: m.key,
    toolName: m.toolName,
    skill: m.skill,
    reference: m.reference,
    script: m.script,
    snippet: m.snippet,
    timestamp: now,
  }))
}
