// 文件与路径工具：读取文件、列目录、解析 frontmatter、路径安全拼接
import fs from 'fs'
import path from 'path'

export function readFileSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

export function listDirs(p) {
  try {
    const names = fs.readdirSync(p)
    return names.filter((n) => {
      const fp = path.join(p, n)
      try {
        return fs.statSync(fp).isDirectory()
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}

export function parseFrontmatter(md) {
  const s = String(md || '')
  const lines = s.split(/\r?\n/)
  if (!lines.length) return { meta: {}, body: s }
  if (lines[0].trim() !== '---') return { meta: {}, body: s }
  let i = 1
  const kv = {}
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '---') break
    const idx = line.indexOf(':')
    if (idx > -1) {
      const k = line.slice(0, idx).trim()
      const v = line.slice(idx + 1).trim()
      if (k) kv[k] = v.replace(/^"|"$/g, '')
    }
    i++
  }
  const body = lines.slice(i + 1).join('\n')
  return { meta: kv, body }
}

export function safeJoin(baseDir, rel) {
  const relPath = String(rel || '').trim()
  const target = path.join(baseDir, relPath)
  const normalizedBase = path.resolve(baseDir)
  const normalizedTarget = path.resolve(target)
  if (!normalizedTarget.startsWith(normalizedBase)) return null
  return normalizedTarget
}

