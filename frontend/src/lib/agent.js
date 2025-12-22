const sessionHistories = new Map()

function classifyIntent(text) {
  const t = String(text || '').toLowerCase()
  const productHints = ['产品','规格','配置','价格','收费','套餐','功能','版本','pro','lite']
  const complaintHints = ['投诉','客诉','售后','质保','保修','退款','退费','人工','客服','电话']
  const hasProduct = productHints.some(k => t.includes(k))
  const hasComplaint = complaintHints.some(k => t.includes(k))
  if (hasComplaint && !hasProduct) return 'complaint'
  if (hasProduct) return 'product'
  return 'other'
}

function parseToolCall(s) {
  const m = String(s || '').match(/CALL_JSON:\s*(\{[\s\S]*\})/i)
  if (m) {
    try {
      const obj = JSON.parse(m[1])
      let provider = String(obj?.provider || '').trim()
      let toolName = String(obj?.tool || '').trim()
      const input = obj?.input ?? {}
      if (toolName.includes('.')) {
        const parts = toolName.split('.')
        provider = provider || parts[0]
        toolName = parts.slice(1).join('.')
      }
      const normalized = provider && toolName ? `${provider}.${toolName.replace(new RegExp(`^${provider}\.`), '')}` : (provider || toolName)
      return { provider, tool: normalized, toolName, input }
    } catch {}
  }
  const m2 = String(s || '').match(/CALL:\s*([\w.-]+)\s*(\{[\s\S]*?\})/i)
  if (m2) {
    const full = m2[1]
    const parts = full.split('.')
    const provider = parts[0]
    const toolSuffix = parts.slice(1).join('.')
    const normalizedTool = toolSuffix ? `${provider}.${toolSuffix.replace(new RegExp(`^${provider}\.`), '')}` : provider
    try {
      const input = JSON.parse(m2[2])
      const toolName = normalizedTool.split('.').slice(1).join('.')
      return { provider, tool: normalizedTool, toolName, input }
    } catch {}
  }
  return null
}

function parseToolCalls(text) {
  const s = String(text || '')
  const out = []
  const mjArr = s.match(/CALL_JSONS:\s*(\[[\s\S]*\])/i)
  if (mjArr) {
    try {
      const arr = JSON.parse(mjArr[1])
      if (Array.isArray(arr)) {
        for (const obj of arr) {
          let provider = String(obj?.provider || '').trim()
          let toolName = String(obj?.tool || '').trim()
          const input = obj?.input ?? {}
          if (toolName.includes('.')) {
            const parts = toolName.split('.')
            provider = provider || parts[0]
            toolName = parts.slice(1).join('.')
          }
          const normalized = provider && toolName ? `${provider}.${toolName.replace(new RegExp(`^${provider}\.`), '')}` : (provider || toolName)
          out.push({ provider, tool: normalized, toolName, input })
        }
      }
    } catch {}
  }
  try {
    const single = parseToolCall(s)
    if (single) out.push(single)
  } catch {}
  const re = /CALL:\s*([\w.-]+)\s*(\{[\s\S]*?\})/ig
  let m
  while ((m = re.exec(s))) {
    const full = m[1]
    const parts = full.split('.')
    const provider = parts[0]
    const toolSuffix = parts.slice(1).join('.')
    const normalizedTool = toolSuffix ? `${provider}.${toolSuffix.replace(new RegExp(`^${provider}\.`), '')}` : provider
    try {
      const input = JSON.parse(m[2])
      const toolName = normalizedTool.split('.').slice(1).join('.')
      out.push({ provider, tool: normalizedTool, toolName, input })
    } catch {}
  }
  const dedup = []
  const seen = new Set()
  for (const c of out) {
    const key = `${c.provider}|${c.tool}|${JSON.stringify(c.input)}`
    if (!seen.has(key)) {
      seen.add(key)
      dedup.push(c)
    }
  }
  return dedup
}

function clip(s, n = 400) {
  const str = String(s || '')
  if (str.length <= n) return str
  return str.slice(0, n) + `…(${str.length}字符)`
}

async function loadJSON(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`load ${url} failed`)
  return r.json()
}


import { LOCAL_MCP_TOOLS } from './localTools.js'
import { loadSkillsManifest } from './skillsRuntime.js'

async function invokeMCPTool(provider, tool, input) {
  const full = tool && tool.includes('.') ? tool : `${provider}.${tool}`
  const fn = LOCAL_MCP_TOOLS[full]
  if (!fn) throw new Error(`tool ${full} not found`)
  const res = await Promise.resolve(fn(input || {}))
  return { result: res }
}

