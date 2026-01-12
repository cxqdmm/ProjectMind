// 记忆服务：基于技能内容与参考文件构建“记忆”，并在决策前检索相关记忆

import { loadDocumentedMemories, createMemoryFromSkillData, saveMemory } from './memoryFileService.js'

const memoryStore = new Map()
let documentedMemoriesCache = null
let documentedMemoriesCacheTime = 0
const CACHE_TTL = 60000 // 1 分钟缓存

function buildSkillMemoriesFromMessages(messages) {
  const raw = Array.isArray(messages) ? messages : []
  const memories = []
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i]
    if (!m || m.role !== 'openSkill') continue
    const tool = String(m.toolName || '')
    const skill = String(m.skill || '').trim()
    const reference = String(m.reference || '').trim()
    const content = String(m.content || '')
    if (!content) continue
    
    if (tool === 'read' || tool === 'readReference' || tool === 'call') {
      const kind = tool === 'read' ? 'skill' : tool === 'readReference' ? 'reference' : 'call'
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${i}`
      const meta = m.meta || {}
      
      let snippet = ''
      if (tool === 'call') {
        // 对于 call 类型，使用脚本名称和结果类型作为 snippet
        const script = String(m.script || 'unknown')
        const resultType = String(meta.type || 'unknown')
        snippet = `${skill} 调用脚本 ${script} (类型: ${resultType})`
      } else {
        // 对于 read/readReference 类型，使用原有的逻辑
        const name = String(meta.name || '').trim()
        const description = String(meta.description || '').trim()
        snippet = `${name}: ${description}`
      }
      
      memories.push({
        id,
        kind,
        skill,
        reference,
        content,
        snippet,
        meta,
        script: tool === 'call' ? String(m.script || '') : undefined, // 保存脚本信息用于 call 类型
      })
    }
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
      const skillDesc = mem.meta?.skillDescription || ''
      const docMem = createMemoryFromSkillData(
        mem.skill,
        skillDesc,
        mem.content,
        mem.kind,
        mem.reference || undefined,
        mem.meta || {}
      )
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
  return {
    id: mem.id,
    kind: mem.kind || mem.type,
    type: mem.type || mem.kind,
    skill: mem.skill,
    reference: mem.reference,
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
  // 去重：相同 skill + type + reference 时，优先使用文档化记忆
  const merged = []
  const seen = new Map()
  // 先添加文档化记忆
  for (const doc of documentedMemoriesCache) {
    const key = `${doc.skill}::${doc.type}::${doc.reference || ''}`
    if (!seen.has(key)) {
      seen.set(key, doc)
      merged.push(normalizeMemoryForSelection(doc))
    }
  }
  // 再添加运行时记忆（如果不存在或更新）
  for (const rt of runtime) {
    const key = `${rt.skill}::${rt.kind}::${rt.reference || ''}`
    if (!seen.has(key)) {
      merged.push(normalizeMemoryForSelection(rt))
    } else {
      // 如果运行时记忆更新，则替换文档化记忆
      const doc = seen.get(key)
      const rtTime = rt.updatedAt || Date.now()
      const docTime = doc.updatedAt || 0
      if (rtTime > docTime) {
        const idx = merged.findIndex((m) => m.id === doc.id)
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
  const items = memories.map((m) => ({
    id: m.id,
    skill: m.skill,
    reference: m.reference,
    snippet: m.snippet,
  }))
  const payload = JSON.stringify(
    {
      userQuestions: questionContext,
      memories: items,
      instructions:
        'From the memories list, pick only entries that are clearly helpful to answer the userQuestions (which may include recent conversation context). Prefer high semantic relevance. Return ONLY a JSON array of selected ids, like ["0","2"]. If nothing is relevant, return an empty array []. Do not include any other text.',
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
      return full.map((x) => String(x))
    }
  } catch {}
  // 回退：尝试从文本中提取第一个 JSON 数组片段
  const match = txt.match(/\[[\s\S]*\]/)
  if (match) {
    try {
      const arr = JSON.parse(match[0])
      if (Array.isArray(arr)) {
        return arr.map((x) => String(x))
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
    const ids = parseSelectedIds(raw)
    const picked = base.filter((m) => ids.includes(m.id))
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
    const kind = m.kind || ''
    
    let header = ''
    if (kind === 'call') {
      // call 类型的特殊处理
      header = `已执行技能「${skill || '未知技能'}」的脚本「${script || '未知脚本'}」，结果是：`
    } else if (ref) {
      // readReference 类型
      header = `已加载技能「${skill || '未知技能'}」的参考文件「${ref}」，内容是：`
    } else {
      // read 类型（默认）
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
    id: m.id,
    kind: m.kind,
    skill: m.skill,
    reference: m.reference,
    snippet: m.snippet,
    timestamp: now,
  }))
}

