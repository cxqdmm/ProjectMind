// 会话级历史，用于截断与上下文保留
const sessionHistories = new Map();

// 仅解析批量 CALL_JSONS 为 { provider, tool, toolName, input } 数组

// 解析消息中可能出现的多条工具调用（含批量 CALL_JSONS）
function parseToolCalls(text) {
  const s = String(text || "");
  const out = [];
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
          const normalized =
            provider && toolName
              ? `${provider}.${toolName.replace(
                  new RegExp(`^${provider}\.`),
                  ""
                )}`
              : provider || toolName;
          out.push({ provider, tool: normalized, toolName, input });
        }
      }
    } catch {}
  }
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

// 文本裁剪，避免事件里过长预览
function clip(s, n = 400) {
  const str = String(s || "");
  if (str.length <= n) return str;
  return str.slice(0, n) + `…(${str.length}字符)`;
}

// 简单 JSON 资源加载（用于配置，如 llm.json）
async function loadJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`load ${url} failed`);
  return r.json();
}

import { loadSkillsManifest, loadAllSkillsMeta } from "./skillsRuntime.js";
import { createProvider } from "./providers.js";
import { SYS_REASONING_MSG } from "./systemPrompt.js";

// 调用本地工具路由器：provider.tool → LOCAL_MCP_TOOLS 映射
async function invokeMCPTool(provider, tool, input) {
  const full = tool && tool.includes(".") ? tool : `${provider}.${tool}`;
  if (provider === "skill") {
    const { loadSkillByName, fetchSkillReference } = await import(
      "./skillsRuntime.js"
    );
    const name = String(input?.skill || "");
    if (!name) throw new Error("skill required");
    if (full.startsWith("skill.load")) {
      const s = await loadSkillByName(name);
      return { result: { key: s.key, meta: s.meta, body: s.body } };
    }
    if (full.startsWith("skill.loadReference")) {
      const files = Array.isArray(input?.files)
        ? input.files
        : input?.file
        ? [input.file]
        : [];
      const extras = [];
      for (const f of files) {
        try {
          const ex = await fetchSkillReference(name, String(f));
          extras.push(ex);
        } catch {}
      }
      return { result: { key: name, extras } };
    }
    if (full.startsWith("skill.execute")) {
      const s = await loadSkillByName(name);
      const toolName = String(input?.tool || "tool");
      let run = null;
      try {
        const mod = await import(
          /* @vite-ignore */ `../skills/${name}/scripts/${toolName}.js`
        );
        run = typeof mod?.run === "function" ? mod.run : null;
      } catch {}
      const args = input?.args || {};
      const result = run ? await Promise.resolve(run(args)) : null;
      return {
        result: { key: name, tool: toolName, args, body: s.body, result },
      };
    }
    throw new Error(`tool ${full} not found`);
  }
  throw new Error(`provider ${provider} not supported`);
}

// 将工具集合转换为系统提示中的结构化“工具说明”JSON文本
function buildToolSystemJSON(tools) {
  const items = (tools || []).map((t) => {
    const provider = t.provider || "";
    const rawTool = t.tool || "";
    let name = t.name;
    if (!name) {
      if (provider && rawTool) {
        name = rawTool.startsWith(`${provider}.`)
          ? rawTool
          : `${provider}.${rawTool}`;
      } else {
        name = rawTool || provider;
      }
    }
    const desc = t.description || "";
    const inputSchema = t.inputSchema || t.input || {};
    const outputSchema = t.outputSchema || t.output || {};
    const inputProps = inputSchema.properties || {};
    const required = inputSchema.required || [];
    const props = Object.keys(inputProps).map((k) => ({
      name: k,
      type: (inputProps[k] && inputProps[k].type) || "any",
      required: required.includes(k),
      description: (inputProps[k] && inputProps[k].description) || "",
      enum: Array.isArray(inputProps[k]?.enum) ? inputProps[k].enum : undefined,
    }));
    const outProps = outputSchema.properties || {};
    const out = Object.keys(outProps).map((k) => ({
      name: k,
      type: (outProps[k] && outProps[k].type) || "any",
      description: (outProps[k] && outProps[k].description) || "",
      enum: Array.isArray(outProps[k]?.enum) ? outProps[k].enum : undefined,
    }));
    return {
      name,
      description: desc,
      input: { properties: props },
      output: { properties: out },
    };
  });
  const trigger = {
    format:
      'CALL_JSONS: [{"provider":"skill","tool":"<load|loadReference|execute>","input":{...}}, ...]',
  };
  const obj = { messageType: "mcp_tools", tools: items, trigger };
  return JSON.stringify(obj, null, 2);
}