function buildToolSystemJSON(tools) {
  const items = (tools || []).map(t => {
    const provider = t.provider || ''
    const rawTool = t.tool || ''
    let name = t.name
    if (!name) {
      if (provider && rawTool) {
        name = rawTool.startsWith(`${provider}.`) ? rawTool : `${provider}.${rawTool}`
      } else {
        name = rawTool || provider
      }
    }
    const desc = t.description || ''
    const inputSchema = t.inputSchema || t.input || {}
    const outputSchema = t.outputSchema || t.output || {}
    const inputProps = inputSchema.properties || {}
    const required = inputSchema.required || []
    const props = Object.keys(inputProps).map(k => ({
      name: k,
      type: (inputProps[k] && inputProps[k].type) || 'any',
      required: required.includes(k),
      description: (inputProps[k] && inputProps[k].description) || '',
      enum: Array.isArray(inputProps[k]?.enum) ? inputProps[k].enum : undefined
    }))
    const outProps = outputSchema.properties || {}
    const out = Object.keys(outProps).map(k => ({
      name: k,
      type: (outProps[k] && outProps[k].type) || 'any',
      description: (outProps[k] && outProps[k].description) || '',
      enum: Array.isArray(outProps[k]?.enum) ? outProps[k].enum : undefined
    }))
    return {
      name,
      description: desc,
      input: { properties: props },
      output: { properties: out }
    }
  })
  const trigger = {
    text: { format: 'CALL: <provider>.<tool> <JSON输入>', example: 'CALL: policy.basic_info {"policyId": "POLICY-001"}' },
    json: { format: 'CALL_JSON: {"provider":"<provider>","tool":"<tool>","input":{...}}', example: 'CALL_JSON: {"provider":"policy","tool":"basic_info","input":{"policyId":"POLICY-001"}}' },
    batch: {
      text: { format: '同一消息可写多行 CALL 以并行触发', example: 'CALL: policy.basic_info {"policyId":"POLICY-001"}\nCALL: project.intro {"name":"高端员福"}' },
      json: { format: 'CALL_JSONS: [{"provider":"<provider>","tool":"<tool>","input":{...}}, ...]', example: 'CALL_JSONS: [{"provider":"policy","tool":"basic_info","input":{"policyId":"POLICY-001"}},{"provider":"project","tool":"intro","input":{"name":"高端员福"}}]' }
    }
  }
  const obj = { messageType: 'mcp_tools', tools: items, trigger }
  return JSON.stringify(obj, null, 2)
}

async function createChatCompletion(baseURL, apiKey, model, messages) {
  const url = (baseURL || '').replace(/\/$/, '') + '/chat/completions'
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }
  const body = { model, messages }
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!r.ok) throw new Error('chat completion failed')
  return r.json()
}

