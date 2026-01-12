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
  const { meta, body } = parseFrontmatter(txt)
  return { file: rel, meta, content: body, rawContent: txt }
}

export async function callSkillScript(skillName, scriptPath, params) {
  const key = String(skillName || '').trim()
  const script = String(scriptPath || '').trim()
  if (!key || !script) throw new Error('skill name and script path required')
  
  // 验证脚本路径安全
  if (!script.startsWith('scripts/')) throw new Error('script path must start with scripts/')
  if (script.includes('..')) throw new Error('invalid script path')
  
  const dir = resolveSkillDir(key)
  if (!dir) throw new Error('skill not found')
  
  // 安全地构建脚本路径
  const fp = safeJoin(dir, script)
  if (!fp) throw new Error('invalid script path')
  
  // 检查文件是否存在
  if (!fs.existsSync(fp)) throw new Error(`script not found: ${script}`)
  
  try {
    // 动态加载并执行脚本函数
    const mod = await import(fp)
    const fn = mod.default || mod.run
    if (typeof fn !== 'function') throw new Error(`script ${script} 没有导出函数`)
    
    // 执行函数并返回结果
    return await fn(params)
  } catch (e) {
    throw new Error(`脚本执行失败: ${e.message}`)
  }
}