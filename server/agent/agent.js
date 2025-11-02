import "dotenv/config";
import OpenAI from "openai";
import { getMCPCapabilities } from "../mcp/router.js";
import { invokeMCPTool } from "../mcp/client.js";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
// 会话记忆改为自管内存映射，避免 @langchain/core 路径导出问题
const sessionHistories = new Map();

// const tools = [] // 工具改为普通函数调用，不再使用 LangChain Tool 包装

function classifyIntent(text) {
  const t = String(text || "").toLowerCase();
  const productHints = ["产品", "规格", "配置", "价格", "收费", "套餐", "功能", "版本", "pro", "lite"];
  const complaintHints = ["投诉", "客诉", "售后", "质保", "保修", "退款", "退费", "人工", "客服", "电话"];
  const hasProduct = productHints.some((k) => t.includes(k));
  const hasComplaint = complaintHints.some((k) => t.includes(k));
  if (hasComplaint && !hasProduct) return "complaint";
  if (hasProduct) return "product";
  return "other";
}


function expandEnvPlaceholders(obj) {
  if (obj && typeof obj === 'object') {
    const out = Array.isArray(obj) ? [] : {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = expandEnvPlaceholders(v);
    }
    return out;
  }
  if (typeof obj === 'string') {
    const m = obj.match(/^\$\{?([A-Z0-9_]+)\}?$/i);
    if (m) {
      const key = m[1];
      return process.env[key] || '';
    }
  }
  return obj;
}

function loadLLMConfig() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const configPath = path.resolve(__dirname, "../config/llm.json");
  const require = createRequire(import.meta.url);
  try {
    // 强制绕过 require 缓存，确保获取到最新配置
    delete require.cache[require.resolve(configPath)];
  } catch (_) {}
  try {
    const cfg = require(configPath);
    return expandEnvPlaceholders(cfg || {});
  } catch (_) {
    return {};
  }
}

// getLLM 已移除：统一采用 OpenAI SDK 兼容模式直连 Qwen

const systemPrompt = `你是客服与产品顾问。\n你将获得结构化事实（JSON）。请基于事实简洁回答，包含要点，避免臆断。低置信度时建议补充信息或转人工。\n如需外部事实，请参考随后的工具说明与触发示例。`;

function parseToolCalls(text) {
  const s = String(text || "");
  const out = [];
  // JSON 批量触发：CALL_JSONS: [ { provider, tool, input }, ... ]
  const mjArr = s.match(/CALL_JSONS:\s*(\[[\s\S]*\])/i);
  if (mjArr) {
    try {
      const arr = JSON.parse(mjArr[1]);
      if (Array.isArray(arr)) {
        for (const obj of arr) {
          let provider = String(obj?.provider || "").trim();
          let toolName = String(obj?.tool || "").trim();
          const input = obj?.input ?? {};
          if (toolName.includes(".")) {
            const parts = toolName.split(".");
            provider = provider || parts[0];
            toolName = parts.slice(1).join(".");
          }
          const normalized = (provider && toolName)
            ? `${provider}.${toolName.replace(new RegExp(`^${provider}\.`), "")}`
            : (provider || toolName);
          out.push({ provider, tool: normalized, toolName, input });
        }
      }
    } catch (_) {}
  }
  // 单个 JSON 触发：沿用 parseToolCall
  try {
    const single = parseToolCall(s);
    if (single) out.push(single);
  } catch (_) {}
  // 多行文本触发：支持同一消息中多条 CALL: ...
  const re = /CALL:\s*([\w.-]+)\s*(\{[\s\S]*?\})/ig;
  let m;
  while ((m = re.exec(s))) {
    const full = m[1];
    const parts = full.split(".");
    const provider = parts[0];
    const toolSuffix = parts.slice(1).join(".");
    const normalizedTool = toolSuffix ? `${provider}.${toolSuffix.replace(new RegExp(`^${provider}\.`), "")}` : provider;
    try {
      const input = JSON.parse(m[2]);
      const toolName = normalizedTool.split(".").slice(1).join(".");
      out.push({ provider, tool: normalizedTool, toolName, input });
    } catch (_) {}
  }
  // 去重同一 provider/tool/input 的重复项
  const dedup = [];
  const seen = new Set();
  for (const c of out) {
    const key = `${c.provider}|${c.tool}|${JSON.stringify(c.input)}`;
    if (!seen.has(key)) {
      seen.add(key);
      dedup.push(c);
    }
  }
  return dedup;
}

function clip(s, n = 400) {
  const str = String(s || "");
  if (str.length <= n) return str;
  return str.slice(0, n) + `…(${str.length}字符)`;
}