async function reasoningLoop(baseURL, apiKey, model, baseMessages, maxSteps, runId, onEvent) {
  let messages = [...baseMessages]
  let reply = ''
  let toolCalls = 0
  const events = []
  try {
    const lastMsg = messages[messages.length - 1]
    const primCalls = parseToolCalls(lastMsg?.content || '')
    if (primCalls.length > 0) {
      const ts = Date.now()
      const callsWithId = primCalls.map((c, i) => ({ ...c, id: `t${ts.toString(36)}${Math.random().toString(36).slice(2,6)}${i}`, startedAt: ts }))
      const startEvent = { messageType: 'tool_calls', runId, step: 0, timestamp: ts, calls: callsWithId.map(c => ({ id: c.id, provider: c.provider, tool: c.tool, toolName: c.toolName, name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool, status: 'started', inputPreview: clip(JSON.stringify(c.input), 300), startedAt: c.startedAt, render: { variant: 'card', progress: true, collapsible: true } })) }
      events.push(startEvent)
      if (onEvent) try { onEvent(startEvent) } catch {}
      const results = await Promise.all(callsWithId.map(async (c) => {
        const startedAt = Date.now()
        try {
          const inv = await invokeMCPTool(c.provider, c.tool, c.input)
          const toolResult = inv?.result ?? inv
          const completedAt = Date.now()
          const evt = { messageType: 'tool_update', runId, step: 0, timestamp: completedAt, id: c.id, provider: c.provider, tool: c.tool, toolName: c.toolName, name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool, status: 'completed', result: toolResult, preview: clip(JSON.stringify(toolResult), 500), startedAt, completedAt, durationMs: completedAt - c.startedAt, render: { badge: 'success' } }
          events.push(evt)
          if (onEvent) try { onEvent(evt) } catch {}
          return { ...c, ok: true, result: toolResult }
        } catch (e) {
          const completedAt = Date.now()
          const errPayload = { message: String(e?.message || e) }
          const evt = { messageType: 'tool_update', runId, step: 0, timestamp: completedAt, id: c.id, provider: c.provider, tool: c.tool, toolName: c.toolName, name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool, status: 'failed', error: errPayload, startedAt, completedAt, durationMs: completedAt - c.startedAt, render: { badge: 'error' } }
          events.push(evt)
          if (onEvent) try { onEvent(evt) } catch {}
          return { ...c, ok: false, error: errPayload.message }
        }
      }))
      const skillMsgs = []
      const otherSummaries = []
      for (const r of results) {
        if (r.ok && r.tool.startsWith('skill.load')) {
          const body = String(r.result?.body || '')
          if (body) skillMsgs.push({ role: 'system', content: body })
        } else {
          const payload = r.ok ? r.result : { error: r.error }
          otherSummaries.push(`工具(${r.provider}.${r.toolName})结果：${JSON.stringify(payload)}`)
        }
      }
      messages = [ ...messages, ...skillMsgs, ...(otherSummaries.length ? [{ role: 'assistant', content: otherSummaries.join('\n') }] : []) ]
      toolCalls += primCalls.length
      reply = otherSummaries.join('\n')
      return { reply, messages, toolCalls, steps: 0, events }
    }
  } catch {}
  for (let step = 1; step <= maxSteps; step++) {
    const completion = await createChatCompletion(baseURL, apiKey, model, messages)
    reply = String(completion?.choices?.[0]?.message?.content || '')
    const calls = parseToolCalls(reply) || []
    if (calls.length > 0) {
      const ts = Date.now()
      const callsWithId = calls.map((c, i) => ({ ...c, id: `t${ts.toString(36)}${Math.random().toString(36).slice(2,6)}${i}`, startedAt: ts }))
      const startEvent = { messageType: 'tool_calls', runId, step, timestamp: ts, calls: callsWithId.map(c => ({ id: c.id, provider: c.provider, tool: c.tool, toolName: c.toolName, name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool, status: 'started', inputPreview: clip(JSON.stringify(c.input), 300), startedAt: c.startedAt, render: { variant: 'card', progress: true, collapsible: true } })) }
      events.push(startEvent)
      if (onEvent) try { onEvent(startEvent) } catch {}
      for (const c of callsWithId) {
        const runningEvt = { messageType: 'tool_update', runId, step, timestamp: Date.now(), id: c.id, provider: c.provider, tool: c.tool, toolName: c.toolName, name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool, status: 'running', progress: null, startedAt: c.startedAt, render: { badge: 'processing' } }
        events.push(runningEvt)
        if (onEvent) try { onEvent(runningEvt) } catch {}
      }
      const results = await Promise.all(callsWithId.map(async (c) => {
        const startedAt = Date.now()
        try {
          const inv = await invokeMCPTool(c.provider, c.tool, c.input)
          const toolResult = inv?.result ?? inv
          const completedAt = Date.now()
          const evt = { messageType: 'tool_update', runId, step, timestamp: completedAt, id: c.id, provider: c.provider, tool: c.tool, toolName: c.toolName, name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool, status: 'completed', result: toolResult, preview: clip(JSON.stringify(toolResult), 500), startedAt, completedAt, durationMs: completedAt - c.startedAt, render: { badge: 'success' } }
          events.push(evt)
          if (onEvent) try { onEvent(evt) } catch {}
          return { ...c, ok: true, result: toolResult }
        } catch (e) {
          const completedAt = Date.now()
          const errPayload = { message: String(e?.message || e) }
          const evt = { messageType: 'tool_update', runId, step, timestamp: completedAt, id: c.id, provider: c.provider, tool: c.tool, toolName: c.toolName, name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool, status: 'failed', error: errPayload, startedAt, completedAt, durationMs: completedAt - c.startedAt, render: { badge: 'error' } }
          events.push(evt)
          if (onEvent) try { onEvent(evt) } catch {}
          return { ...c, ok: false, error: errPayload.message }
        }
      }))
      const skillMsgs = []
      const otherSummaries = []
      for (const r of results) {
        if (r.ok && r.tool.startsWith('skill.load')) {
          const body = String(r.result?.body || '')
          if (body) skillMsgs.push({ role: 'system', content: body })
        } else {
          const payload = r.ok ? r.result : { error: r.error }
          otherSummaries.push(`工具(${r.provider}.${r.toolName})结果：${JSON.stringify(payload)}`)
        }
      }
      messages = [ ...messages, { role: 'assistant', content: reply }, ...skillMsgs, ...(otherSummaries.length ? [{ role: 'user', content: otherSummaries.join('\n') }] : []) ]
      toolCalls += calls.length
      continue
    }
    messages = [...messages, { role: 'assistant', content: reply }]
    return { reply, messages, toolCalls, steps: step, events }
  }
  const completion = await createChatCompletion(baseURL, apiKey, model, [...messages, { role: 'user', content: '请根据已有信息给出最终简洁回答。' }])
  const finalReply = String(completion?.choices?.[0]?.message?.content || '')
  messages = [...messages, { role: 'assistant', content: finalReply }]
  return { reply: finalReply, messages, toolCalls, steps: maxSteps, events }
}

