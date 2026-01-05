import 'dotenv/config'

export function getPort() {
  const raw = process.env.PORT
  const n = raw ? Number(raw) : 3334
  return Number.isFinite(n) && n > 0 ? n : 3334
}

export function readLLMConfig() {
  return {
    qwen: {
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
    },
    historyMaxTurns: 12,
  }
}

export function getLLMApiKey() {
  const envKey =
    process.env.QWEN_API_KEY ||
    process.env.DASHSCOPE_API_KEY ||
    process.env.QWEN_APIKEY ||
    process.env.LLM_API_KEY ||
    ''
  return String(envKey || '')
}