// 迭代推理与工具调用循环：每步先询问是否需要工具，若需要则调用并继续；否则结束
async function reasoningLoop(client, model, baseMessages, maxSteps = 3, runId = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`, onEvent = null) {
  let messages = [...baseMessages];
  let reply = '';
  let toolCalls = 0;
  const events = [];
  for (let step = 1; step <= maxSteps; step++) {
    const t = Date.now();
    const completion = await client.chat.completions.create({ model, messages });
    reply = String(completion?.choices?.[0]?.message?.content || '');
    console.log(`[推理] step=${step} ms=${Date.now()-t} reply=${clip(reply)}`);
    const calls = parseToolCalls(reply) || [];
    if (calls.length > 0) {
      const ts = Date.now();
      const callsWithId = calls.map((c, i) => ({
        ...c,
        id: `t${ts.toString(36)}${Math.random().toString(36).slice(2,6)}${i}`,
        startedAt: ts
      }));
      const startEvent = {
        messageType: 'tool_calls',
        runId,
        step,
        timestamp: ts,
        calls: callsWithId.map(c => ({
          id: c.id,
          provider: c.provider,
          tool: c.tool,
          toolName: c.toolName,
          name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool,
          status: 'started',
          inputPreview: clip(JSON.stringify(c.input), 300),
          startedAt: c.startedAt,
          render: { variant: 'card', progress: true, collapsible: true }
        }))
      };
      events.push(startEvent);
      if (onEvent) try { onEvent(startEvent); } catch (_) {}
      for (const c of callsWithId) {
        const runningEvt = {
          messageType: 'tool_update',
          runId,
          step,
          timestamp: Date.now(),
          id: c.id,
          provider: c.provider,
          tool: c.tool,
          toolName: c.toolName,
          name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool,
          status: 'running',
          progress: null,
          startedAt: c.startedAt,
          render: { badge: 'processing' }
        };
        events.push(runningEvt);
        if (onEvent) try { onEvent(runningEvt); } catch (_) {}
      }
      const results = await Promise.all(callsWithId.map(async (c) => {
        const startedAt = Date.now();
        try {
          const inv = await invokeMCPTool(c.provider, c.tool, c.input);
          const toolResult = inv?.result ?? inv;
          const completedAt = Date.now();
          const evt = {
            messageType: 'tool_update',
            runId,
            step,
            timestamp: completedAt,
            id: c.id,
            provider: c.provider,
            tool: c.tool,
            toolName: c.toolName,
            name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool,
            status: 'completed',
            result: toolResult,
            preview: clip(JSON.stringify(toolResult), 500),
            startedAt,
            completedAt,
            durationMs: completedAt - c.startedAt,
            render: { badge: 'success' }
          };
          events.push(evt);
          if (onEvent) try { onEvent(evt); } catch (_) {}
          return { ...c, ok: true, result: toolResult };
        } catch (e) {
          const completedAt = Date.now();
          const errPayload = { message: String(e?.message || e) };
          const evt = {
            messageType: 'tool_update',
            runId,
            step,
            timestamp: completedAt,
            id: c.id,
            provider: c.provider,
            tool: c.tool,
            toolName: c.toolName,
            name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool,
            status: 'failed',
            error: errPayload,
            startedAt,
            completedAt,
            durationMs: completedAt - c.startedAt,
            render: { badge: 'error' }
          };
          events.push(evt);
          if (onEvent) try { onEvent(evt); } catch (_) {}
          return { ...c, ok: false, error: errPayload.message };
        }
      }));
      const preview = results.map(r => `${r.provider}.${r.toolName}: ${clip(JSON.stringify(r.ok ? r.result : { error: r.error }))}`).join(' | ');
      console.log(`[推理] 批量工具结果预览：${preview}`);
      const userContent = results.map(r => {
        const payload = r.ok ? r.result : { error: r.error };
        return `工具(${r.provider}.${r.toolName})结果：${JSON.stringify(payload)}`;
      }).join('\n');
      messages = [
        ...messages,
        { role: 'assistant', content: reply },
        { role: 'user', content: userContent }
      ];
      toolCalls += calls.length;
      continue;
    }
    messages = [...messages, { role: 'assistant', content: reply }];
    return { reply, messages, toolCalls, steps: step, events };
  }
  const completion = await client.chat.completions.create({ model, messages: [...messages, { role: 'user', content: '请根据已有信息给出最终简洁回答。' }] });
  reply = String(completion?.choices?.[0]?.message?.content || '');
  messages = [...messages, { role: 'assistant', content: reply }];
  return { reply, messages, toolCalls, steps: maxSteps, events };
}

export async function runAgentStream(userInput, options = {}, onEvent) {
  const sessionId = String(options?.sessionId || 'default');
  const intent = classifyIntent(userInput);
  console.log(`[代理][SSE] 会话=${sessionId} 意图=${intent} 文本片段="${String(userInput).slice(0,80)}${String(userInput).length>80?'…':''}"`);
  let payload = {};
  try {
    const caps = getMCPCapabilities();
    payload.tools = caps;
    console.log(`[代理] 构建事实完成 字段=${Object.keys(payload).join(',')} 可用工具数量=${caps.length}`);
  } catch (e) {
    console.warn(`[代理] 构建事实异常 会话=${sessionId}`, e);
  }
  try {
    const cfg = loadLLMConfig();
    const info = cfg.qwen || {};
    const baseURL = info.baseURL || info.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const apiKey = info.apiKey || process.env.DASHSCOPE_API_KEY || process.env.Qwen_API_KEY || '';
    const model = info.model || 'qwen-plus';
    const facts = JSON.stringify(payload);
    const maxTurnsRaw = (info && (info.historyMaxTurns ?? info.maxHistoryTurns)) ?? (cfg && cfg.historyMaxTurns) ?? process.env.PM_HISTORY_MAX_TURNS;
    const MAX_TURNS = Math.max(0, Math.min(50, Number(maxTurnsRaw) || 12));
    const history = sessionHistories.get(sessionId) || [];
    const tools = (payload.tools || []);
    const toolSystemMsg = buildToolSystemJSON(tools);
    const sysReasoningMsg = "指令：采用逐步推理，每步判断是否需要工具（CALL/CALL_JSON）。当任务可完成时直接给出最终回答。";
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: toolSystemMsg },
      { role: 'system', content: sysReasoningMsg },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userInput }
    ];
    const maxStepsRaw = (info && (info.reasoningMaxSteps ?? info.maxReasoningSteps)) ?? (cfg && cfg.reasoningMaxSteps) ?? process.env.PM_MAX_REASONING_STEPS;
    const REASON_MAX_STEPS = Math.max(1, Math.min(8, Number(maxStepsRaw) || 3));
    const client = new OpenAI({ apiKey, baseURL });
    const runId = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
    const { reply, messages: finalMessages, toolCalls, steps } = await reasoningLoop(client, model, messages, REASON_MAX_STEPS, runId, onEvent);
    const baseLen = messages.length;
    const newSegments = (finalMessages || []).slice(baseLen).filter(m => m.role === 'assistant' || m.role === 'user');
    const updatedHistory = [...history, { role: 'user', content: userInput }, ...newSegments];
    const trimmed = updatedHistory.slice(-MAX_TURNS * 2);
    sessionHistories.set(sessionId, trimmed);
    if (onEvent) {
      const finalEvt = { messageType: 'assistant_final', runId, step: steps, timestamp: Date.now(), reply, citations: [] };
      try { onEvent(finalEvt); } catch (_) {}
    }
    return { reply, citations: [] };
  } catch (e) {
    if (onEvent) {
      const errEvt = { messageType: 'assistant_final', error: String(e?.message || e), timestamp: Date.now() };
      try { onEvent(errEvt); } catch (_) {}
    }
    return { reply: '抱歉，我暂时无法回答这个问题。', citations: [] };
  }
}

function buildToolSystemJSON(tools) {
  const items = (tools || []).map(t => {
    const provider = t.provider || '';
    const rawTool = t.tool || '';
    let name = t.name;
    if (!name) {
      if (provider && rawTool) {
        name = rawTool.startsWith(`${provider}.`) ? rawTool : `${provider}.${rawTool}`;
      } else {
        name = rawTool || provider;
      }
    }
    const desc = t.description || '';
    const inputSchema = t.inputSchema || t.input || {};
    const outputSchema = t.outputSchema || t.output || {};
    const inputProps = inputSchema.properties || {};
    const required = inputSchema.required || [];
    const props = Object.keys(inputProps).map(k => ({
      name: k,
      type: (inputProps[k] && inputProps[k].type) || 'any',
      required: required.includes(k),
      description: (inputProps[k] && inputProps[k].description) || '',
      enum: Array.isArray(inputProps[k]?.enum) ? inputProps[k].enum : undefined
    }));
    const outProps = outputSchema.properties || {};
    const out = Object.keys(outProps).map(k => ({
      name: k,
      type: (outProps[k] && outProps[k].type) || 'any',
      description: (outProps[k] && outProps[k].description) || '',
      enum: Array.isArray(outProps[k]?.enum) ? outProps[k].enum : undefined
    }));
    return {
      name,
      description: desc,
      input: { properties: props },
      output: { properties: out }
    };
  });
  const trigger = {
    text: {
      format: "CALL: <provider>.<tool> <JSON输入>",
      example: "CALL: policy.basic_info {\"policyId\": \"POLICY-001\"}"
    },
    json: {
      format: "CALL_JSON: {\"provider\":\"<provider>\",\"tool\":\"<tool>\",\"input\":{...}}",
      example: "CALL_JSON: {\"provider\":\"policy\",\"tool\":\"basic_info\",\"input\":{\"policyId\":\"POLICY-001\"}}"
    },
    batch: {
      text: {
        format: "同一消息可写多行 CALL 以并行触发",
        example: "CALL: policy.basic_info {\"policyId\":\"POLICY-001\"}\nCALL: project.intro {\"name\":\"高端员福\"}"
      },
      json: {
        format: "CALL_JSONS: [{\"provider\":\"<provider>\",\"tool\":\"<tool>\",\"input\":{...}}, ...]",
        example: "CALL_JSONS: [{\"provider\":\"policy\",\"tool\":\"basic_info\",\"input\":{\"policyId\":\"POLICY-001\"}},{\"provider\":\"project\",\"tool\":\"intro\",\"input\":{\"name\":\"高端员福\"}}]"
      }
    }
  };
  const obj = {
    messageType: "mcp_tools",
    tools: items,
    trigger
  };
  return JSON.stringify(obj, null, 2);
}