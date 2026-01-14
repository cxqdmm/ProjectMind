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

async function buildContext(userInput, sessionId, emit, selection) {
  const cfg = readLLMConfig()
  await initMcpClients()
  const mcpTools = await getMcpTools()
  const provider = createProvider(cfg, selection)
  const systemPrompt = readAgentsPrompt()
  const historyRaw = getSessionHistory(sessionId)
  return { cfg, provider, systemPrompt, historyRaw, mcpTools, emit, sessionId, userInput, step: 1 }
}

async function buildBaseMessages(ctx) {
  const historyRaw = Array.isArray(ctx.historyRaw) ? ctx.historyRaw : []
  const recentUserInputs = historyRaw
    .filter((m) => m && m.role === 'user')
    .slice(-10)
    .map((m) => String(m.content || '').trim())
    .filter(Boolean)
  recentUserInputs.push(String(ctx.userInput || '').trim())
  const { selected: selectedMemories } = await selectSkillMemoriesForQuestion(ctx.provider, recentUserInputs)
  const memoryMessages = buildMemoryMessages(selectedMemories)
  const memoryEvents = buildMemoryEventPayload(selectedMemories)
  const injectedMemoryKeys = new Set((Array.isArray(selectedMemories) ? selectedMemories : []).map((m) => String(m?.key || '')).filter(Boolean))
  const baseMessages = [{ role: 'system', content: ctx.systemPrompt }, ...historyRaw, ...memoryMessages]
  if (memoryEvents.length > 0 && typeof ctx.emit === 'function') ctx.emit({ type: 'memory_used', memories: memoryEvents })
  return { baseMessages, injectedMemoryKeys }
}

function buildOpenMsgs(call, toolResult, errorMsg) {
  const openMsgs = []
  if (call.provider === 'mcp') {
    openMsgs.push({ role: 'tool', toolName: call.tool, content: String(errorMsg ? `工具调用失败: ${errorMsg}` : toolResult) })
    return openMsgs
  }
  if (errorMsg) {
    openMsgs.push({ role: 'openSkill', toolName: call.tool, skill: String(call.input?.skill || ''), content: `工具调用失败: ${errorMsg}`, meta: { status: 'failed', error: errorMsg } })
    return openMsgs
  }
  if (call.tool === 'openskills.read') {
    const skill = String(toolResult?.key || '')
    const body = String(toolResult?.body || '')
    const meta = toolResult?.meta || {}
    if (body) openMsgs.push({ role: 'openSkill', toolName: 'read', skill, content: body, meta })
  } else if (call.tool === 'openskills.readReference') {
    const skill = String(call.input?.skill || toolResult?.key || '')
    const extras = Array.isArray(toolResult?.extras) ? toolResult.extras : []
    for (const ex of extras) {
      const name = String(ex?.file || '')
      const content = String(ex?.content || '')
      const meta = ex?.meta || {}
      if (content) openMsgs.push({ role: 'openSkill', toolName: 'readReference', skill, reference: name, content, meta })
    }
  } else if (call.tool === 'openskills.call') {
    const skill = String(call.input?.skill || '')
    const script = String(call.input?.script || '')
    if (toolResult) openMsgs.push({ role: 'openSkill', toolName: 'call', skill, script, content: toolResult, meta: { type: typeof toolResult } })
  }
  return openMsgs
}

function appendOpenMsgsToConversation(messages, openMsgs) {
  if (!openMsgs.length) return
  const { added } = appendSkillMemories(openMsgs)
  const loopMemoryMessages = buildMemoryMessages(added)
  for (const m of openMsgs) {
    if (m.role === 'tool') messages.push({ role: 'user', content: `Tool ${m.toolName} output: ${m.content}` })
  }
  for (const mm of loopMemoryMessages) messages.push(mm)
}

