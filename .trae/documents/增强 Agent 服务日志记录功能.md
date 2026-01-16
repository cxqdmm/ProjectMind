我将修改 `server/services/agentService.js` 文件，通过添加 `emitLog` 辅助函数并在关键业务流程节点插入日志发送逻辑，来实现详细的调试信息流式传输。

**修改计划：**

1.  **定义日志辅助函数**：
    在文件内部定义 `emitLog(emit, title, content)` 函数，统一发送格式为 `{ type: 'debug_log', data: { title, content, timestamp: ... } }` 的 SSE 事件。

2.  **增强 `createChatReply` 函数**：
    *   修改函数签名，增加可选参数 `emit`：`async function createChatReply(provider, messages, tools, emit)`。
    *   在调用 `provider.chat` 前，发送 "模型调用开始" 日志（包含 messages 和 tools）。
    *   在获得结果后，发送 "模型调用完成" 日志（包含 content）。

3.  **更新调用点**：
    *   `runTaskToolLoop` 中调用 `createChatReply` 时传入 `ctx.emit`。
    *   `finalizeGate` 中调用 `createChatReply` 时传入 `ctx.emit`。

4.  **添加流程节点日志**：
    *   **任务规划 (`planAndInitTasks`)**：
        *   调用 `planTasksWithProvider` 前后分别发送 "开始规划任务" 和 "任务规划完成" 日志。
    *   **任务执行 (`runSingleTask`)**：
        *   任务开始时发送 "任务开始执行" 日志（包含任务标题）。
        *   任务结束时发送 "任务执行完成" 日志（包含执行结果）。
    *   **工具调用 (`execSingleToolCall`)**：
        *   工具开始执行时发送 "工具开始执行" 日志（包含工具名和入参）。
        *   工具执行成功后发送 "工具执行完成" 日志（包含结果）。
        *   工具执行失败后发送 "工具执行失败" 日志（包含错误信息）。

此修改仅涉及添加日志发送逻辑，不改变原有业务逻辑和数据结构。