export async function runAgentBrowser(userInput, options = {}, onEvent) {
  const sessionId = String(options?.sessionId || 'default')
  const apiKey = String(options?.apiKey || '')
  const intent = classifyIntent(userInput)
  let payload = { tools: [] }
  try {
    const manifest = await loadSkillsManifest()
    const skills = Array.isArray(manifest?.skills) ? manifest.skills : []
    const skillTool = {
      provider: 'skill',
      tool: 'load',
      name: 'skill.load',
      description: '加载并注入技能说明到上下文',
      inputSchema: {
        type: 'object',
        properties: {
          skill: { type: 'string', enum: skills.map(s => s.key) }
        },
        required: ['skill']
      },
      outputSchema: { type: 'object', properties: { key: { type: 'string' }, meta: { type: 'object' }, body: { type: 'string' } } }
    }
    payload.tools = [...(payload.tools || []), skillTool]
  } catch {}
  const cfg = await loadJSON('/llm.json')
  const info = cfg.qwen || {}
  const baseURL = info.baseURL || info.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  const model = info.model || 'qwen-plus'
  const facts = JSON.stringify(payload)
  const maxTurnsRaw = (info && (info.historyMaxTurns ?? info.maxHistoryTurns)) ?? (cfg && cfg.historyMaxTurns)
  const MAX_TURNS = Math.max(0, Math.min(50, Number(maxTurnsRaw) || 12))
  const history = sessionHistories.get(sessionId) || []
  const tools = (payload.tools || [])
  const toolSystemMsg = buildToolSystemJSON(tools)
  const sysReasoningMsg = '指令：采用逐步推理，每步判断是否需要工具（CALL/CALL_JSON）。当任务可完成时直接给出最终回答。'
  const messages = [ { role: 'system', content: '你是客服与产品顾问。\n你将获得结构化事实（JSON）。请基于事实简洁回答，包含要点，避免臆断。低置信度时建议补充信息或转人工。\n如需外部事实，请参考随后的工具说明与触发示例。' }, { role: 'system', content: toolSystemMsg }, { role: 'system', content: sysReasoningMsg }, ...history.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: userInput } ]
  const maxStepsRaw = (info && (info.reasoningMaxSteps ?? info.maxReasoningSteps)) ?? (cfg && cfg.reasoningMaxSteps)
  const REASON_MAX_STEPS = Math.max(1, Math.min(8, Number(maxStepsRaw) || 3))
  const runId = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`
  const { reply, messages: finalMessages, toolCalls, steps, events } = await reasoningLoop(baseURL, apiKey, model, messages, REASON_MAX_STEPS, runId, onEvent)
  const baseLen = messages.length
  const newSegments = (finalMessages || []).slice(baseLen).filter(m => m.role === 'assistant' || m.role === 'user')
  const updatedHistory = [...history, { role: 'user', content: userInput }, ...newSegments]
  const trimmed = updatedHistory.slice(-MAX_TURNS * 2)
  sessionHistories.set(sessionId, trimmed)
  if (onEvent) {
    const finalEvt = { messageType: 'assistant_final', runId, step: steps, timestamp: Date.now(), reply, citations: [] }
    try { onEvent(finalEvt) } catch {}
  }
  return { reply, citations: [], events }
}

