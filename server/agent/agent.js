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
    return cfg || {};
  } catch (_) {
    return {};
  }
}

// getLLM 已移除：统一采用 OpenAI SDK 兼容模式直连 Qwen

const systemPrompt = `你是客服与产品顾问。\n你将获得结构化事实（JSON）。请基于事实简洁回答，包含要点，避免臆断。低置信度时建议补充信息或转人工。\n\n可用外部工具（由系统提供能力，触发由你决定）：\n- 文本触发：CALL: <provider>.<tool> <JSON输入>\n- JSON触发：CALL_JSON: {\"provider\":\"policy\",\"tool\":\"basic_info\",\"input\":{...}}\n- 示例：CALL: policy.basic_info {\"policyId\": \"POLICY-001\"}\n- 你只在确有需要时触发工具，避免无谓调用。`;

function parseToolCall(text) {
  const s = String(text || "");
  // JSON 触发形式：CALL_JSON: { provider, tool, input }
  const mj = s.match(/CALL_JSON:\s*(\{[\s\S]*\})/i);
  if (mj) {
    try {
      const obj = JSON.parse(mj[1]);
      let provider = String(obj.provider || "").trim();
      let toolName = String(obj.tool || "").trim();
      const input = obj.input ?? {};
      // 允许 tool 写成 'provider.tool' 或仅写 'tool'，此处统一解析
      if (toolName.includes(".")) {
        const parts = toolName.split(".");
        provider = provider || parts[0];
        toolName = parts.slice(1).join(".");
      }
      const normalized = (provider && toolName)
        ? `${provider}.${toolName.replace(new RegExp(`^${provider}\.`), "")}`
        : (provider || toolName);
      return { provider, tool: normalized, toolName, input };
    } catch (_) {
      return null;
    }
  }
  // 文本触发形式：CALL: provider.tool { ... }
  const m = s.match(/CALL:\s*([\w.-]+)\s*(\{[\s\S]*\})/i);
  if (!m) return null;
  const full = m[1];
  const parts = full.split(".");
  const provider = parts[0];
  const toolSuffix = parts.slice(1).join(".");
  const normalizedTool = toolSuffix ? `${provider}.${toolSuffix.replace(new RegExp(`^${provider}\.`), "")}` : provider;
  try {
    const input = JSON.parse(m[2]);
    return { provider, tool: normalizedTool, toolName: normalizedTool.split(".").slice(1).join("."), input };
  } catch (_) {
    return null;
  }
}

function clip(s, n = 400) {
  const str = String(s || "");
  if (str.length <= n) return str;
  return str.slice(0, n) + `…(${str.length}字符)`;
}

export async function runAgent(userInput, options = {}) {
  const sessionId = String(options?.sessionId || 'default');
  const intent = classifyIntent(userInput);
  console.log(`[代理] 会话=${sessionId} 意图=${intent} 文本片段="${String(userInput).slice(0,80)}${String(userInput).length>80?'…':''}"`);
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
    const apiKey = info.apiKey || process.env.DASHSCOPE_API_KEY || '';
    const model = info.model || 'qwen-plus';
    console.log(`[代理] LLM配置 baseURL=${baseURL} model=${model}`);

    const facts = JSON.stringify(payload);
    const maxTurnsRaw = (info && (info.historyMaxTurns ?? info.maxHistoryTurns)) ?? (cfg && cfg.historyMaxTurns) ?? process.env.PM_HISTORY_MAX_TURNS;
    const MAX_TURNS = Math.max(0, Math.min(50, Number(maxTurnsRaw) || 12));
    const history = sessionHistories.get(sessionId) || [];
    const tools = (payload.tools || []);
    const toolSystemMsg = buildToolSystemJSON(tools);
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: toolSystemMsg },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userInput }
    ];
    console.log(messages);
    const client = new OpenAI({ apiKey, baseURL });
    const t0 = Date.now();
    let completion = await client.chat.completions.create({ model, messages });
    let reply = String(completion?.choices?.[0]?.message?.content || '');
    console.log(`[代理] 首次回复耗时=${Date.now() - t0}ms`);
    console.log(`[代理] 首次回复内容：${reply}`)
    console.log(`[代理] 工具调用：${clip(reply)}`);

    const call = parseToolCall(reply);
    if (call) {
      console.log(`[代理] 检测到工具调用：${call.provider}.${call.toolName}`);
      console.log(`[代理] 工具输入：${JSON.stringify(call.input)}`);
      const inv = await invokeMCPTool(call.provider, call.tool, call.input);
      const toolResult = inv?.result ?? inv;
      console.log(`[代理] 工具结果预览：${clip(JSON.stringify(toolResult))}`);
      const messages2 = [
        ...messages,
        { role: 'assistant', content: reply },
        { role: 'user', content: `工具(${call.provider}.${call.toolName})结果：${JSON.stringify(toolResult)}` }
      ];
      const t1 = Date.now();
      completion = await client.chat.completions.create({ model, messages: messages2 });
      reply = String(completion?.choices?.[0]?.message?.content || '');

      console.log(`[代理] 最终回复耗时=${Date.now() - t1}ms`);
      console.log(`[代理] 最终回复内容：${clip(reply)}`);
    }

    history.push({ role: 'user', content: userInput });
    history.push({ role: 'assistant', content: reply });
    const trimmed = history.slice(-MAX_TURNS * 2);
    sessionHistories.set(sessionId, trimmed);
    return { reply, citations: [] };
  } catch (e) {
    console.error(`[代理] LLM调用异常 会话=${sessionId}`, e);
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
      description: (inputProps[k] && inputProps[k].description) || ''
    }));
    const outProps = outputSchema.properties || {};
    const out = Object.keys(outProps).map(k => ({
      name: k,
      type: (outProps[k] && outProps[k].type) || 'any',
      description: (outProps[k] && outProps[k].description) || ''
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
    }
  };
  const obj = {
    messageType: "mcp_tools",
    tools: items,
    trigger
  };
  return JSON.stringify(obj, null, 2);
}