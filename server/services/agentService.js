// 推理服务：读取系统提示、执行推理循环、解析并执行工具调用
import { readLLMConfig } from '../utils/config.js'
import { createProvider } from './providerService.js'
import { parseToolCalls } from './toolParseService.js'
import { invoke as invokeTool } from './toolInvokeService.js'
import { readAgentsPrompt } from './promptService.js'
import { selectSkillMemoriesForQuestion, buildMemoryMessages, buildMemoryEventPayload, appendSkillMemories } from './memoryService.js'
import { getSessionHistory, appendSessionSegments } from './historyService.js'
import { resetTasks, setTasks, getNextTask, updateTask, planTasksWithProvider } from './taskService.js'
import { resetToolQueue, enqueueToolCalls, getNextPendingToolCall, markToolCallStarted, markToolCallCompleted, markToolCallFailed } from './toolQueueService.js'

import { initMcpClients, getMcpTools, callMcpTool } from './mcpService.js'

function emitLog(emit, title, content) {
  if (typeof emit === 'function') {
    emit({
      type: 'debug_log',
      log: {
        title,
        content,
        timestamp: Date.now(),
      },
    })
  }
}

async function createChatReply(provider, messages, tools, emit) {
  emitLog(emit, '模型调用开始', { messages, tools })
  const content = await provider.chat(messages, tools)
  emitLog(emit, '模型调用完成', { content })
  return { choices: [{ message: { content } }] }
}

function stripCodeFences(text) {
  const s = String(text || '').trim()
  if (!s) return ''
  const m = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return m ? String(m[1] || '').trim() : s
}

function parseFollowupTasks(reply) {
  const raw = stripCodeFences(reply)
  const idx = raw.toUpperCase().indexOf('FOLLOWUP_TASKS:')
  if (idx < 0) return null
  const payload = raw.slice(idx + 'FOLLOWUP_TASKS:'.length).trim()
  const jsonText = stripCodeFences(payload)
  let arr = null
  try {
    arr = JSON.parse(jsonText)
  } catch (_) {
    const start = jsonText.indexOf('[')
    const end = jsonText.lastIndexOf(']')
    if (start >= 0 && end > start) {
      try {
        arr = JSON.parse(jsonText.slice(start, end + 1))
      } catch (_) {
        arr = null
      }
    }
  }
  if (!Array.isArray(arr)) return null
  const out = []
  for (const t of arr) {
    if (!t || typeof t !== 'object') continue
    const title = String(t.title || '').trim()
    if (!title) continue
    out.push({
      title,
      deliverable: String(t.deliverable || '').trim(),
      dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [],
    })
  }
  return out
}