// 统一 provider.chat 接口为仿 OpenAI 输出格式
async function createChatReply(provider, apiKey, messages) {
  const content = await provider.chat(messages, apiKey);
  return { choices: [{ message: { content } }] };
}

// 推理主循环：逐步生成 → 解析工具调用 → 执行 → 注入上下文
async function reasoningLoop(provider, apiKey, baseMessages, runId, onEvent) {
  let messages = [...baseMessages];
  let reply = "";
  let toolCalls = 0;
  const events = [];
  try {
    // 步0：支持用户消息中直接包含 CALL_JSONS，先执行一次
    const lastMsg = messages[messages.length - 1];
    const primCalls = parseToolCalls(lastMsg?.content || "");
    if (primCalls.length > 0) {
      const ts = Date.now();
      const callsWithId = primCalls.map((c, i) => ({
        ...c,
        id: `t${ts.toString(36)}${Math.random().toString(36).slice(2, 6)}${i}`,
        startedAt: ts,
      }));
      // 事件：开始执行工具
      const startEvent = {
        messageType: "tool_calls",
        runId,
        step: 0,
        timestamp: ts,
        calls: callsWithId.map((c) => ({
          id: c.id,
          provider: c.provider,
          tool: c.tool,
          toolName: c.toolName,
          name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool,
          status: "started",
          inputPreview: clip(JSON.stringify(c.input), 300),
          startedAt: c.startedAt,
          render: { variant: "card", progress: true, collapsible: true },
        })),
      };
      events.push(startEvent);
      if (onEvent)
        try {
          onEvent(startEvent);
        } catch {}
      const results = await Promise.all(
        callsWithId.map(async (c) => {
          const startedAt = Date.now();
          try {
            const inv = await invokeMCPTool(c.provider, c.tool, c.input);
            const toolResult = inv?.result ?? inv;
            const completedAt = Date.now();
            // 事件：工具完成，包含预览
            const evt = {
              messageType: "tool_update",
              runId,
              step: 0,
              timestamp: completedAt,
              id: c.id,
              provider: c.provider,
              tool: c.tool,
              toolName: c.toolName,
              name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool,
              status: "completed",
              result: toolResult,
              preview: clip(JSON.stringify(toolResult), 500),
              startedAt,
              completedAt,
              durationMs: completedAt - c.startedAt,
              render: { badge: "success" },
            };
            events.push(evt);
            if (onEvent)
              try {
                onEvent(evt);
              } catch {}
            return { ...c, ok: true, result: toolResult };
          } catch (e) {
            const completedAt = Date.now();
            const errPayload = {
              code: "TOOL_ERROR",
              message: String(e?.message || e),
            };
            // 事件：工具失败
            const evt = {
              messageType: "tool_update",
              runId,
              step: 0,
              timestamp: completedAt,
              id: c.id,
              provider: c.provider,
              tool: c.tool,
              toolName: c.toolName,
              name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool,
              status: "failed",
              error: errPayload,
              startedAt,
              completedAt,
              durationMs: completedAt - c.startedAt,
              render: { badge: "error" },
            };
            events.push(evt);
            if (onEvent)
              try {
                onEvent(evt);
              } catch {}
            return { ...c, ok: false, error: errPayload.message };
          }
        })
      );
      // 将技能正文与资源注入到系统消息，其它工具结果以摘要形式反馈
      const skillMsgs = [];
      const otherSummaries = [];
      for (const r of results) {
        if (r.ok && r.tool.startsWith("skill.load")) {
          const body = String(r.result?.body || "");
          const extras = Array.isArray(r.result?.extras) ? r.result.extras : [];
          if (body) skillMsgs.push({ role: "system", content: body });
          for (const ex of extras) {
            const name = String(ex?.file || "");
            const content = String(ex?.content || "");
            if (content)
              skillMsgs.push({
                role: "system",
                content: name ? `${name}\n${content}` : content,
              });
          }
          const loadedKey = String(r.result?.key || "");
          const loadedFiles = extras
            .map((ex) => String(ex?.file || ""))
            .filter(Boolean);
          otherSummaries.push(
            `工具(${r.provider}.${r.toolName})加载完成：${JSON.stringify({
              key: loadedKey,
              files: loadedFiles,
            })}`
          );
        } else if (r.ok && r.tool.startsWith("skill.loadReference")) {
          const extras = Array.isArray(r.result?.extras) ? r.result.extras : [];
          for (const ex of extras) {
            const name = String(ex?.file || "");
            const content = String(ex?.content || "");
            if (content)
              skillMsgs.push({
                role: "system",
                content: name ? `${name}\n${content}` : content,
              });
          }
          const loadedFiles = extras
            .map((ex) => String(ex?.file || ""))
            .filter(Boolean);
          otherSummaries.push(
            `工具(${r.provider}.${r.toolName})加载完成：${JSON.stringify({
              files: loadedFiles,
            })}`
          );
        } else if (r.ok && r.tool.startsWith("skill.execute")) {
          const body = String(r.result?.body || "");
          if (body) skillMsgs.push({ role: "system", content: body });
          const payload = r.result;
          otherSummaries.push(
            `工具(${r.provider}.${r.toolName})结果：${JSON.stringify(payload)}`
          );
        } else {
          const payload = r.ok ? r.result : { error: r.error };
          otherSummaries.push(
            `工具(${r.provider}.${r.toolName})结果：${JSON.stringify(payload)}`
          );
        }
      }
      messages = [
        ...messages,
        ...skillMsgs,
        ...(otherSummaries.length
          ? [{ role: "assistant", content: otherSummaries.join("\n") }]
          : []),
      ];
      toolCalls += primCalls.length;
      reply = otherSummaries.join("\n");
      return { reply, messages, toolCalls, steps: 0, events };
    }
  } catch {}
  // 步1..N：逐步推理；每步检查是否有新工具调用（仅支持 CALL_JSONS）
  let step = 1;
  while (true) {
    const completion = await createChatReply(provider, apiKey, messages);
    reply = String(completion?.choices?.[0]?.message?.content || "");
    const calls = parseToolCalls(reply) || [];
    if (calls.length > 0) {
      const ts = Date.now();
      const callsWithId = calls.map((c, i) => ({
        ...c,
        id: `t${ts.toString(36)}${Math.random().toString(36).slice(2, 6)}${i}`,
        startedAt: ts,
      }));
      // 事件：开始执行工具（step>0）
      const startEvent = {
        messageType: "tool_calls",
        runId,
        step,
        timestamp: ts,
        calls: callsWithId.map((c) => ({
          id: c.id,
          provider: c.provider,
          tool: c.tool,
          toolName: c.toolName,
          name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool,
          status: "started",
          inputPreview: clip(JSON.stringify(c.input), 300),
          startedAt: c.startedAt,
          render: { variant: "card", progress: true, collapsible: true },
        })),
      };
      events.push(startEvent);
      if (onEvent)
        try {
          onEvent(startEvent);
        } catch {}
      for (const c of callsWithId) {
        // 事件：工具运行中
        const runningEvt = {
          messageType: "tool_update",
          runId,
          step,
          timestamp: Date.now(),
          id: c.id,
          provider: c.provider,
          tool: c.tool,
          toolName: c.toolName,
          name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool,
          status: "running",
          progress: null,
          startedAt: c.startedAt,
          render: { badge: "processing" },
        };
        events.push(runningEvt);
        if (onEvent)
          try {
            onEvent(runningEvt);
          } catch {}
      }
      const results = await Promise.all(
        callsWithId.map(async (c) => {
          const startedAt = Date.now();
          try {
            const inv = await invokeMCPTool(c.provider, c.tool, c.input);
            const toolResult = inv?.result ?? inv;
            const completedAt = Date.now();
            // 事件：工具完成（step>0）
            const evt = {
              messageType: "tool_update",
              runId,
              step,
              timestamp: completedAt,
              id: c.id,
              provider: c.provider,
              tool: c.tool,
              toolName: c.toolName,
              name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool,
              status: "completed",
              result: toolResult,
              preview: clip(JSON.stringify(toolResult), 500),
              startedAt,
              completedAt,
              durationMs: completedAt - c.startedAt,
              render: { badge: "success" },
            };
            events.push(evt);
            if (onEvent)
              try {
                onEvent(evt);
              } catch {}
            return { ...c, ok: true, result: toolResult };
          } catch (e) {
            const completedAt = Date.now();
            const errPayload = {
              code: "TOOL_ERROR",
              message: String(e?.message || e),
            };
            // 事件：工具失败（step>0）
            const evt = {
              messageType: "tool_update",
              runId,
              step,
              timestamp: completedAt,
              id: c.id,
              provider: c.provider,
              tool: c.tool,
              toolName: c.toolName,
              name: c.toolName ? `${c.provider}.${c.toolName}` : c.tool,
              status: "failed",
              error: errPayload,
              startedAt,
              completedAt,
              durationMs: completedAt - c.startedAt,
              render: { badge: "error" },
            };
            events.push(evt);
            if (onEvent)
              try {
                onEvent(evt);
              } catch {}
            return { ...c, ok: false, error: errPayload.message };
          }
        })
      );
      // 注入技能正文/资源与结果摘要，继续下一步推理
      const skillMsgs = [];
      const otherSummaries = [];
      for (const r of results) {
        if (r.ok && r.tool.startsWith("skill.load")) {
          const body = String(r.result?.body || "");
          const extras = Array.isArray(r.result?.extras) ? r.result.extras : [];
          if (body) skillMsgs.push({ role: "assistant", content: body });
          for (const ex of extras) {
            const name = String(ex?.file || "");
            const content = String(ex?.content || "");
            if (content)
              skillMsgs.push({
                role: "assistant",
                content: name ? `${name}\n${content}` : content,
              });
          }
          const loadedKey = String(r.result?.key || "");
          const loadedFiles = extras
            .map((ex) => String(ex?.file || ""))
            .filter(Boolean);
          otherSummaries.push(
            `工具(${r.provider}.${r.toolName})加载完成：${JSON.stringify({
              key: loadedKey,
              files: loadedFiles,
            })}`
          );
        } else if (r.ok && r.tool.startsWith("skill.loadReference")) {
          const extras = Array.isArray(r.result?.extras) ? r.result.extras : [];
          for (const ex of extras) {
            const name = String(ex?.file || "");
            const content = String(ex?.content || "");
            if (content)
              skillMsgs.push({
                role: "assistant",
                content: name ? `${name}\n${content}` : content,
              });
          }
          const loadedFiles = extras
            .map((ex) => String(ex?.file || ""))
            .filter(Boolean);
          otherSummaries.push(
            `工具(${r.provider}.${r.toolName})加载完成：${JSON.stringify({
              files: loadedFiles,
            })}`
          );
        } else if (r.ok && r.tool.startsWith("skill.execute")) {
          const body = String(r.result?.body || "");
          if (body) skillMsgs.push({ role: "assistant", content: body });
          const payload = r.result;
          otherSummaries.push(
            `工具(${r.provider}.${r.toolName})结果：${JSON.stringify(payload)}`
          );
        } else {
          const payload = r.ok ? r.result : { error: r.error };
          otherSummaries.push(
            `工具(${r.provider}.${r.toolName})结果：${JSON.stringify(payload)}`
          );
        }
      }
      messages = [
        ...messages,
        { role: "assistant", content: reply },
        ...skillMsgs,
        ...(otherSummaries.length
          ? [{ role: "user", content: otherSummaries.join("\n") }]
          : []),
      ];
      toolCalls += calls.length;
      step++;
      continue;
    }
    messages = [...messages, { role: "assistant", content: reply }];
    return { reply, messages, toolCalls, steps: step, events };
  }
}

