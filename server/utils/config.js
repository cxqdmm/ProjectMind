import 'dotenv/config'

export function getPort() {
  const raw = process.env.PORT
  const n = raw ? Number(raw) : 3334
  return Number.isFinite(n) && n > 0 ? n : 3334
}

export function readLLMConfig() {
  return {
    models: [
      {
        key: 'qwen',
        label: 'Qwen',
        provider: 'qwen',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: 'qwen-plus',
        envKey: 'QWEN_API_KEY',
      },
      {
        key: 'zhipuai',
        label: 'ZhipuAI',
        provider: 'zhipuai',
        baseURL: 'https://open.bigmodel.cn/api/paas/v4/',
        model: 'glm-4.7',
        envKey: 'ZHIPUAI_API_KEY',
      },
    ],
    historyMaxTurns: 100,
  }
}

export function getModelApiKey(modelKey) {
  const cfg = readLLMConfig()
  const key = String(modelKey || '').toLowerCase()
  const item = (Array.isArray(cfg?.models) ? cfg.models : []).find((m) => String(m?.key || '').toLowerCase() === key)
  const v = process.env[item.envKey]
  return v
}
