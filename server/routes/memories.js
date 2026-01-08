// 记忆管理路由：创建、更新、废弃文档化记忆
import { Router } from 'express'
import { z } from 'zod'
import { saveMemory, updateMemory, deprecateMemory, loadDocumentedMemories, createMemoryFromSkillData } from '../services/memoryFileService.js'
import { loadSkill, loadReference } from '../services/skillsService.js'

const router = Router()

const CreateMemorySchema = z.object({
  skill: z.string().min(1),
  skillDescription: z.string().optional(),
  content: z.string().min(1),
  type: z.enum(['skill', 'reference']).default('skill'),
  reference: z.string().optional(),
  meta: z.record(z.any()).optional(),
})

const UpdateMemorySchema = z.object({
  id: z.string().min(1),
  updates: z.record(z.any()).optional(),
})

router.get('/list', async (req, res) => {
  try {
    const memories = loadDocumentedMemories()
    res.json({ memories })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

router.post('/create', async (req, res) => {
  const parsed = CreateMemorySchema.safeParse(req.body || {})
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid payload', details: parsed.error })
  }
  const { skill, skillDescription, content, type, reference, meta } = parsed.data
  try {
    const memory = createMemoryFromSkillData(skill, skillDescription || '', content, type, reference || undefined, meta || {})
    const result = saveMemory(memory)
    res.json({ success: true, memory: result.memory, file: result.file })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

router.post('/create-from-skill', async (req, res) => {
  const skillName = String(req.body?.skill || '')
  const referenceFile = String(req.body?.reference || '')
  if (!skillName) {
    return res.status(400).json({ error: 'skill name required' })
  }
  try {
    const skill = await loadSkill(skillName)
    const skillDescription = String(skill.meta?.description || '')
    let content, type, reference, meta
    if (referenceFile) {
      const ref = await loadReference(skillName, referenceFile)
      content = ref.content
      type = 'reference'
      reference = ref.file
      meta = ref.meta || {}
    } else {
      content = skill.body
      type = 'skill'
      meta = skill.meta || {}
    }
    const memory = createMemoryFromSkillData(skillName, skillDescription, content, type, reference, meta)
    const result = saveMemory(memory)
    res.json({ success: true, memory: result.memory, file: result.file })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

router.post('/update', async (req, res) => {
  const parsed = UpdateMemorySchema.safeParse(req.body || {})
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid payload', details: parsed.error })
  }
  const { id, updates } = parsed.data
  try {
    const result = updateMemory(id, updates || {})
    if (!result) {
      return res.status(404).json({ error: 'memory not found' })
    }
    res.json({ success: true, memory: result.memory, file: result.file })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

router.post('/deprecate', async (req, res) => {
  const id = String(req.body?.id || '')
  if (!id) {
    return res.status(400).json({ error: 'memory id required' })
  }
  try {
    const result = deprecateMemory(id)
    if (!result) {
      return res.status(404).json({ error: 'memory not found' })
    }
    res.json({ success: true, memory: result.memory })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

export default router