// 浏览器代理入口：拼装工具与技能索引 → 构造系统消息 → 进入推理循环
export async function runAgentBrowser(userInput, options = {}, onEvent) {
  const sessionId = String(options?.sessionId || "default");
  const apiKey = String(options?.apiKey || "");
  let payload = { tools: [] };
  try {
    // 读取技能清单，生成技能相关工具（skill.load/skill.execute）的说明
    const manifest = await loadSkillsManifest();
    const skills = Array.isArray(manifest?.skills) ? manifest.skills : [];
    const skillTool = {
      provider: "skill",
      tool: "load",
      name: "skill.load",
      description: "加载并注入技能说明到上下文",
      inputSchema: {
        type: "object",
        properties: {
          skill: { type: "string", enum: skills.map((s) => s.key) },
        },
        required: ["skill"],
      },
      outputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          meta: { type: "object" },
          body: { type: "string" },
        },
      },
    };
    const skillLoadRefTool = {
      provider: "skill",
      tool: "loadReference",
      name: "skill.loadReference",
      description: "按需加载技能的参考资料文件并注入上下文",
      inputSchema: {
        type: "object",
        properties: {
          skill: { type: "string", enum: skills.map((s) => s.key) },
          file: { type: "string" },
          files: { type: "array", items: { type: "string" } },
        },
        required: ["skill"],
      },
      outputSchema: {
        type: "object",
        properties: { key: { type: "string" }, extras: { type: "array" } },
      },
    };
    const skillExecTool = {
      provider: "skill",
      tool: "execute",
      name: "skill.execute",
      description: "执行技能并返回技能正文与结果；用于生成约束或确定性计算",
      inputSchema: {
        type: "object",
        properties: {
          skill: { type: "string", enum: skills.map((s) => s.key) },
          tool: { type: "string", description: "脚本文件名" },
          args: { type: "object", description: "脚本入参对象" },
        },
        required: ["skill", "tool"],
      },
      outputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          tool: { type: "string" },
          args: { type: "object" },
          body: { type: "string" },
          result: { type: "object" },
        },
      },
    };
    payload.tools = [
      ...(payload.tools || []),
      skillTool,
      skillLoadRefTool,
      skillExecTool,
    ];
  } catch {}
  // 读取 LLM 配置并实例化 provider
  const cfg = await loadJSON("/llm.json");
  const provider = createProvider(cfg);
  // 已移除本地工具枚举；当前仅暴露技能相关工具
  // 截断历史并构造系统消息：角色、技能索引、工具说明与推理指令
  const maxTurnsRaw = cfg && cfg.historyMaxTurns;
  const MAX_TURNS = Math.max(0, Math.min(50, Number(maxTurnsRaw) || 12));
  const history = sessionHistories.get(sessionId) || [];
  const tools = payload.tools || [];
  const toolSystemMsg = buildToolSystemJSON(tools);
  let skillsMetaMsg = "";
  try {
    const metas = await loadAllSkillsMeta();
    const arr = metas
      .map((m) => {
        const name = String(m?.meta?.name || m.key);
        const desc = String(m?.meta?.description || "");
        return `${name}: ${desc}`;
      })
      .filter(Boolean);
    if (arr.length) skillsMetaMsg = `可用技能索引：\n${arr.join("\n")}`;
  } catch {}
  const messages = [
    {
      role: "system",
      content:
        "你是智能助手。\n优先基于当前对话语境作答；当需要专业流程/模板/约束时，按需使用 Skills（skill.load/skill.execute）加载并执行。\n保持回答简洁、包含要点、避免臆断；低置信度时先澄清或提示补充信息。",
    },
    ...(skillsMetaMsg ? [{ role: "system", content: skillsMetaMsg }] : []),
    { role: "system", content: toolSystemMsg },
    {
      role: "system",
      content: SYS_REASONING_MSG,
    },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userInput },
  ];
  // 执行推理循环，并维护会话历史与最终事件
  const runId = `r${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const {
    reply,
    messages: finalMessages,
    toolCalls,
    steps,
    events,
  } = await reasoningLoop(provider, apiKey, messages, runId, onEvent);
  const baseLen = messages.length;
  const newSegments = (finalMessages || [])
    .slice(baseLen)
    .filter((m) => m.role === "assistant" || m.role === "user");
  const updatedHistory = [
    ...history,
    { role: "user", content: userInput },
    ...newSegments,
  ];
  const trimmed = updatedHistory.slice(-MAX_TURNS * 2);
  sessionHistories.set(sessionId, trimmed);
  if (onEvent) {
    const finalEvt = {
      messageType: "assistant_final",
      runId,
      step: steps,
      timestamp: Date.now(),
      reply,
      citations: [],
    };
    try {
      onEvent(finalEvt);
    } catch {}
  }
  return { reply, citations: [], events };
}
