import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function loadMCPConfig() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const configPath = path.resolve(__dirname, '../config/mcp.json');
  const require = createRequire(import.meta.url);
  try {
    delete require.cache[require.resolve(configPath)];
  } catch (_) {}
  try {
    const cfg = require(configPath);
    return cfg || {};
  } catch (_) {
    return {};
  }
}

async function invokeHTTP(provider, tool, input) {
  const baseURL = provider.baseURL || provider.baseUrl || '';
  const invokePath = provider.invokePath || '/invoke';
  const url = baseURL.replace(/\/$/, '') + invokePath;
  const token = provider.token || '';
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const body = { tool, input };
  console.log(`[mcp/client] 调用工具请求 url=${url} tool=${tool} 入参=${JSON.stringify(body)}`);
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  let data;
  try {
    data = await resp.json();
  } catch (e) {
    const txt = await resp.text().catch(() => '');
    console.warn(`[mcp/client] 响应非JSON status=${resp.status} ok=${resp.ok} textClip=${String(txt).slice(0,200)}`);
    data = {};
  }
  return data;
}

export async function invokeMCPTool(providerName, tool, input) {
  const cfg = loadMCPConfig();
  const providers = cfg.providers || {};
  const provider = providers[providerName];
  if (!provider) {
    return { ok: false, error: `Provider not found: ${providerName}` };
  }
  // 添加入参日志，便于排查调用问题
  try {
    console.log(`[mcp/client] 调用工具 provider=${providerName} type=${provider.type || 'http'} tool=${tool} 入参=${JSON.stringify(input)}`);
    if ((provider.type || 'http') === 'http') {
      const res = await invokeHTTP(provider, tool, input);
      const pretty = res?.result ?? res?.data ?? res;
      console.log(`[mcp/client] 工具返回结果 provider=${providerName} tool=${tool} 出参=${JSON.stringify(pretty)}`);
      return { ok: true, provider: providerName, tool, result: res?.result ?? res?.data ?? res };
    }
    return { ok: false, error: `Unsupported provider type: ${provider.type}` };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

export { loadMCPConfig };