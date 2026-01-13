// 记忆文件服务：管理文档化记忆的 JSON 文件读写
import fs from 'fs'
import path from 'path'
import { readFileSafe } from '../utils/fsUtils.js'

const memoriesDir = path.join(process.cwd(), 'server', 'memories')
const deprecatedDir = path.join(memoriesDir, '.deprecated')

function ensureDir() {
  try {
    fs.mkdirSync(memoriesDir, { recursive: true })
    fs.mkdirSync(deprecatedDir, { recursive: true })
  } catch {}
}

function slugify(input, maxLen = 60) {
  const s = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\.js$/g, '')
    .replace(/[\\s/\\\\]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (!s) return 'unknown'
  return s.length > maxLen ? s.slice(0, maxLen) : s
}

function generateFileNameForRead(skill, type, reference) {
  const skillKey = String(skill || 'unknown').toLowerCase().replace(/\s+/g, '-')
  const refPart = reference ? path.basename(reference, '.md').replace(/\s+/g, '-') : ''
  const name = refPart ? `${skillKey}-${type}-${refPart}.json` : `${skillKey}-${type}.json`
  return name
}

function generateFileNameForCall(skill, script, desc) {
  const skillKey = String(skill || 'unknown').toLowerCase().replace(/\s+/g, '-')
  const scriptPart = slugify(path.basename(String(script || 'script')))
  const descPart = slugify(desc || 'no-desc', 80)
  return `${skillKey}-call-${scriptPart}-${descPart}.json`
}

function normalizeToolName(mem) {
  const t = String(mem?.toolName || '').trim()
  if (t) return t
  const type = String(mem?.type || '').trim()
  if (type === 'skill') return 'read'
  if (type === 'reference') return 'readReference'
  if (type === 'call') return 'call'
  return ''
}

function toolNameToType(toolName) {
  if (toolName === 'read') return 'skill'
  if (toolName === 'readReference') return 'reference'
  if (toolName === 'call') return 'call'
  return 'skill'
}

function validateMemorySchema(mem) {
  if (!mem || typeof mem !== 'object') return false
  const toolName = normalizeToolName(mem)
  const type = String(mem.type || toolNameToType(toolName))
  const required = ['content', 'snippet', 'skill', 'createdAt', 'updatedAt']
  for (const field of required) {
    if (!(field in mem)) return false
  }
  if (toolName && toolName !== 'read' && toolName !== 'readReference' && toolName !== 'call') return false
  if (type !== 'skill' && type !== 'reference' && type !== 'call') return false
  if ((toolName === 'readReference' || type === 'reference') && !mem.reference) return false
  return true
}

function normalizeMemory(mem) {
  const now = Date.now()
  const toolName = normalizeToolName(mem) || 'read'
  const type = String(mem.type || toolNameToType(toolName))
  const content = String(mem.content || '')
  const reference =
    toolName === 'readReference' || type === 'reference' ? String(mem.reference || '') : undefined
  const script = toolName === 'call' || type === 'call' ? String(mem.script || '') : undefined
  return {
    toolName,
    type,
    content,
    snippet: String(mem.snippet || ''),
    skill: String(mem.skill || ''),
    skillDescription: String(mem.skillDescription || ''),
    reference,
    script,
    createdAt: Number(mem.createdAt || now),
    updatedAt: Number(mem.updatedAt || now),
    meta: mem.meta && typeof mem.meta === 'object' ? mem.meta : {},
    deprecated: Boolean(mem.deprecated || false),
  }
}

export function loadDocumentedMemories() {
  ensureDir()
  const memories = []
  try {
    const files = fs.readdirSync(memoriesDir)
    for (const file of files) {
      if (!file.endsWith('.json') || file.startsWith('.')) continue
      const filePath = path.join(memoriesDir, file)
      try {
        const txt = readFileSafe(filePath)
        if (!txt) continue
        const mem = JSON.parse(txt)
        if (validateMemorySchema(mem) && !mem.deprecated) {
          memories.push(normalizeMemory(mem))
        }
      } catch {
        // 跳过无效的 JSON 文件
      }
    }
  } catch {}
  return memories
}

export function saveMemory(memory) {
  ensureDir()
  const normalized = normalizeMemory(memory)
  if (!normalized.skill || !normalized.content) {
    throw new Error('skill and content are required')
  }
  let fileName = ''
  if (normalized.toolName === 'call') {
    const desc = String(normalized.meta?.desc || '').trim()
    fileName = generateFileNameForCall(normalized.skill, normalized.script, desc || normalized.snippet)
  } else {
    fileName = generateFileNameForRead(normalized.skill, normalized.type, normalized.reference)
  }
  const filePath = path.join(memoriesDir, fileName)
  const data = JSON.stringify(normalized, null, 2)
  fs.writeFileSync(filePath, data, 'utf8')
  return { file: fileName, path: filePath, memory: normalized }
}

export function updateMemory(memoryId, updates) {
  ensureDir()
  const files = fs.readdirSync(memoriesDir)
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const filePath = path.join(memoriesDir, file)
    try {
      const txt = readFileSafe(filePath)
      if (!txt) continue
      const mem = JSON.parse(txt)
      if (String(file) === String(memoryId) || String(mem.id || '') === String(memoryId)) {
        const updated = {
          ...mem,
          ...updates,
          updatedAt: Date.now(),
        }
        const normalized = normalizeMemory(updated)
        const data = JSON.stringify(normalized, null, 2)
        fs.writeFileSync(filePath, data, 'utf8')
        return { file, path: filePath, memory: normalized }
      }
    } catch {}
  }
  return null
}

export function deprecateMemory(memoryId) {
  ensureDir()
  const files = fs.readdirSync(memoriesDir)
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const filePath = path.join(memoriesDir, file)
    try {
      const txt = readFileSafe(filePath)
      if (!txt) continue
      const mem = JSON.parse(txt)
      if (String(file) === String(memoryId) || String(mem.id || '') === String(memoryId)) {
        // 方法1: 添加 deprecated 标记
        const updated = {
          ...mem,
          deprecated: true,
          updatedAt: Date.now(),
        }
        const data = JSON.stringify(updated, null, 2)
        fs.writeFileSync(filePath, data, 'utf8')
        // 方法2: 移动到废弃目录（可选，这里只使用方法1）
        return { file, path: filePath, memory: updated }
      }
    } catch {}
  }
  return null
}

export function createMemoryFromSkillData(mem) {
  const toolName = normalizeToolName(mem) || 'read'
  const type = toolNameToType(toolName)
  const skill = String(mem?.skill || '').trim()
  const content = String(mem?.content || '')
  const meta = mem?.meta && typeof mem.meta === 'object' ? mem.meta : {}
  const name = String(meta.name || '').trim()
  const description = String(meta.description || '').trim()
  const snippet = String(mem?.snippet || '').trim() || content.slice(0, 120)
  const script = toolName === 'call' ? String(mem?.script || '') : ''
  const skillDescription = String(mem?.skillDescription || meta.skillDescription || '').trim()
  const now = Date.now()
  const memory = {
    toolName,
    type,
    content,
    snippet,
    skill,
    skillDescription,
    reference: toolName === 'readReference' ? String(mem?.reference || '') : undefined,
    script,
    createdAt: now,
    updatedAt: now,
    meta: {
      name,
      description,
      ...meta,
    },
    deprecated: false,
  }
  return normalizeMemory(memory)
}
