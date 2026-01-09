import { Router } from 'express'
import { readLLMConfig, getModelApiKey } from '../utils/config.js'

const router = Router()

router.get('/', (req, res) => {
  const cfg = readLLMConfig() || {}
  const ms = Array.isArray(cfg.models) ? cfg.models : []
  const list = ms.map((m) => {
    const base = String(m.baseURL || m.baseUrl || '').replace(/\/$/, '')
    const enabled = Boolean(getModelApiKey(m.key) || process.env.FAKE_LLM)
    return {
      id: `${m.key}:${m.model}`,
      label: `${m.label}·${m.model}`,
      provider: m.provider,
      model: m.model,
      baseURL: base,
      enabled,
    }
  })
  res.json({ models: list })
})

export default router
