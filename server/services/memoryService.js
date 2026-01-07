// 记忆服务：基于技能内容与参考文件构建“记忆”，并在决策前检索相关记忆

const memoryStore = new Map()

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
    if (tool === 'read' || tool === 'readReference') {
      const kind = tool === 'read' ? 'skill' : 'reference'
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${i}`
      const meta = m.meta || {}
      const name = String(meta.name || '').trim()
      const description = String(meta.description || '').trim()
      // 使用 meta.name 和 meta.description 作为 snippet，如果没有则回退到 content 截断
      let snippet = `${name}: ${description}`
      memories.push({
        id,
        kind,
        skill,
        reference,
        content,
        snippet,
        meta,
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
  const next = [...prev, ...added]
  const trimmed =
    next.length > maxPerSession ? next.slice(next.length - maxPerSession) : next
  memoryStore.set(id, trimmed)
  return { all: trimmed, added }
}

export function getSkillMemories(sessionId) {
  const id = String(sessionId || 'default')
  return memoryStore.get(id) || []
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
    const header = ref
      ? `已加载技能「${skill || '未知技能'}」的参考文件「${ref}，内容是：`
      : `已加载技能「${skill || '未知技能'}」的正文，内容是：`
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

