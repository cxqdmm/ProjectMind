import { loadMCPConfig } from './client.js';

// Capability-only MCP: expose tool metadata and leave triggering to the LLM/agent.
// Tools are described in config and optionally extended here.

export function getMCPCapabilities() {
  const cfg = loadMCPConfig();
  const providers = cfg.providers || {};
  const caps = [];
  for (const [providerName, provider] of Object.entries(providers)) {
    const tools = provider.tools || [];
    for (const t of tools) {
      caps.push({
        provider: providerName,
        tool: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || {},
        outputSchema: t.outputSchema || {},
      });
    }
  }
  return caps;
}