async function execSingleToolCall(ctx, messages, call) {
  const started = markToolCallStarted(call.id)
  if (started && typeof ctx.emit === 'function') ctx.emit({ type: 'tool_update', id: started.id, status: 'running', startedAt: started.startedAt, timestamp: Date.now() })
  const t0 = Date.now()
  try {
    let toolResult = null
    if (call.provider === 'mcp') {
      toolResult = await callMcpTool(call.tool, call.input)
      if (typeof toolResult !== 'string') toolResult = JSON.stringify(toolResult)
    } else {
      const inv = await invokeTool(call.provider, call.tool, call.input)
      toolResult = inv?.result ?? inv
    }
    const done = markToolCallCompleted(call.id, toolResult)
    if (done && typeof ctx.emit === 'function') {
      ctx.emit({ type: 'tool_update', id: done.id, status: 'completed', result: toolResult, startedAt: done.startedAt, completedAt: done.completedAt, durationMs: done.durationMs ?? (Date.now() - t0), timestamp: Date.now() })
    }
    appendOpenMsgsToConversation(messages, buildOpenMsgs(call, toolResult, null))
  } catch (e) {
    const errorMsg = String(e?.message || e)
    const failed = markToolCallFailed(call.id, errorMsg)
    if (failed && typeof ctx.emit === 'function') {
      ctx.emit({ type: 'tool_update', id: failed.id, status: 'failed', error: errorMsg, startedAt: failed.startedAt, completedAt: failed.completedAt, durationMs: failed.durationMs ?? (Date.now() - t0), timestamp: Date.now() })
    }
    appendOpenMsgsToConversation(messages, buildOpenMsgs(call, null, errorMsg))
  }
}

async function drainToolQueue(ctx, messages) {
  while (true) {
    const next = getNextPendingToolCall()
    if (!next) return
    await execSingleToolCall(ctx, messages, next)
  }
}

async function planAndInitTasks(ctx, baseMessages) {
  resetTasks()
  resetToolQueue()
  const planned = await planTasksWithProvider(ctx.provider, ctx.userInput, baseMessages, 6)
  const tasks = setTasks(planned.map((t, i) => ({ title: t?.title, dependsOn: t?.dependsOn || [], suggestedSkills: t?.suggestedSkills || [], deliverable: t?.deliverable || '', status: 'pending', index: i })))
  if (typeof ctx.emit === 'function') ctx.emit({ type: 'task_list', tasks })
  return tasks
}

function buildDepTexts(taskResults, task) {
  const deps = Array.isArray(task?.dependsOn) ? task.dependsOn : []
  return deps
    .map((idx) => {
      const it = taskResults[idx]
      if (!it) return ''
      return `【依赖子任务 ${idx + 1}】${it.title}\n${it.result}`
    })
    .filter(Boolean)
    .join('\n\n')
}

function buildTaskQuery(userInput, task, depTexts) {
  const parts = [
    `用户需求：${String(userInput || '')}`,
    `当前子任务：${String(task?.title || '')}`,
    String(task?.deliverable || '').trim() ? `预期产物：${String(task.deliverable || '')}` : '',
    Array.isArray(task?.suggestedSkills) && task.suggestedSkills.length ? `可能涉及技能：${task.suggestedSkills.map((s) => String(s)).filter(Boolean).join(', ')}` : '',
    depTexts ? `依赖结果：\n${depTexts}` : '',
  ]
  return parts.filter(Boolean).join('\n\n')
}

async function selectTaskMemoryMessages(ctx, injectedMemoryKeys, memQuery) {
  const { selected: selectedTaskResults } = await selectTaskResultMemoriesForQuestion(ctx.provider, [memQuery], 2)
  const taskResultMessages = buildTaskResultMessages(selectedTaskResults)
  const { selected: taskSelectedMemories } = await selectSkillMemoriesForQuestion(ctx.provider, [memQuery], 5)
  const toInject = (Array.isArray(taskSelectedMemories) ? taskSelectedMemories : []).filter((m) => {
    const k = String(m?.key || '')
    return k && !injectedMemoryKeys.has(k)
  })
  if (toInject.length > 0) {
    for (const m of toInject) injectedMemoryKeys.add(String(m.key || ''))
    if (typeof ctx.emit === 'function') ctx.emit({ type: 'memory_used', memories: buildMemoryEventPayload(toInject) })
  }
  return { taskResultMessages, taskMemoryMessages: buildMemoryMessages(toInject) }
}

function buildTaskMessages(baseMessages, taskResultMessages, taskMemoryMessages, userInput, taskTitle, depTexts) {
  return [
    ...baseMessages,
    ...taskResultMessages,
    ...taskMemoryMessages,
    {
      role: 'user',
      content:
        '用户需求：' +
        String(userInput || '') +
        '\n\n当前子任务（按顺序执行）：' +
        String(taskTitle || '') +
        (depTexts ? `\n\n依赖子任务结果：\n${depTexts}` : '') +
        '\n\n请完成该子任务，并严格按以下格式输出（只能二选一）：\n' +
        '- 如果还需要调用工具才能完成子任务：只输出 CALL_JSONS: [...]（不要输出其它文字）。\n' +
        '- 如果子任务已完成且不需要任何工具调用：输出 FINAL: <本子任务结论与必要细节>。',
    },
  ]
}

