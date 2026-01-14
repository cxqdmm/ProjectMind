// 推理服务：读取系统提示、执行推理循环、解析并执行工具调用
import { readLLMConfig } from '../utils/config.js'
import { createProvider } from './providerService.js'
import { parseToolCalls } from './toolParseService.js'
import { invoke as invokeTool } from './toolInvokeService.js'
import { readAgentsPrompt } from './promptService.js'
import { selectSkillMemoriesForQuestion, selectTaskResultMemoriesForQuestion, buildMemoryMessages, buildTaskResultMessages, buildMemoryEventPayload, appendSkillMemories, appendTaskResultMemory } from './memoryService.js'
import { getSessionHistory, appendSessionSegments } from './historyService.js'
import { resetTasks, setTasks, getNextTask, updateTask, planTasksWithProvider } from './taskService.js'
import { resetToolQueue, enqueueToolCalls, getNextPendingToolCall, markToolCallStarted, markToolCallCompleted, markToolCallFailed } from './toolQueueService.js'

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
  const injectedMemoryKeys = new Set((Array.isArray(selectedMemories) ? selectedMemories : []).map((m) => String(m?.key || '')).filter(Boolean))
  const baseMessages = [
    { role: 'system', content: systemPrompt },
    ...historyRaw,
    ...memoryMessages,
  ]
  let step = 1
  if (memoryEvents.length > 0 && typeof emit === 'function') {
    emit({ type: 'memory_used', memories: memoryEvents })
  }

  async function drainToolQueue(messages) {
    while (true) {
      const next = getNextPendingToolCall()
      if (!next) break
      const started = markToolCallStarted(next.id)
      if (started && typeof emit === 'function') {
        emit({ type: 'tool_update', id: started.id, status: 'running', startedAt: started.startedAt, timestamp: Date.now() })
      }
      const t0 = Date.now()
      try {
        let toolResult = null
        if (next.provider === 'mcp') {
          toolResult = await callMcpTool(next.tool, next.input)
          if (typeof toolResult !== 'string') toolResult = JSON.stringify(toolResult)
        } else {
          const inv = await invokeTool(next.provider, next.tool, next.input)
          toolResult = inv?.result ?? inv
        }

        const done = markToolCallCompleted(next.id, toolResult)
        if (done && typeof emit === 'function') {
          emit({
            type: 'tool_update',
            id: done.id,
            status: 'completed',
            result: toolResult,
            startedAt: done.startedAt,
            completedAt: done.completedAt,
            durationMs: done.durationMs ?? (Date.now() - t0),
            timestamp: Date.now(),
          })
        }

        const openMsgs = []
        if (next.provider === 'mcp') {
          openMsgs.push({ role: 'tool', toolName: next.tool, content: String(toolResult) })
        } else if (next.tool === 'openskills.read') {
          const skill = String(toolResult?.key || '')
          const body = String(toolResult?.body || '')
          const meta = toolResult?.meta || {}
          if (body) openMsgs.push({ role: 'openSkill', toolName: 'read', skill, content: body, meta })
        } else if (next.tool === 'openskills.readReference') {
          const skill = String(next.input?.skill || toolResult?.key || '')
          const extras = Array.isArray(toolResult?.extras) ? toolResult.extras : []
          for (const ex of extras) {
            const name = String(ex?.file || '')
            const content = String(ex?.content || '')
            const meta = ex?.meta || {}
            if (content) openMsgs.push({ role: 'openSkill', toolName: 'readReference', skill, reference: name, content, meta })
          }
        } else if (next.tool === 'openskills.call') {
          const skill = String(next.input?.skill || '')
          const script = String(next.input?.script || '')
          if (toolResult) {
            openMsgs.push({ role: 'openSkill', toolName: 'call', skill, script, content: toolResult, meta: { type: typeof toolResult } })
          }
        }

        if (openMsgs.length > 0) {
          const { added } = appendSkillMemories(openMsgs)
          const loopMemoryMessages = buildMemoryMessages(added)
          for (const m of openMsgs) {
            if (m.role === 'tool') {
              messages.push({ role: 'user', content: `Tool ${m.toolName} output: ${m.content}` })
            }
          }
          for (const mm of loopMemoryMessages) messages.push(mm)
        }
      } catch (e) {
        const errorMsg = String(e?.message || e)
        const failed = markToolCallFailed(next.id, errorMsg)
        if (failed && typeof emit === 'function') {
          emit({
            type: 'tool_update',
            id: failed.id,
            status: 'failed',
            error: errorMsg,
            startedAt: failed.startedAt,
            completedAt: failed.completedAt,
            durationMs: failed.durationMs ?? (Date.now() - t0),
            timestamp: Date.now(),
          })
        }

        const openMsgs = []
        if (next.provider === 'openskills') {
          openMsgs.push({
            role: 'openSkill',
            toolName: next.tool,
            skill: String(next.input?.skill || ''),
            content: `工具调用失败: ${errorMsg}`,
            meta: { status: 'failed', error: errorMsg },
          })
        } else if (next.provider === 'mcp') {
          openMsgs.push({ role: 'tool', toolName: next.tool, content: `工具调用失败: ${errorMsg}` })
        }
        if (openMsgs.length > 0) {
          const { added } = appendSkillMemories(openMsgs)
          const loopMemoryMessages = buildMemoryMessages(added)
          for (const m of openMsgs) {
            if (m.role === 'tool') {
              messages.push({ role: 'user', content: `Tool ${m.toolName} output: ${m.content}` })
            }
          }
          for (const mm of loopMemoryMessages) messages.push(mm)
        }
      }
    }
  }

  resetTasks()
  resetToolQueue()
  const planned = await planTasksWithProvider(provider, userInput, baseMessages, 6)
  const tasks = setTasks(
    planned.map((t, i) => ({
      title: t?.title,
      dependsOn: t?.dependsOn || [],
      suggestedSkills: t?.suggestedSkills || [],
      deliverable: t?.deliverable || '',
      status: 'pending',
      index: i,
    }))
  )
  if (typeof emit === 'function') {
    emit({ type: 'task_list', tasks })
  }

  const taskResults = []
  while (true) {
    const nextTask = getNextTask()
    if (!nextTask) break

    resetToolQueue()
    const inProg = updateTask(nextTask.id, { status: 'in_progress' })
    if (typeof emit === 'function') emit({ type: 'task_update', task: inProg })

    const deps = Array.isArray(inProg?.dependsOn) ? inProg.dependsOn : []
    const depTexts = deps
      .map((idx) => {
        const it = taskResults[idx]
        if (!it) return ''
        return `【依赖子任务 ${idx + 1}】${it.title}\n${it.result}`
      })
      .filter(Boolean)
      .join('\n\n')

    const memQuery = [
      `用户需求：${String(userInput || '')}`,
      `当前子任务：${String(inProg?.title || '')}`,
      String(inProg?.deliverable || '').trim() ? `预期产物：${String(inProg.deliverable || '')}` : '',
      Array.isArray(inProg?.suggestedSkills) && inProg.suggestedSkills.length
        ? `可能涉及技能：${inProg.suggestedSkills.map((s) => String(s)).filter(Boolean).join(', ')}`
        : '',
      depTexts ? `依赖结果：\n${depTexts}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    const { selected: selectedTaskResults } = await selectTaskResultMemoriesForQuestion(provider, [memQuery], 2)
    const taskResultMessages = buildTaskResultMessages(selectedTaskResults)
    const { selected: taskSelectedMemories } = await selectSkillMemoriesForQuestion(provider, [memQuery], 5)
    const taskMemoriesToInject = (Array.isArray(taskSelectedMemories) ? taskSelectedMemories : []).filter((m) => {
      const k = String(m?.key || '')
      if (!k) return false
      if (injectedMemoryKeys.has(k)) return false
      return true
    })
    if (taskMemoriesToInject.length > 0) {
      for (const m of taskMemoriesToInject) injectedMemoryKeys.add(String(m.key || ''))
      if (typeof emit === 'function') {
        emit({ type: 'memory_used', memories: buildMemoryEventPayload(taskMemoriesToInject) })
      }
    }
    const taskMemoryMessages = buildMemoryMessages(taskMemoriesToInject)

    const messages = [
      ...baseMessages,
      ...taskResultMessages,
      ...taskMemoryMessages,
      {
        role: 'user',
        content:
          '用户需求：' +
          String(userInput || '') +
          '\n\n当前子任务（按顺序执行）：' +
          String(inProg?.title || '') +
          (depTexts ? `\n\n依赖子任务结果：\n${depTexts}` : '') +
          '\n\n请完成该子任务，并严格按以下格式输出（只能二选一）：\n' +
          '- 如果还需要调用工具才能完成子任务：只输出 CALL_JSONS: [...]（不要输出其它文字）。\n' +
          '- 如果子任务已完成且不需要任何工具调用：输出 FINAL: <本子任务结论与必要细节>。',
      },
    ]

    while (true) {
      const completion = await createChatReply(provider, messages, mcpTools)
      const reply = String(completion?.choices?.[0]?.message?.content || '')
      const usage = typeof provider?.getLastUsage === 'function' ? provider.getLastUsage() : null
      if (usage && typeof emit === 'function') {
        emit({ type: 'llm_usage', usage, step, timestamp: Date.now() })
      }

      const calls = parseToolCalls(reply) || []
      if (calls.length > 0) {
        const prepared = enqueueToolCalls(calls)
        if (typeof emit === 'function') emit({ type: 'tool_calls', calls: prepared })
        await drainToolQueue(messages)
        step++
        continue
      }

      const final = String(reply || '').replace(/^FINAL:\s*/i, '').trim()
      const doneTask = updateTask(nextTask.id, { status: 'completed', result: final })
      if (typeof emit === 'function') emit({ type: 'task_update', task: doneTask })
      appendTaskResultMemory(doneTask, final, { dependsOn: doneTask.dependsOn || [], suggestedSkills: doneTask.suggestedSkills || [] })
      taskResults.push({ title: nextTask.title, result: final })
      step++
      break
    }
  }

  const summaryLines = taskResults
    .map((t, i) => `【子任务 ${i + 1}】${t.title}\n${t.result}`)
    .join('\n\n')
  const finalMessages = [
    ...baseMessages,
    {
      role: 'user',
      content:
        '用户需求：' +
        String(userInput || '') +
        (summaryLines ? '\n\n已完成的子任务结果如下：\n\n' + summaryLines : '\n\n未拆解子任务（历史上下文可能已包含关键结果或无需进一步动作）。') +
        '\n\n请基于以上结果输出最终答复（自然语言，结构清晰），直接产出“总结性报告”。输出格式：FINAL: <最终答复>。',
    },
  ]

  const completion = await createChatReply(provider, finalMessages, mcpTools)
  const reply = String(completion?.choices?.[0]?.message?.content || '')
  const usage = typeof provider?.getLastUsage === 'function' ? provider.getLastUsage() : null
  if (usage && typeof emit === 'function') {
    emit({ type: 'llm_usage', usage, step, timestamp: Date.now() })
  }
  const finalReply = String(reply || '').replace(/^FINAL:\s*/i, '').trim()
  const maxTurns = Number(cfg?.historyMaxTurns) || 12
  appendSessionSegments(sessionId, [{ role: 'user', content: userInput }, { role: 'assistant', content: finalReply }], maxTurns)
  if (typeof emit === 'function') emit({ type: 'done', reply: finalReply, step })
  return
}
