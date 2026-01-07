// 代理推理路由
import { Router } from 'express'
import { z } from 'zod'
import { run as runAgent, runStream as runAgentStream } from '../services/agentService.js'

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

router.get('/stream', async (req, res) => {
  const userInput = String(req.query.q || '')
  const sessionId = String(req.query.sessionId || 'default')
  if (!userInput) return res.status(400).end()
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const send = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    } catch {}
  }
  try {
    await runAgentStream(userInput, sessionId, send)
    send({ type: 'end' })
    res.end()
  } catch (e) {
    send({ type: 'error', error: String(e?.message || e) })
    res.end()
  }
})

router.post('/stream', async (req, res) => {
  const userInput = String(req.body?.userInput || '')
  const sessionId = String(req.body?.sessionId || 'default')
  if (!userInput) return res.status(400).end()
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const send = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    } catch {}
  }
  try {
    await runAgentStream(userInput, sessionId, send)
    send({ type: 'end' })
    res.end()
  } catch (e) {
    send({ type: 'error', error: String(e?.message || e) })
    res.end()
  }
})

export default router
