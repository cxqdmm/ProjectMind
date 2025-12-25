export function createProvider(config) {
    
  const qwen = config?.qwen || {}
  const baseURL = qwen.baseURL || qwen.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  const model = qwen.model || 'qwen-plus'
  async function chat(messages, apiKey) {
    const url = String(baseURL).replace(/\/$/, '') + '/chat/completions'
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    const body = { model, messages }
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!r.ok) throw new Error('chat completion failed')
    const data = await r.json()
    return String(data?.choices?.[0]?.message?.content || '')
  }
  return { chat, info: { baseURL, model, name: 'qwen' } }
}
