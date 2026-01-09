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
  async function chat(messages, tools = []) {
    if (isFake) {
      const hasInjected = Array.isArray(messages) && messages.some((m) => {
        const s = String(m?.content || '')
        return m?.role === 'assistant' && /已加载技能|读取参考文件/.test(s)
      })
      if (!hasInjected) {
        return '我将使用技能来完善答案。\nCALL_JSONS: [{"provider":"openskills","tool":"read","input":{"skill":"poem_writer"}},{"provider":"openskills","tool":"readReference","input":{"skill":"poem_writer","file":"references/qijue.md"}}]'
      }
      return '基于已加载的技能与参考文件，下面是回答：\n- 诗歌体裁说明与要点已载入\n- 七绝参考文件已读取\n请提供主题与风格，以便生成作品'
    }
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
    if (!r.ok) throw new Error('chat completion failed')
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
      return `CALL_JSONS: ${JSON.stringify(calls)}`
    }
    
    return String(choice?.message?.content || '')
  }
  return {
    chat,
    info: {
      name: providerName,
      model: modelName,
    },
  }
}
