import fs from 'fs'
import path from 'path'

const root = process.cwd()
const skillsDir = path.join(root, 'frontend', 'src', 'skills')

function readJSON(p) {
  try {
    const s = fs.readFileSync(p, 'utf-8')
    return JSON.parse(s)
  } catch {
    return null
  }
}

function lintSkill(key) {
  const dir = path.join(skillsDir, key)
  const mdPath = path.join(dir, 'SKILL.md')
  const hasMd = fs.existsSync(mdPath)
  const scriptsOk = fs.existsSync(path.join(dir, 'scripts'))
  const refsOk = fs.existsSync(path.join(dir, 'references'))
  return { key, hasMd, scriptsOk, refsOk }
}

function main() {
  if (!fs.existsSync(skillsDir)) {
    console.error('skills dir not found:', skillsDir)
    process.exit(1)
  }
  const manifestPath = path.join(skillsDir, 'manifest.json')
  const m = readJSON(manifestPath)
  if (!m || !Array.isArray(m.skills)) {
    console.error('invalid skills manifest:', manifestPath)
    process.exit(1)
  }
  const results = m.skills.map(s => lintSkill(String(s.key)))
  const bad = results.filter(r => !r.hasMd)
  console.log('Skills lint results:')
  for (const r of results) {
    console.log(`- ${r.key}: md=${r.hasMd ? 'ok' : 'missing'} scripts=${r.scriptsOk ? 'ok' : 'missing'} refs=${r.refsOk ? 'ok' : 'missing'}`)
  }
  if (bad.length > 0) {
    process.exit(2)
  }
}

main()
