
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { getMcpServers } from "../utils/mcpConfig.js"

// 存储已连接的 client 实例
const clients = new Map()
// 存储所有可用工具的定义
let cachedTools = []

/**
 * 初始化所有 MCP 连接
 */
export async function initMcpClients() {
  const servers = getMcpServers()
  for (const [name, config] of Object.entries(servers)) {
    if (clients.has(name)) continue
    
    try {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args || []
      })
      
      const client = new Client({
        name: "ProjectMind-Client",
        version: "1.0.0"
      }, {
        capabilities: {}
      })
      
      await client.connect(transport)
      clients.set(name, client)
      console.log(`[MCP] Connected to server: ${name}`)
    } catch (e) {
      console.error(`[MCP] Failed to connect to ${name}:`, e)
    }
  }
}

/**
 * 获取所有已连接 Server 的工具列表
 * 并转换为 OpenAI/GLM 兼容的 Tool 格式
 */
export async function getMcpTools() {
  // 如果已经有缓存且连接数没变，直接返回（简单缓存策略）
  // 实际场景可能需要定期刷新
  if (cachedTools.length > 0 && cachedTools.length >= clients.size) {
    return cachedTools
  }

  const allTools = []
  
  for (const [serverName, client] of clients.entries()) {
    try {
      const { tools } = await client.listTools()
      for (const t of tools) {
        allTools.push({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema
          },
          // 内部标记，用于执行时路由
          __mcpServer: serverName
        })
      }
    } catch (e) {
      console.error(`[MCP] Failed to list tools from ${serverName}:`, e)
    }
  }
  
  cachedTools = allTools
  return allTools
}

/**
 * 调用 MCP 工具
 */
export async function callMcpTool(toolName, args) {
  // 找到该工具所属的 server
  const toolDef = cachedTools.find(t => t.function.name === toolName)
  if (!toolDef || !toolDef.__mcpServer) {
    throw new Error(`MCP tool ${toolName} not found or server unknown`)
  }
  
  const serverName = toolDef.__mcpServer
  const client = clients.get(serverName)
  if (!client) {
    throw new Error(`MCP server ${serverName} not connected`)
  }
  
  try {
    const result = await client.callTool({
      name: toolName,
      arguments: args
    })
    return result
  } catch (e) {
    throw new Error(`MCP tool execution failed: ${e.message}`)
  }
}
