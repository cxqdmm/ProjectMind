// 记忆服务：基于技能内容与参考文件构建“记忆”，并在决策前检索相关记忆

import { loadDocumentedMemories, createMemoryFromSkillData, saveMemory } from './memoryFileService.js'

const memoryStore = []
const taskResultStore = []
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

export function appendSkillMemories(messages, maxPerSession = 200) {
  const prev = memoryStore
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
  memoryStore.length = 0
  memoryStore.push(...trimmed)
  return { all: trimmed, added }
}

export function appendTaskResultMemory(task, result, meta = {}) {
  const now = Date.now()
  const title = String(task?.title || '').trim() || `子任务 ${Number(task?.index) + 1 || ''}`.trim()
  const content = String(result || '')
  const snippet = content.split('\n').find((l) => String(l || '').trim())?.trim() || content.slice(0, 120)
  taskResultStore.push({
    kind: 'task_result',
    index: Number.isFinite(Number(task?.index)) ? Number(task.index) : taskResultStore.length,
    title,
    snippet: snippet.slice(0, 180),
    content,
    meta: meta && typeof meta === 'object' ? meta : {},
    createdAt: now,
    updatedAt: now,
  })
  if (taskResultStore.length > 200) {
    taskResultStore.splice(0, taskResultStore.length - 200)
  }
  return taskResultStore[taskResultStore.length - 1]
}

export function getTaskResultMemories() {
  return taskResultStore.slice()
}

function buildTaskSelectorMessages(userInputs, tasks) {
  const inputs = Array.isArray(userInputs) ? userInputs : [String(userInputs || '')]
  const questionContext = inputs
    .map((inp, idx) => {
      const text = String(inp || '').trim()
      if (!text) return ''
      return inputs.length > 1 ? `[${idx + 1}] ${text}` : text
    })
    .filter(Boolean)
    .join('\n')
  const items = (Array.isArray(tasks) ? tasks : []).map((t, idx) => ({
    idx,
    index: t.index,
    title: t.title,
    snippet: t.snippet,
  }))
  const payload = JSON.stringify(
    {
      userQuestions: questionContext,
      taskResults: items,
      instructions:
        '请从 taskResults 列表中挑选对完成当前 userQuestions 明显有帮助的条目（可结合最近对话上下文）。' +
        '只返回被选中的 idx 数组（JSON 数组），例如 [0,2]；如果没有相关内容，返回空数组 []；不要输出任何其它文本。',
    },
    null,
    2
  )
  const system =
    '你是一个“任务结果记忆选择器”。你的任务是根据当前问题，从给定 taskResults 列表中选择有用条目。' +
    '你必须只输出一个 JSON 数组（idx 数组），除此之外不要输出任何内容。'
  const user = '下面是选择任务输入：\n\n' + payload + '\n\n请只返回 JSON 数组（idx 数组），不要解释。'
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

export async function selectTaskResultMemoriesForQuestion(provider, userInputs, limit = 2) {
  const all = getTaskResultMemories()
  if (all.length === 0) return { selected: [], all }
  const base = all.slice(-Math.max(1, limit * 4))
  if (!provider || typeof provider.chat !== 'function') {
    return { selected: base.slice(-limit), all }
  }
  try {
    const messages = buildTaskSelectorMessages(userInputs, base)
    const raw = await provider.chat(messages)
    const idxs = parseSelectedIds(raw)
    const picked = base.filter((_, idx) => idxs.includes(idx))
    return { selected: picked.slice(0, limit), all }
  } catch {
    return { selected: base.slice(-limit), all }
  }
}

export function buildTaskResultMessages(selected) {
  const arr = Array.isArray(selected) ? selected : []
  return arr.map((t) => {
    const title = String(t?.title || '').trim() || '子任务结果'
    const snippet = String(t?.snippet || '').trim()
    const header = `已捞取到已完成子任务「${title}」的结果记忆缓存${snippet ? `；概述：${snippet}` : ''}。缓存内容如下：`
    return { role: 'assistant', content: [header, '', String(t?.content || '')].join('\n') }
  })
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

export function getSkillMemories() {
  const runtime = memoryStore
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
        '请从 memories 列表中挑选对回答 userQuestions 明显有帮助的条目（可结合最近对话上下文）。优先选择语义相关性高的条目。' +
        '只返回被选中的 idx 数组（JSON 数组），例如 [0,2]；如果没有相关内容，返回空数组 []；不要输出任何其它文本。' +
        '补充规则：如果你选择了某个 skill 的记忆条目，且该条目的 toolName 不是 read（例如 readReference/call），那么如果列表中存在同 skill 且 toolName 为 read 的条目，请一并选中，用于加载该技能的 skill 相关记忆内容。',
    },
    null,
    2
  )
  const system =
    '你是一个“记忆选择器”。你的任务是根据最近用户问题与对话上下文，从给定 memories 列表中选择有用条目。' +
    '你必须只输出一个 JSON 数组（idx 数组），除此之外不要输出任何内容。'
  const user =
    '下面是选择任务输入：\n\n' +
    payload +
    '\n\n请只返回 JSON 数组（idx 数组），不要解释。'
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

export async function selectSkillMemoriesForQuestion(provider, userInputs, limit = 5) {
  const all = getSkillMemories()
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
      header = `已捞取到技能「${skill || '未知技能'}」的脚本调用记忆缓存，脚本「${script || '未知脚本'}」${desc ? `；概述：${desc}` : ''}。缓存内容如下：`
    } else if (toolName === 'readReference') {
      header = `已捞取到技能「${skill || '未知技能'}」的参考文件记忆缓存「${ref || '未知文件'}」。缓存内容如下：`
    } else {
      header = `已捞取到技能「${skill || '未知技能'}」的技能描述记忆缓存。缓存内容如下：`
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
