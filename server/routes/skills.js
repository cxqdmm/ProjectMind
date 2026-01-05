// 技能 API 路由
import { Router } from 'express'
import { scanSkills, loadSkill, loadReference } from '../services/skillsService.js'

const router = Router()

router.get('/manifest', (req, res) => {
  try {
    const skills = scanSkills()
    res.json({ skills })
  } catch {
    res.json({ skills: [] })
  }
})

router.get('/load', (req, res) => {
  const skill = String(req.query.skill || '').trim()
  if (!skill) return res.status(400).json({ error: 'skill required' })
  try {
    const s = loadSkill(skill)
    res.json(s)
  } catch (e) {
    res.status(404).json({ error: String(e?.message || e) })
  }
})

router.get('/reference', (req, res) => {
  const skill = String(req.query.skill || '').trim()
  let files = []
  const file = req.query.file
  const arr = req.query.files
  if (typeof file === 'string' && file) files = [file]
  else if (Array.isArray(arr)) files = arr
  if (!skill || !files.length) return res.status(400).json({ error: 'skill and file required' })
  try {
    const extras = []
    for (const f of files) {
      try {
        const ex = loadReference(skill, String(f))
        extras.push(ex)
      } catch {}
    }
    res.json({ key: skill, extras })
  } catch (e) {
    res.status(404).json({ error: String(e?.message || e) })
  }
})

export default router

