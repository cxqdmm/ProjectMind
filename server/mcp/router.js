import { invokeMCPTool, loadMCPConfig } from './client.js';

function planMCPCalls(text) {
  const t = String(text || '').toLowerCase();
  const calls = [];
  // 简单关键词映射：搜索/百科 -> web.search；文档/知识库 -> kb.query
  const searchHints = ['搜索', '查找', '查询', '资料', '新闻', '百科'];
  const kbHints = ['文档', '知识库', '手册', 'api', '说明书'];
  const hitSearch = searchHints.some(k => t.includes(k));
  const hitKb = kbHints.some(k => t.includes(k));
  if (hitSearch) calls.push({ provider: 'web', tool: 'web.search', input: { q: text, top_k: 3 } });
  if (hitKb) calls.push({ provider: 'kb', tool: 'kb.query', input: { q: text, top_k: 3 } });
  return calls;
}

export async function executeMCPPlan(text) {
  const cfg = loadMCPConfig();
  const calls = planMCPCalls(text);
  if (!calls.length) return [];
  console.log(`[mcp] plan ${calls.length} calls: ${calls.map(c => c.provider + ':' + c.tool).join(', ')}`);
  const results = await Promise.allSettled(calls.map(c => invokeMCPTool(c.provider, c.tool, c.input)));
  const facts = [];
  for (let i = 0; i < results.length; i++) {
    const c = calls[i];
    const r = results[i];
    if (r.status === 'fulfilled' && r.value?.ok) {
      facts.push({ provider: c.provider, tool: c.tool, data: r.value.result });
    } else {
      const err = r.status === 'fulfilled' ? r.value?.error : r.reason;
      console.warn(`[mcp] call error ${c.provider}:${c.tool}`, err);
    }
  }
  return facts;
}