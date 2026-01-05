// LLM 提供商封装（Qwen）
import { getLLMApiKey } from '../utils/config.js'

export function createProvider(config) {
  const qwen = config?.qwen || {}
  const baseURL = qwen.baseURL || qwen.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  const model = qwen.model || 'qwen-plus'
  const apiKey = getLLMApiKey()
  async function chat(messages) {
    if (process.env.FAKE_LLM) {
      const hasInjected = Array.isArray(messages) && messages.some((m) => {
        const s = String(m?.content || '')
        return m?.role === 'assistant' && /已加载技能|读取参考文件/.test(s)
      })
      if (!hasInjected) {
        return '我将使用技能来完善答案。\nCALL_JSONS: [{"provider":"openskills","tool":"read","input":{"skill":"poem_writer"}},{"provider":"openskills","tool":"readReference","input":{"skill":"poem_writer","file":"references/qijue.md"}}]'
      }
      return '基于已加载的技能与参考文件，下面是回答：\n- 诗歌体裁说明与要点已载入\n- 七绝参考文件已读取\n请提供主题与风格，以便生成作品'
    }
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
