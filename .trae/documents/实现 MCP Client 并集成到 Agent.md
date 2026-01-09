## MCP Client 架构设计与实现

为了实现 MCP Client 并保持与现有逻辑的解耦，我们将采用以下分层架构：

### 1. 核心服务层 (MCP Service)
创建一个独立的 `server/services/mcpService.js`，负责：
- **Client 管理**：维护与外部 MCP Server 的连接池（使用 `@modelcontextprotocol/sdk`）。
- **配置驱动**：从 `mcp_config.json` 或环境变量读取 Server 配置（如 `git`, `filesystem`）。
- **工具发现**：启动时或按需调用 `listTools` 获取工具定义。
- **调用代理**：提供统一的 `callTool(serverName, toolName, args)` 接口。

### 2. Provider 适配层 (Provider Injection)
改造 `server/services/providerService.js`：
- **工具注入**：在 `chat(messages)` 接口中，支持传入额外的 `tools` 定义（OpenAI/GLM 格式）。
- **Prompt 增强**：如果使用了不支持 Native Tool Calling 的模型，需将 MCP 工具描述转换为 System Prompt（虽然 GLM-4.7 支持，但为了通用性可保留此逻辑）。

### 3. Agent 编排层 (Agent Orchestration)
改造 `server/services/agentService.js`：
- **初始化**：在 `runStream` 开始时，调用 `mcpService.getTools()` 获取所有可用 MCP 工具。
- **工具路由**：在解析出工具调用后，判断工具来源：
  - 如果是 `openskills.*` -> 走现有的 `toolInvokeService`。
  - 如果是 MCP 工具（如 `git_diff`, `read_file`） -> 走 `mcpService.callTool`。
- **结果标准化**：将 MCP 的返回结果转换为 Agent 能理解的格式（通常是文本或 JSON），并加入 Memory。

### 4. 依赖安装
- 需要安装 `@modelcontextprotocol/sdk` 和 `zod`（SDK 依赖）。

### 5. 具体实现步骤

1.  **安装依赖**：`npm install @modelcontextprotocol/sdk zod`
2.  **创建配置**：`server/utils/mcpConfig.js` 定义默认的 MCP Server（如 git, filesystem）。
3.  **实现服务**：`server/services/mcpService.js` 实现连接与调用逻辑。
4.  **改造 Agent**：
    - 在 `runStream` 中获取 MCP 工具列表。
    - 将工具列表传给 `provider.chat`（需修改 provider 签名）。
    - 在工具执行循环中增加对 MCP 工具的分支处理。
5.  **改造 Provider**：
    - `providerService.js` 的 `chat` 方法接收 `tools` 参数，并将其传递给 GLM-4.7 API（字段名通常为 `tools` 或 `functions`，需查阅 GLM 文档适配）。

### 6. 解耦策略
- **OpenSkills** 保持不变，作为内部核心能力。
- **MCP** 作为外部扩展能力，通过标准协议接入。
- **Agent** 作为调度器，不关心工具是内部还是外部，只负责分发。

这样设计后，未来添加新的 MCP Server 甚至不需要改代码，只需改配置文件即可。