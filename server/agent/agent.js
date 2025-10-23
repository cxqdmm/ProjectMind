import "dotenv/config";
import OpenAI from "openai";
import { queryProductInfoFunc } from "./tools/queryProductInfo.js";
import { queryFAQPolicyFunc } from "./tools/queryFAQPolicy.js";
import { executeMCPPlan } from "../mcp/router.js";
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

const systemPrompt = `你是客服与产品顾问。\n你将获得结构化事实（JSON）。请基于事实简洁回答，包含要点，避免臆断。低置信度时建议补充信息或转人工。`;

// 已移除 LLM 调用超时逻辑，直接使用 llm.invoke(prompt)
export async function runAgent(userInput, options = {}) {
  const sessionId = String(options?.sessionId || 'default');
  const intent = classifyIntent(userInput);
  console.log(`[agent] sid=${sessionId} intent=${intent} text="${String(userInput).slice(0,80)}${String(userInput).length>80?'…':''}"`);
  let payload = {};
  try {
    if (intent === "product") {
      payload.product = JSON.parse(await queryProductInfoFunc(userInput));
    } else if (intent === "complaint") {
      payload.faq = JSON.parse(await queryFAQPolicyFunc(userInput));
    }
    // MCP 计划与执行
    const mcpFacts = await executeMCPPlan(userInput);
    if (mcpFacts?.length) payload.mcp = mcpFacts;
    console.log(`[agent] payloadKeys=${Object.keys(payload).join(',')} mcpFacts=${mcpFacts?.length || 0}`);
  } catch (e) {
    console.warn(`[agent] payloadBuildError sid=${sessionId}`, e);
  }

  try {
    // 记录配置（仅 Qwen 直连）
    const cfg = loadLLMConfig();
    const info = cfg.qwen || {};
    const baseURL = info.baseURL || info.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const apiKey = info.apiKey || process.env.DASHSCOPE_API_KEY || '';
    const model = info.model || 'qwen-plus';
    console.log(`[agent] qwen direct config baseURL=${baseURL} model=${model}`);

    const facts = JSON.stringify(payload);
    // 简易会话记忆：在 Map 中保存最近 n 轮消息并拼接到提示词
    const maxTurnsRaw = (info && (info.historyMaxTurns ?? info.maxHistoryTurns)) ?? (cfg && cfg.historyMaxTurns) ?? process.env.PM_HISTORY_MAX_TURNS;
    const MAX_TURNS = Math.max(0, Math.min(50, Number(maxTurnsRaw) || 12));
    const history = sessionHistories.get(sessionId) || [];
    const historyText = history.map(m => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`).join('\n');
    const prompt = `${systemPrompt}\n历史：\n${historyText}\n用户提问：${userInput}\n事实：${facts}\n输出：中文回答，保留关键数字/条款，必要时给出建议。`;
    console.log(`[agent] invoking qwen sid=${sessionId} historyTurns=${(history.length/2)|0} maxTurns=${MAX_TURNS} factsLen=${facts.length}`);
    const t0 = Date.now();
    let reply = '';
    const client = new OpenAI({ apiKey, baseURL });
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userInput }
    ];
    console.log(messages)
    const completion = await client.chat.completions.create({ model, messages });
    reply = String(completion?.choices?.[0]?.message?.content || '');
    const t1 = Date.now();
    console.log(`[agent] llm done sid=${sessionId} ms=${t1 - t0}`);
    // 维护历史
    history.push({ role: 'user', content: userInput });
    history.push({ role: 'assistant', content: reply });
    // 只保留最近 MAX_TURNS*2 条（每轮2条）
    const trimmed = history.slice(-MAX_TURNS * 2);
    sessionHistories.set(sessionId, trimmed);
    // smartTemplate 暂不使用，统一返回空引用
    return { reply, citations: [] };
  } catch (e) {
    console.error(`[agent] llmInvokeError sid=${sessionId}`, e);
    return { reply: '抱歉，我暂时无法回答这个问题。', citations: [] };
  }
}