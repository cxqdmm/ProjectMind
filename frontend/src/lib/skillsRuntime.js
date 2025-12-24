async function importRaw(path) {
  const m = await import(/* @vite-ignore */ path)
  return typeof m === 'string' ? m : (m?.default ?? '')
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
  try {
    const m = await import('../skills/manifest.json')
    return m?.default ?? m
  } catch {
    return { skills: [] }
  }
}

export async function loadSkillByName(name) {
  const key = String(name || '').trim()
  if (!key) throw new Error('skill name required')
  const md = await importRaw(/* @vite-ignore */ `../skills/${key}/SKILL.md?raw`)
  const { meta, body } = parseFrontmatter(md)
  return { key, meta, body }
}

export async function loadSkillMeta(name) {
  const key = String(name || '').trim()
  if (!key) throw new Error('skill name required')
  const md = await importRaw(/* @vite-ignore */ `../skills/${key}/SKILL.md?raw`)
  const { meta } = parseFrontmatter(md)
  return { key, meta }
}

export async function loadAllSkillsMeta() {
  const manifest = await loadSkillsManifest()
  const skills = Array.isArray(manifest?.skills) ? manifest.skills : []
  const metas = []
  for (const s of skills) {
    const key = String(s?.key || '')
    if (!key) continue
    try {
      const m = await loadSkillMeta(key)
      metas.push(m)
    } catch {}
  }
  return metas
}

export async function fetchSkillReference(key, file) {
  const k = String(key || '').trim()
  const raw = String(file || '').trim()
  if (!k || !raw) throw new Error('skill key and file required')
  let f = raw
  if (!(f.startsWith('references/') || f.startsWith('reference/'))) {
    f = `references/${f}`
  }
  const text = await importRaw(/* @vite-ignore */ `../skills/${k}/${f}?raw`)
  return { file: f, content: text }
}
