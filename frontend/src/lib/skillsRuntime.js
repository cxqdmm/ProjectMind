async function fetchText(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`load ${url} failed`)
  return r.text()
}

function parseFrontmatter(md) {
  const s = String(md || '')
  if (!s.startsWith('---')) return { meta: {}, body: s }
  const end = s.indexOf('\n---', 3)
  if (end < 0) return { meta: {}, body: s }
  const head = s.slice(3, end).trim()
  const body = s.slice(end + 4).trim()
  const meta = {}
  for (const line of head.split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i > 0) {
      const k = line.slice(0, i).trim()
      const v = line.slice(i + 1).trim()
      meta[k] = v.replace(/^"|"$/g, '')
    }
  }
  return { meta, body }
}

export async function loadSkillsManifest() {
  const r = await fetch('/skills/manifest.json')
  if (!r.ok) return { skills: [] }
  return r.json()
}

export async function loadSkillByName(name) {
  const key = String(name || '').trim()
  if (!key) throw new Error('skill name required')
  const md = await fetchText(`/skills/${key}/SKILL.md`)
  const { meta, body } = parseFrontmatter(md)
  return { key, meta, body }
}
