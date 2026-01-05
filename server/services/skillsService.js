// 技能服务：目录解析、SKILL.md 与引用文件读取，CLI 优先
import path from 'path'
import { spawnSync } from 'child_process'
import fs from 'fs'
import { listDirs, readFileSafe, parseFrontmatter, safeJoin } from '../utils/fsUtils.js'

function sanitizeKey(name) {
  const s = String(name || '').trim()
  if (!s) return ''
  return s.toLowerCase().replace(/\s+/g, '-')
}

export function resolveSkillDir(key) {
  const root = process.cwd()
  const k = sanitizeKey(key)
  const serverLocal = path.join(root, 'server', 'skills', k)
  const agent = path.join(root, '.agent', 'skills', k)
  const claude = path.join(root, '.claude', 'skills', k)
  const local = path.join(root, 'frontend', 'src', 'skills', k)
  if (serverLocal && readFileSafe(path.join(serverLocal, 'SKILL.md')) != null) return serverLocal
  if (agent && readFileSafe(path.join(agent, 'SKILL.md')) != null) return agent
  if (claude && readFileSafe(path.join(claude, 'SKILL.md')) != null) return claude
  if (local && readFileSafe(path.join(local, 'SKILL.md')) != null) return local
  return null
}

export function scanSkills() {
  const root = process.cwd()
  const dirs = []
  const s = path.join(root, 'server', 'skills')
  const a = path.join(root, '.agent', 'skills')
  const c = path.join(root, '.claude', 'skills')
  const l = path.join(root, 'frontend', 'src', 'skills')
  if (fs.existsSync(s)) dirs.push(...listDirs(s).map((n) => path.join(s, n)))
  if (fs.existsSync(a)) dirs.push(...listDirs(a).map((n) => path.join(a, n)))
  if (fs.existsSync(c)) dirs.push(...listDirs(c).map((n) => path.join(c, n)))
  if (fs.existsSync(l)) dirs.push(...listDirs(l).map((n) => path.join(l, n)))
  const seen = new Map()
  for (const d of dirs) {
    const md = readFileSafe(path.join(d, 'SKILL.md'))
    if (!md) continue
    const { meta } = parseFrontmatter(md)
    const key = path.basename(d)
    const name = meta.name || key
    const description = String(meta.description || '')
    if (!seen.has(key)) seen.set(key, { key, name, description })
  }
  return Array.from(seen.values())
}

function tryOpenSkillsRead(name) {
  try {
    const r = spawnSync('openskills', ['read', String(name || '')], { encoding: 'utf8' })
    if (r && r.status === 0 && typeof r.stdout === 'string' && r.stdout.trim()) {
      return r.stdout
    }
  } catch {}
  return null
}

export function loadSkill(name) {
  const key = String(name || '').trim()
  if (!key) throw new Error('skill name required')
  const cliOut = tryOpenSkillsRead(key)
  if (cliOut && cliOut.trim().startsWith('---')) {
    const { meta, body } = parseFrontmatter(cliOut)
    return { key: sanitizeKey(key), meta, body }
  }
  const dir = resolveSkillDir(key)
  if (!dir) throw new Error('skill not found')
  const md = readFileSafe(path.join(dir, 'SKILL.md'))
  if (!md) throw new Error('SKILL.md not found')
  const { meta, body } = parseFrontmatter(md)
  return { key: sanitizeKey(key), meta, body }
}

export function loadReference(name, file) {
  const key = String(name || '').trim()
  const raw = String(file || '').trim()
  if (!key || !raw) throw new Error('skill key and file required')
  let rel = raw
  if (!(rel.startsWith('references/') || rel.startsWith('reference/'))) rel = `references/${rel}`
  const dir = resolveSkillDir(key)
  if (!dir) throw new Error('skill not found')
  const fp = safeJoin(dir, rel)
  if (!fp) throw new Error('invalid path')
  const txt = readFileSafe(fp)
  if (txt == null) throw new Error('reference not found')
  return { file: rel, content: txt }
}
