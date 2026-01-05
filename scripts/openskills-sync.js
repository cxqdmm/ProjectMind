import fs from 'fs'
import path from 'path'

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

function writeFileSafe(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}

function listDirs(p) {
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

function parseFrontmatter(md) {
  const s = String(md || '')
  const lines = s.split(/\r?\n/)
  if (!lines.length) return { meta: {}, body: s }
  if (lines[0].trim() !== '---') return { meta: {}, body: s }
  let i = 1
  const kv = {}
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '---') {
      break
    }
    const idx = line.indexOf(':')
    if (idx > -1) {
      const k = line.slice(0, idx).trim()
      const v = line.slice(idx + 1).trim()
      if (k) kv[k] = v
    }
    i++
  }
  const body = lines.slice(i + 1).join('\n')
  return { meta: kv, body }
}

function sanitizeKey(name) {
  const s = String(name || '').trim()
  if (!s) return ''
  return s.toLowerCase().replace(/\s+/g, '-')
}

function scanSkills(srcDir) {
  const out = []
  const folders = listDirs(srcDir)
  for (const f of folders) {
    const skillDir = path.join(srcDir, f)
    const mdPath = path.join(skillDir, 'SKILL.md')
    const md = readFileSafe(mdPath)
    if (!md) continue
    const { meta } = parseFrontmatter(md)
    const keyRaw = meta.name || f
    const key = sanitizeKey(keyRaw) || f
    const desc = String(meta.description || '')
    out.push({ key, name: meta.name || key, description: desc, folder: skillDir })
  }
  return out
}

function readManifest(p) {
  const txt = readFileSafe(p)
  if (!txt) return { skills: [] }
  try {
    const j = JSON.parse(txt)
    const arr = Array.isArray(j.skills) ? j.skills : []
    return { skills: arr }
  } catch {
    return { skills: [] }
  }
}

function writeManifest(p, skills) {
  const data = { skills }
  const text = JSON.stringify(data, null, 2) + '\n'
  writeFileSafe(p, text)
}

function copyDir(src, dest) {
  try {
    fs.mkdirSync(dest, { recursive: true })
    const entries = fs.readdirSync(src)
    for (const name of entries) {
      const s = path.join(src, name)
      const d = path.join(dest, name)
      const st = fs.statSync(s)
      if (st.isDirectory()) copyDir(s, d)
      else if (st.isFile()) writeFileSafe(d, fs.readFileSync(s))
    }
  } catch {}
}

function sync() {
  const root = process.cwd()
  const srcAgent = path.join(root, '.agent', 'skills')
  const srcClaude = path.join(root, '.claude', 'skills')
  const srcDir = fs.existsSync(srcAgent) ? srcAgent : (fs.existsSync(srcClaude) ? srcClaude : null)
  const destBase = path.join(root, 'frontend', 'src', 'skills')
  if (!srcDir) {
    const manifestPath = path.join(destBase, 'manifest.json')
    const manifest = readManifest(manifestPath)
    writeManifest(manifestPath, manifest.skills)
    return
  }
  const found = scanSkills(srcDir)
  const manifestPath = path.join(destBase, 'manifest.json')
  const manifest = readManifest(manifestPath)
  const map = new Map()
  for (const s of manifest.skills) {
    if (s && s.key) map.set(s.key, { key: s.key, name: s.name || s.key, description: String(s.description || '') })
  }
  for (const s of found) {
    map.set(s.key, { key: s.key, name: s.name || s.key, description: s.description || '' })
    const destSkillDir = path.join(destBase, s.key)
    const srcMd = path.join(s.folder, 'SKILL.md')
    const destMd = path.join(destSkillDir, 'SKILL.md')
    const md = readFileSafe(srcMd)
    if (md) writeFileSafe(destMd, md)
    const srcRef = path.join(s.folder, 'references')
    if (fs.existsSync(srcRef)) {
      const destRef = path.join(destSkillDir, 'references')
      copyDir(srcRef, destRef)
    }
  }
  const skills = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
  writeManifest(manifestPath, skills)
}

sync()