async function runTaskToolLoop(ctx, messages) {
  while (true) {
    const completion = await createChatReply(ctx.provider, messages, ctx.mcpTools)
    const reply = String(completion?.choices?.[0]?.message?.content || '')
    const usage = typeof ctx.provider?.getLastUsage === 'function' ? ctx.provider.getLastUsage() : null
    if (usage && typeof ctx.emit === 'function') ctx.emit({ type: 'llm_usage', usage, step: ctx.step, timestamp: Date.now() })
    const calls = parseToolCalls(reply) || []
    if (calls.length > 0) {
      const prepared = enqueueToolCalls(calls)
      if (typeof ctx.emit === 'function') ctx.emit({ type: 'tool_calls', calls: prepared })
      await drainToolQueue(ctx, messages)
      ctx.step++
      continue
    }
    return String(reply || '').replace(/^FINAL:\s*/i, '').trim()
  }
}

async function runSingleTask(ctx, baseMessages, injectedMemoryKeys, taskResults, nextTask) {
  resetToolQueue()
  const inProg = updateTask(nextTask.id, { status: 'in_progress' })
  if (typeof ctx.emit === 'function') ctx.emit({ type: 'task_update', task: inProg })
  const depTexts = buildDepTexts(taskResults, inProg)
  const memQuery = buildTaskQuery(ctx.userInput, inProg, depTexts)
  const { taskResultMessages, taskMemoryMessages } = await selectTaskMemoryMessages(ctx, injectedMemoryKeys, memQuery)
  const messages = buildTaskMessages(baseMessages, taskResultMessages, taskMemoryMessages, ctx.userInput, inProg?.title, depTexts)
  const final = await runTaskToolLoop(ctx, messages)
  const doneTask = updateTask(nextTask.id, { status: 'completed', result: final })
  if (typeof ctx.emit === 'function') ctx.emit({ type: 'task_update', task: doneTask })
  appendTaskResultMemory(doneTask, final, { dependsOn: doneTask.dependsOn || [], suggestedSkills: doneTask.suggestedSkills || [] })
  ctx.step++
  return { title: nextTask.title, result: final }
}

async function runAllTasks(ctx, baseMessages, injectedMemoryKeys) {
  const taskResults = []
  while (true) {
    const nextTask = getNextTask()
    if (!nextTask) return taskResults
    const r = await runSingleTask(ctx, baseMessages, injectedMemoryKeys, taskResults, nextTask)
    taskResults.push(r)
  }
}

async function finalizeReport(ctx, baseMessages, taskResults) {
  const summaryLines = taskResults.map((t, i) => `【子任务 ${i + 1}】${t.title}\n${t.result}`).join('\n\n')
  const finalMessages = [
    ...baseMessages,
    {
      role: 'user',
      content:
        '用户需求：' +
        String(ctx.userInput || '') +
        (summaryLines ? '\n\n已完成的子任务结果如下：\n\n' + summaryLines : '\n\n未拆解子任务（历史上下文可能已包含关键结果或无需进一步动作）。') +
        '\n\n请基于以上结果输出最终答复（自然语言，结构清晰），直接产出“总结性报告”。输出格式：FINAL: <最终答复>。',
    },
  ]
  const completion = await createChatReply(ctx.provider, finalMessages, ctx.mcpTools)
  const reply = String(completion?.choices?.[0]?.message?.content || '')
  const usage = typeof ctx.provider?.getLastUsage === 'function' ? ctx.provider.getLastUsage() : null
  if (usage && typeof ctx.emit === 'function') ctx.emit({ type: 'llm_usage', usage, step: ctx.step, timestamp: Date.now() })
  const finalReply = String(reply || '').replace(/^FINAL:\s*/i, '').trim()
  const maxTurns = Number(ctx.cfg?.historyMaxTurns) || 12
  appendSessionSegments(ctx.sessionId, [{ role: 'user', content: ctx.userInput }, { role: 'assistant', content: finalReply }], maxTurns)
  if (typeof ctx.emit === 'function') ctx.emit({ type: 'done', reply: finalReply, step: ctx.step })
}

export async function runStream(userInput, sessionId = 'default', emit, selection) {
  const ctx = await buildContext(userInput, sessionId, emit, selection)
  const { baseMessages, injectedMemoryKeys } = await buildBaseMessages(ctx)
  await planAndInitTasks(ctx, baseMessages)
  const taskResults = await runAllTasks(ctx, baseMessages, injectedMemoryKeys)
  await finalizeReport(ctx, baseMessages, taskResults)
}