function parseFinalReply(reply) {
  const raw = stripCodeFences(reply)
  const m = raw.match(/FINAL:\s*([\s\S]*)$/i)
  if (!m) return null
  return String(m[1] || '').trim()
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
  if (started && typeof ctx.emit === 'function') ctx.emit({ type: 'tool_update', id: started.id, status: 'running', startedAt: started.startedAt, timestamp: Date.now(), task: ctx.taskCtx })
  const t0 = Date.now()
  try {
    let toolResult = null
    emitLog(ctx.emit, '开始执行工具调用', { tool: call.tool, input: call.input })
    if (call.provider === 'mcp') {
      toolResult = await callMcpTool(call.tool, call.input)
      if (typeof toolResult !== 'string') toolResult = JSON.stringify(toolResult)
    } else {
      const inv = await invokeTool(call.provider, call.tool, call.input)
      toolResult = inv?.result ?? inv
    }
    const done = markToolCallCompleted(call.id, toolResult)
    if (done && typeof ctx.emit === 'function') {
      ctx.emit({ type: 'tool_update', id: done.id, status: 'completed', result: toolResult, startedAt: done.startedAt, completedAt: done.completedAt, durationMs: done.durationMs ?? (Date.now() - t0), timestamp: Date.now(), task: ctx.taskCtx })
    }
    emitLog(ctx.emit, '工具执行完成', { tool: call.tool, result: toolResult })
    appendOpenMsgsToConversation(messages, buildOpenMsgs(call, toolResult, null))
  } catch (e) {
    const errorMsg = String(e?.message || e)
    const failed = markToolCallFailed(call.id, errorMsg)
    if (failed && typeof ctx.emit === 'function') {
      ctx.emit({ type: 'tool_update', id: failed.id, status: 'failed', error: errorMsg, startedAt: failed.startedAt, completedAt: failed.completedAt, durationMs: failed.durationMs ?? (Date.now() - t0), timestamp: Date.now(), task: ctx.taskCtx })
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
  emitLog(ctx.emit, '开始规划任务', { userInput: ctx.userInput })
  const planned = await planTasksWithProvider(ctx.provider, ctx.userInput, baseMessages)
  emitLog(ctx.emit, '任务规划完成', { tasks: planned })
  const tasks = setTasks(planned.map((t, i) => ({ title: t?.title, dependsOn: t?.dependsOn || [], deliverable: t?.deliverable || '', status: 'pending', index: i })))
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
    depTexts ? `依赖结果：\n${depTexts}` : '',
  ]
  return parts.filter(Boolean).join('\n\n')
}

async function selectTaskMemoryMessages(ctx, injectedMemoryKeys, memQuery, taskCtx) {
  const { selected: taskSelectedMemories } = await selectSkillMemoriesForQuestion(ctx.provider, [memQuery], 5)
  const toInject = (Array.isArray(taskSelectedMemories) ? taskSelectedMemories : []).filter((m) => {
    const k = String(m?.key || '')
    return k && !injectedMemoryKeys.has(k)
  })
  if (toInject.length > 0) {
    for (const m of toInject) injectedMemoryKeys.add(String(m.key || ''))
    if (typeof ctx.emit === 'function') ctx.emit({ type: 'memory_used', memories: buildMemoryEventPayload(toInject), task: taskCtx })
  }
  return { taskMemoryMessages: buildMemoryMessages(toInject) }
}

function buildTaskMessages(baseMessages, taskMemoryMessages, userInput, taskTitle, depTexts) {
  return [
    ...baseMessages,
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
        '- 如果仍需要任何【额外信息】/【工具调用】才能完成并交付该子任务：只输出 CALL_JSONS: [...]（不要输出其它文字）。\n' +
        '- 只有当你确信该子任务已达到可交付状态，且不再需要任何工具/额外步骤：才输出 FINAL: <本子任务结论与必要细节>。\n' +
        '注意：不要在 CALL_JSONS 或 FINAL 之外输出任何自然语言说明。',
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
      if (typeof ctx.emit === 'function') ctx.emit({ type: 'tool_calls', calls: prepared, task: ctx.taskCtx })
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
  ctx.taskCtx = { id: inProg.id, index: inProg.index, title: inProg.title }
  const depTexts = buildDepTexts(taskResults, inProg)
  const memQuery = buildTaskQuery(ctx.userInput, inProg, depTexts)
  const { taskMemoryMessages } = await selectTaskMemoryMessages(ctx, injectedMemoryKeys, memQuery, ctx.taskCtx)
  emitLog(ctx.emit, '任务记忆获取', { task: ctx.taskCtx, query: memQuery, result: taskMemoryMessages })
  const messages = buildTaskMessages(baseMessages, taskMemoryMessages, ctx.userInput, inProg?.title, depTexts)
  emitLog(ctx.emit, '任务执行开始', { task: ctx.taskCtx, query: messages })
  const final = await runTaskToolLoop(ctx, messages)
  const doneTask = updateTask(nextTask.id, { status: 'completed', result: final })
  if (typeof ctx.emit === 'function') ctx.emit({ type: 'task_update', task: doneTask })
  emitLog(ctx.emit, '任务执行完成', { task: ctx.taskCtx, result: final })
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

async function finalizeGate(ctx, baseMessages, taskResults, opts = {}) {
  const forceFinal = Boolean(opts?.forceFinal)
  const summaryLines = taskResults.map((t, i) => `【子任务 ${i + 1}】${t.title}\n${t.result}`).join('\n\n')
  const finalMessages = [
    ...baseMessages,
    {
      role: 'user',
      content:
        '用户需求：' +
        String(ctx.userInput || '') +
        (summaryLines ? '\n\n已完成的子任务结果如下：\n\n' + summaryLines : '\n\n未拆解子任务或无可用结果。') +
        (forceFinal
          ? '\n\n输出最终答复\n' +
            '输出格式：FINAL: <最终答复>\n' +
            '注意：不要输出任何其它文字。'
          : '\n\n请判断：是否已经完全满足用户需求与可交付标准。\n' +
            '只能二选一输出：\n' +
            '- 若已满足：输出 FINAL: <最终答复>\n' +
            '- 若未满足且需要继续：输出 FOLLOWUP_TASKS: <JSON数组>\n' +
            '其中 JSON 数组元素格式：{ \"title\": string, \"deliverable\"?: string, \"dependsOn\"?: number[] }\n' +
            '注意：不要输出任何其它文字。'),
    },
  ]
  const completion = await createChatReply(ctx.provider, finalMessages, ctx.mcpTools, ctx.emit)
  const reply = String(completion?.choices?.[0]?.message?.content || '')
  const usage = typeof ctx.provider?.getLastUsage === 'function' ? ctx.provider.getLastUsage() : null
  if (usage && typeof ctx.emit === 'function') ctx.emit({ type: 'llm_usage', usage, step: ctx.step, timestamp: Date.now() })
  if (!forceFinal) {
    const followups = parseFollowupTasks(reply)
    if (followups && followups.length) {
      if (typeof ctx.emit === 'function') ctx.emit({ type: 'finalization_gate', decision: 'followup', tasks: followups, step: ctx.step, timestamp: Date.now() })
      return { decision: 'followup', tasks: followups }
    }
  }
  const parsedFinal = parseFinalReply(reply)
  const finalReply = String(parsedFinal || reply || '').replace(/^FINAL:\s*/i, '').trim()
  if (typeof ctx.emit === 'function') ctx.emit({ type: 'finalization_gate', decision: 'final', step: ctx.step, timestamp: Date.now() })
  const maxTurns = Number(ctx.cfg?.historyMaxTurns) || 12
  appendSessionSegments(ctx.sessionId, [{ role: 'user', content: ctx.userInput }, { role: 'assistant', content: finalReply }], maxTurns)
  if (typeof ctx.emit === 'function') ctx.emit({ type: 'done', reply: finalReply, step: ctx.step })
  return { decision: 'final', finalReply }
}

export async function runStream(userInput, sessionId = 'default', emit, selection) {
  const ctx = await buildContext(userInput, sessionId, emit, selection)
  const { baseMessages, injectedMemoryKeys } = await buildBaseMessages(ctx)
  const maxRounds = Number(ctx.cfg?.maxAgentRounds) || 3
  const allResults = []
  let round = 0
  let pendingFollowups = null
  while (round < maxRounds) {
    if (Array.isArray(pendingFollowups) && pendingFollowups.length) {
      resetTasks()
      resetToolQueue()
      const tasks = setTasks(pendingFollowups.map((t, i) => ({ title: t.title, dependsOn: t.dependsOn || [], deliverable: t.deliverable || '', status: 'pending', index: i })))
      if (typeof ctx.emit === 'function') ctx.emit({ type: 'task_list', tasks, planType: 'followup', round: round + 1, timestamp: Date.now() })
      pendingFollowups = null
    } else {
      await planAndInitTasks(ctx, baseMessages)
    }
    const batchResults = await runAllTasks(ctx, baseMessages, injectedMemoryKeys)
    for (const r of batchResults) allResults.push(r)
    emitLog(ctx.emit, '所有任务执行完成', { task: ctx.taskCtx, round: round + 1, results: batchResults })
    const gate = await finalizeGate(ctx, baseMessages, allResults)
    emitLog(ctx.emit, '所有任务最终化决策', { task: ctx.taskCtx, round: round + 1, decision: gate.decision, followups: gate.tasks })
    ctx.step++
    if (gate?.decision === 'followup' && Array.isArray(gate.tasks) && gate.tasks.length) {
      pendingFollowups = gate.tasks
      round++
      continue
    }
    return
  }
  await finalizeGate(ctx, baseMessages, allResults, { forceFinal: true })
}
