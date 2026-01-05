// 推理服务：读取系统提示、执行推理循环、解析并执行工具调用
import { readLLMConfig } from '../utils/config.js'
import { createProvider } from './providerService.js'
import { parseToolCalls } from './toolParseService.js'
import { invoke as invokeTool } from './toolInvokeService.js'
import { readAgentsPrompt } from './promptService.js'
import { getSessionHistory, appendSessionSegments } from './historyService.js'

function toAssistantFromOpenSkill(m) {
  if (m && m.role === 'openSkill') {
    const skill = String(m.skill || '')
    const ref = String(m.reference || '')
    const tool = String(m.toolName || '')
    const action =
      tool === 'read'
        ? (skill ? `已加载技能「${skill}」正文` : '已加载技能正文')
        : (tool === 'readReference'
            ? (skill ? `已读取技能「${skill}」参考文件「${ref}」` : `已读取参考文件「${ref}」`)
            : '')
    const prefix = action
    return { role: 'assistant', content: `${prefix}\n${String(m.content || '')}` }
  }
  return { role: String(m.role || 'assistant'), content: String(m.content || '') }
}
async function createChatReply(provider, messages) {
  const content = await provider.chat(messages)
  return { choices: [{ message: { content } }] }
}

export async function run(userInput, sessionId = 'default') {
  const cfg = readLLMConfig()
  const provider = createProvider(cfg)
  const systemPrompt = readAgentsPrompt()
  const historyRaw = getSessionHistory(sessionId)
  const history = historyRaw.map((m) => toAssistantFromOpenSkill(m))
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userInput },
  ]
  let reply = ''
  let toolCalls = 0
  let step = 1
  while (true) {
    const completion = await createChatReply(provider, messages)
    reply = String(completion?.choices?.[0]?.message?.content || '')
    const calls = parseToolCalls(reply) || []
    if (calls.length > 0) {
      const results = await Promise.all(
        calls.map(async (c) => {
          try {
            const inv = await invokeTool(c.provider, c.tool, c.input)
            const toolResult = inv?.result ?? inv
            return { ...c, ok: true, result: toolResult }
          } catch (e) {
            const errPayload = { code: 'TOOL_ERROR', message: String(e?.message || e) }
            return { ...c, ok: false, error: errPayload.message }
          }
        })
      )
      const openMsgs = []
      for (const r of results) {
        if (r.ok && r.tool.startsWith('openskills.read')) {
          const skill = String(r.result?.key || '')
          const body = String(r.result?.body || '')
          if (body) openMsgs.push({ role: 'openSkill', toolName: 'read', skill, content: body })
        } else if (r.ok && r.tool.startsWith('openskills.readReference')) {
          const skill = String(r.input?.skill || r.result?.key || '')
          const extras = Array.isArray(r.result?.extras) ? r.result.extras : []
          for (const ex of extras) {
            const name = String(ex?.file || '')
            const content = String(ex?.content || '')
            if (content) openMsgs.push({ role: 'openSkill', toolName: 'readReference', skill, reference: name, content })
          }
        } else if (!r.ok) {
          openMsgs.push({ role: 'openSkill', toolName: String(r.toolName || ''), skill: '', content: `TOOL_ERROR(${r.provider}.${r.toolName}): ${String(r.error)}` })
        }
      }
      messages.push({ role: 'assistant', content: reply })
      for (const m of openMsgs) messages.push(toAssistantFromOpenSkill(m))
      const maxTurns = Number(cfg?.historyMaxTurns) || 12
      const histSegments = [{ role: 'assistant', content: reply }, ...openMsgs]
      appendSessionSegments(sessionId, histSegments, maxTurns)
      toolCalls += calls.length
      step++
      continue
    }
    messages.push({ role: 'assistant', content: reply })
    const maxTurns = Number(cfg?.historyMaxTurns) || 12
    appendSessionSegments(sessionId, [{ role: 'user', content: userInput }, { role: 'assistant', content: reply }], maxTurns)
    return { reply, toolCalls, steps: step }
  }
}
