// 推理服务：读取系统提示、执行推理循环、解析并执行工具调用
import { readLLMConfig } from '../utils/config.js'
import { createProvider } from './providerService.js'
import { parseToolCalls } from './toolParseService.js'
import { invoke as invokeTool } from './toolInvokeService.js'
import { readAgentsPrompt } from './promptService.js'
import { selectSkillMemoriesForQuestion, buildMemoryMessages, buildMemoryEventPayload, appendSkillMemories } from './memoryService.js'
import { getSessionHistory, appendSessionSegments } from './historyService.js'

async function createChatReply(provider, messages) {
  const content = await provider.chat(messages)
  return { choices: [{ message: { content } }] }
}

export async function runStream(userInput, sessionId = 'default', emit) {
  const cfg = readLLMConfig()
  const provider = createProvider(cfg)
  const systemPrompt = readAgentsPrompt()
  const { selected: selectedMemories } = await selectSkillMemoriesForQuestion(provider, userInput, sessionId)
  const memoryMessages = buildMemoryMessages(selectedMemories)
  const memoryEvents = buildMemoryEventPayload(selectedMemories)
  const messages = [
    { role: 'system', content: systemPrompt },
    ...memoryMessages,
    { role: 'user', content: userInput },
  ]
  let step = 1
  if (memoryEvents.length > 0 && typeof emit === 'function') {
    emit({ type: 'memory_used', memories: memoryEvents })
  }
  while (true) {

    const completion = await createChatReply(provider, messages)
    const reply = String(completion?.choices?.[0]?.message?.content || '')
    const calls = parseToolCalls(reply) || []
    if (calls.length > 0) {
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const prepared = calls.map((c, i) => ({
        id: `${batchId}_${i + 1}`,
        provider: c.provider,
        tool: c.tool,
        toolName: c.toolName,
        input: c.input,
        status: 'pending',
        startedAt: Date.now(),
      }))
      emit({ type: 'tool_calls', calls: prepared })
      const openMsgs = []
      for (let i = 0; i < calls.length; i++) {
        const c = calls[i]
        const id = prepared[i].id
        const t0 = Date.now()
        try {
          const inv = await invokeTool(c.provider, c.tool, c.input)
          const toolResult = inv?.result ?? inv
          emit({ type: 'tool_update', id, status: 'completed', result: toolResult, completedAt: Date.now(), durationMs: Date.now() - t0 })
          if (c.tool === 'openskills.read') {
            const skill = String(toolResult?.key || '')
            const body = String(toolResult?.body || '')
            const meta = toolResult?.meta || {}
            if (body) openMsgs.push({ role: 'openSkill', toolName: 'read', skill, content: body, meta })
          } else if (c.tool === 'openskills.readReference') {
            const skill = String(c.input?.skill || toolResult?.key || '')
            const extras = Array.isArray(toolResult?.extras) ? toolResult.extras : []
            for (const ex of extras) {
              const name = String(ex?.file || '')
              const content = String(ex?.content || '')
              const meta = ex?.meta || {}
              if (content) openMsgs.push({ role: 'openSkill', toolName: 'readReference', skill, reference: name, content, meta })
            }
          }
        } catch (e) {
          emit({ type: 'tool_update', id, status: 'failed', error: String(e?.message || e), completedAt: Date.now(), durationMs: Date.now() - t0 })
        }
      }
      const { added } = appendSkillMemories(sessionId, openMsgs)
      const loopMemoryMessages = buildMemoryMessages(added)
      for (const mm of loopMemoryMessages) messages.push(mm)
      step++
      continue
    } else {
      const maxTurns = Number(cfg?.historyMaxTurns) || 12
      const histSegments = [{ role: 'assistant', content: reply }]
      appendSessionSegments(sessionId, histSegments, maxTurns)
    }
    const maxTurns = Number(cfg?.historyMaxTurns) || 12
    appendSessionSegments(sessionId, [{ role: 'user', content: userInput }, { role: 'assistant', content: reply }], maxTurns)
    emit({ type: 'done', reply, step })
    return
  }
}
