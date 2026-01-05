// 代理推理路由
import { Router } from 'express'
import { z } from 'zod'
import { run as runAgent } from '../services/agentService.js'

const router = Router()

const RunSchema = z.object({
  userInput: z.string().min(1),
  sessionId: z.string().optional(),
})

router.post('/run', async (req, res) => {
  const parsed = RunSchema.safeParse(req.body || {})
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid payload' })
  }
  const { userInput, sessionId } = parsed.data
  try {
    const { reply, toolCalls, steps } = await runAgent(userInput, sessionId || 'default')
    res.json({ reply, toolCalls, steps })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

export default router
