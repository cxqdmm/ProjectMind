// 代理推理路由
import { Router } from 'express'
import { runStream as runAgentStream } from '../services/agentService.js'

const router = Router()



router.post('/stream', async (req, res) => {
  const userInput = String(req.body?.userInput || '')
  const sessionId = String(req.body?.sessionId || 'default')
  const provider = req.body?.provider ? String(req.body.provider) : undefined
  const model = req.body?.model ? String(req.body.model) : undefined
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
    await runAgentStream(userInput, sessionId, send, { provider, model })
    send({ type: 'end' })
    res.end()
  } catch (e) {
    send({ type: 'error', error: String(e?.message || e) })
    res.end()
  }
})

export default router
