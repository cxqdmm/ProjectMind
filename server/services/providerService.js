import { readLLMConfig, getModelApiKey } from '../utils/config.js'

export function createProvider(config, selection) {
  const cfg = config || readLLMConfig()
  const models = Array.isArray(cfg?.models) ? cfg.models : []
  const providerName = String(selection?.provider || (models[0]?.key || 'qwen')).toLowerCase()
  const candidates = models.filter(m => String(m?.key || '').toLowerCase() === providerName)
  let item = candidates.find(m => selection?.model ? String(m?.model || '') === String(selection.model) : true) || candidates[0] || models[0]
  const modelName = String(selection?.model || item?.model || '')
  const apiKey = getModelApiKey(item?.key)
  const isFake = Boolean(process.env.FAKE_LLM)
  let lastUsage = null

  function approxTokens(text) {
    const s = String(text || '')
    if (!s) return 0
    return Math.max(1, Math.ceil(s.length / 4))
  }

  function normalizeUsage(data, messages, outputText) {
    const u = data?.usage
    if (u && typeof u === 'object') {
      const promptTokens = Number(u.prompt_tokens ?? u.promptTokens ?? u.input_tokens ?? u.inputTokens)
      const completionTokens = Number(u.completion_tokens ?? u.completionTokens ?? u.output_tokens ?? u.outputTokens)
      const totalTokens = Number(u.total_tokens ?? u.totalTokens)
      return {
        promptTokens: Number.isFinite(promptTokens) ? promptTokens : undefined,
        completionTokens: Number.isFinite(completionTokens) ? completionTokens : undefined,
        totalTokens: Number.isFinite(totalTokens) ? totalTokens : undefined,
        estimated: false,
        raw: u,
      }
    }
    const promptText = Array.isArray(messages) ? messages.map(m => String(m?.content || '')).join('\n') : ''
    const promptTokens = approxTokens(promptText)
    const completionTokens = approxTokens(outputText)
    return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, estimated: true }
  }

  async function chat(messages, tools = []) {
    const baseURL = String(item?.baseURL || item?.baseUrl || '').replace(/\/$/, '')
    const url = baseURL + '/chat/completions'
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    const body = { model: modelName, messages }
    
    // 如果有工具，加入 body
    if (Array.isArray(tools) && tools.length > 0) {
      // 过滤掉内部字段 __mcpServer
      body.tools = tools.map(t => ({
        type: t.type,
        function: t.function
      }))
    }
    
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!r.ok) { 
      throw new Error('chat completion failed')
    }

    const data = await r.json()
    
    // 优先返回 tool_calls
    const choice = data?.choices?.[0]
    const toolCalls = choice?.message?.tool_calls
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      // 转换为内部协议格式 CALL_JSONS
      // 这是一个简单的适配，将 Native Tool Call 转为我们内部的协议格式
      // 以便复用 parseToolCalls 和后续流程
      const calls = toolCalls.map(tc => ({
        provider: 'mcp', // 标记为 MCP 调用
        tool: tc.function.name,
        input: JSON.parse(tc.function.arguments || '{}')
      }))
      const out = `CALL_JSONS: ${JSON.stringify(calls)}`
      lastUsage = normalizeUsage(data, messages, out)
      return out
    }
    
    const out = String(choice?.message?.content || '')
    lastUsage = normalizeUsage(data, messages, out)
    return out
  }
  return {
    chat,
    getLastUsage: () => lastUsage,
    info: {
      name: providerName,
      model: modelName,
    },
  }
}
