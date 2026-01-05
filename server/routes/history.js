// 会话历史路由
import { Router } from 'express'
import { z } from 'zod'
import { listSessions, getSessionHistory, appendSessionSegments, clearSession } from '../services/historyService.js'

const router = Router()

router.get('/sessions', (req, res) => {
  res.json({ sessions: listSessions() })
})

router.get('/:sessionId', (req, res) => {
  const sessionId = String(req.params.sessionId || 'default')
  const history = getSessionHistory(sessionId)
  res.json({ sessionId, history })
})

const AppendSchema = z.object({
  sessionId: z.string().min(1),
  segments: z
    .array(
      z.object({
        role: z.string(),
        content: z.string(),
        toolName: z.string().optional(),
        skill: z.string().optional(),
        reference: z.string().optional(),
      }).passthrough()
    )
    .min(1),
  maxTurns: z.number().int().positive().optional(),
})

router.post('/append', (req, res) => {
  const parsed = AppendSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid payload' })
  const { sessionId, segments, maxTurns } = parsed.data
  const history = appendSessionSegments(sessionId, segments, maxTurns || 12)
  res.json({ sessionId, history })
})

const ClearSchema = z.object({ sessionId: z.string().min(1) })

router.post('/clear', (req, res) => {
  const parsed = ClearSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid payload' })
  clearSession(parsed.data.sessionId)
  res.json({ ok: true })
})

export default router
