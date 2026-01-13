// 推理服务：读取系统提示、执行推理循环、解析并执行工具调用
import { readLLMConfig } from '../utils/config.js'
import { createProvider } from './providerService.js'
import { parseToolCalls } from './toolParseService.js'
import { invoke as invokeTool } from './toolInvokeService.js'
import { readAgentsPrompt } from './promptService.js'
import { selectSkillMemoriesForQuestion, buildMemoryMessages, buildMemoryEventPayload, appendSkillMemories } from './memoryService.js'
import { getSessionHistory, appendSessionSegments } from './historyService.js'

import { initMcpClients, getMcpTools, callMcpTool } from './mcpService.js'

async function createChatReply(provider, messages, tools) {
  const content = await provider.chat(messages, tools)
  return { choices: [{ message: { content } }] }
}

export async function runStream(userInput, sessionId = 'default', emit, selection) {
  const cfg = readLLMConfig()
  
  // 初始化 MCP (按需连接，仅首次)
  await initMcpClients()
  // 获取 MCP 工具
  const mcpTools = await getMcpTools()
  
  const provider = createProvider(cfg, selection)
  const systemPrompt = readAgentsPrompt()
  // 获取最近 10 条 user 消息作为上下文
  const historyRaw = getSessionHistory(sessionId)
  const recentUserInputs = (Array.isArray(historyRaw) ? historyRaw : [])
    .filter((m) => m && m.role === 'user')
    .slice(-10)
    .map((m) => String(m.content || '').trim())
    .filter(Boolean)
  // 添加当前输入
  recentUserInputs.push(String(userInput || '').trim())
  const { selected: selectedMemories } = await selectSkillMemoriesForQuestion(provider, recentUserInputs)
  const memoryMessages = buildMemoryMessages(selectedMemories)
  const memoryEvents = buildMemoryEventPayload(selectedMemories)
  const messages = [
    { role: 'system', content: systemPrompt },
    ...historyRaw,
    ...memoryMessages,
    { role: 'user', content: userInput },
  ]
  let step = 1
  let didFinalCheck = false
  if (memoryEvents.length > 0 && typeof emit === 'function') {
    emit({ type: 'memory_used', memories: memoryEvents })
  }
  while (true) {

    const completion = await createChatReply(provider, messages, mcpTools)
    const reply = String(completion?.choices?.[0]?.message?.content || '')
    const usage = typeof provider?.getLastUsage === 'function' ? provider.getLastUsage() : null
    if (usage && typeof emit === 'function') {
      emit({ type: 'llm_usage', usage, step, timestamp: Date.now() })
    }
    const calls = parseToolCalls(reply) || []
    if (calls.length > 0) {
      didFinalCheck = false
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
          let toolResult = null
          // 分发工具调用：MCP vs OpenSkills
          if (c.provider === 'mcp') {
            // MCP 工具
            toolResult = await callMcpTool(c.tool, c.input)
            // 简单处理结果，这里假设 result 是对象或文本
            // 如果是对象，可能包含 content 数组等，根据需要序列化
            // 这里为了简化，直接 JSON.stringify
            // 注意：Agent 期望看到的是字符串结果以便思考
            if (typeof toolResult !== 'string') {
                toolResult = JSON.stringify(toolResult)
            }
          } else {
            // 内部 OpenSkills
            const inv = await invokeTool(c.provider, c.tool, c.input)
            toolResult = inv?.result ?? inv
          }
          
          emit({ type: 'tool_update', id, status: 'completed', result: toolResult, completedAt: Date.now(), durationMs: Date.now() - t0 })
          
          if (c.provider === 'mcp') {
            // MCP 结果直接作为 tool 结果回填
            openMsgs.push({ role: 'tool', toolName: c.tool, content: String(toolResult) })
          } else if (c.tool === 'openskills.read') {
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
          } else if (c.tool === 'openskills.call') {
            // 处理脚本函数调用结果
            const skill = String(c.input?.skill || '')
            const script = String(c.input?.script || '')
            const result = toolResult
            if (result) {
              openMsgs.push({ 
                role: 'openSkill', 
                toolName: 'call', 
                skill, 
                script,
                content: result,
                meta: { type: typeof result }
              })
            }
          }
        } catch (e) {
          const errorMsg = String(e?.message || e)
          emit({ type: 'tool_update', id, status: 'failed', error: errorMsg, completedAt: Date.now(), durationMs: Date.now() - t0 })
          // 将错误信息添加到 openMsgs 中，让 AI 能够知道工具调用失败的原因
          if (c.provider === 'openskills') {
            openMsgs.push({ 
              role: 'openSkill', 
              toolName: c.tool, 
              skill: String(c.input?.skill || ''), 
              content: `工具调用失败: ${errorMsg}`,
              meta: { status: 'failed', error: errorMsg }
            })
          } else if (c.provider === 'mcp') {
            openMsgs.push({ 
              role: 'tool', 
              toolName: c.tool, 
              content: `工具调用失败: ${errorMsg}`
            })
          }
        }
      }
      const { added } = appendSkillMemories(openMsgs)
      const loopMemoryMessages = buildMemoryMessages(added)
      // 对于 MCP 工具结果，我们也作为普通消息追加，但这里需要区分
      // openMsgs 包含了 openSkill 类型的，也包含了我们新加的 tool 类型的
      // appendSkillMemories 目前只处理 openSkill
      // 我们需要手动把 tool 类型的消息加进去，或者改造 appendSkillMemories
      // 这里为了最小改动，直接把 tool 类型的消息追加到 messages
      for (const m of openMsgs) {
        if (m.role === 'tool') {
            messages.push({ role: 'user', content: `Tool ${m.toolName} output: ${m.content}` })
        }
      }
      
      for (const mm of loopMemoryMessages) messages.push(mm)
      step++
      continue
    }

    if (!didFinalCheck) {
      didFinalCheck = true
      messages.push({ role: 'assistant', content: reply })
      messages.push({
        role: 'user',
        content:
          '请做一次“完成性复核”：\n' +
          '- 如果你认为还需要调用工具才能把用户任务做完，请直接输出 CALL_JSONS: [...]（不要输出其它文字）。\n' +
          '- 如果你认为任务已经完成、不需要任何工具调用，请输出 FINAL: <你的最终详细答复，包含所有细节>。\n' +
          '注意：这一步是为了避免遗漏必要的工具调用。',
      })
      continue
    }

    const finalReply = String(reply || '').replace(/^FINAL:\s*/i, '').trim()
    const maxTurns = Number(cfg?.historyMaxTurns) || 12
    appendSessionSegments(sessionId, [{ role: 'user', content: userInput }, { role: 'assistant', content: finalReply }], maxTurns)
    emit({ type: 'done', reply: finalReply, step })
    return
  }
}
