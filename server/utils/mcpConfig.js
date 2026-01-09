
// MCP 服务器配置
// 这里配置要连接的 MCP Server
// 目前主要通过 stdio 连接本地 npx 启动的服务

export function getMcpServers() {
  // 可以从环境变量或配置文件扩展
  // 默认不配置，由用户根据需要开启
  // 这里作为示例，如果需要可以开启 git/filesystem
  return {
    "git": {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-git"]
    },
    "filesystem": {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", process.cwd()]
    }
  }
}
