// 记忆文件服务：管理文档化记忆的 JSON 文件读写
import fs from 'fs'
import path from 'path'
import { readFileSafe, listDirs } from '../utils/fsUtils.js'
import crypto from 'crypto'

const memoriesDir = path.join(process.cwd(), 'server', 'memories')
const deprecatedDir = path.join(memoriesDir, '.deprecated')

function ensureDir() {
  try {
    fs.mkdirSync(memoriesDir, { recursive: true })
    fs.mkdirSync(deprecatedDir, { recursive: true })
  } catch {}
}

function generateId(content, skill, reference) {
  const str = `${skill}-${reference || ''}-${content}`
  const hash = crypto.createHash('md5').update(str).digest('hex')
  return hash.slice(0, 16)
}

function generateFileName(skill, type, reference, content) {
  const skillKey = String(skill || 'unknown').toLowerCase().replace(/\s+/g, '-')
  const refPart = reference ? path.basename(reference, '.md').replace(/\s+/g, '-') : ''
  const name = refPart ? `${skillKey}-${type}-${refPart}.json` : `${skillKey}-${type}.json`
  return name
}

function validateMemorySchema(mem) {
  if (!mem || typeof mem !== 'object') return false
  const required = ['id', 'type', 'content', 'snippet', 'skill', 'skillDescription', 'createdAt', 'updatedAt']
  for (const field of required) {
    if (!(field in mem)) return false
  }
  if (mem.type !== 'skill' && mem.type !== 'reference') return false
  if (mem.type === 'reference' && !mem.reference) return false
  return true
}

function normalizeMemory(mem) {
  const now = Date.now()
  return {
    type: mem.type || 'skill',
    content: mem.content || '',
    snippet: mem.snippet || '',
    skill: mem.skill || '',
    skillDescription: mem.skillDescription || '',
    reference: mem.type === 'reference' ? mem.reference || '' : undefined,
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
  const fileName = generateFileName(
    normalized.skill,
    normalized.type,
    normalized.reference,
    normalized.content
  )
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
      if (String(mem.id) === String(memoryId)) {
        const updated = {
          ...mem,
          ...updates,
          id: mem.id, // 保持 id 不变
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
      if (String(mem.id) === String(memoryId)) {
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
  const { skill, skillDescription, content, type = 'skill', snippet, reference = null, meta = {} } = mem
  const name = String(meta.name || '').trim()
  const description = String(meta.description || '').trim()
  const now = Date.now()
  const memory = {
    type,
    content,
    snippet,
    skill,
    skillDescription,
    reference,
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
