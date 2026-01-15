## 目标
- 把“最近一次大模型请求的 messages 数组”提供给前端可视化查看，便于调试（看到 system/history/memory 注入/工具上下文等）。

## 方案选择（推荐）
- **后端落盘/内存缓存最后一次请求**（按 sessionId 维度），前端按需拉取显示。
- 同时在 SSE 里发一个轻量事件通知“有新请求可看”（可选），避免把大 messages 直接塞进 SSE 导致卡顿。

## 后端改造
### 1) 增加一个 LLM 请求缓存模块
- 新增 `server/services/llmRequestStore.js`：
  - `setLastRequest(sessionId, payload)` / `getLastRequest(sessionId)`
  - 只保留每个 sessionId 的最近一条（避免内存膨胀）
  - payload 包含：`requestId、timestamp、provider/model、step、taskCtx、messages`（只存 messages；不存 apiKey）

### 2) 在 agentService 的每次 provider.chat 调用前记录
- 改造 `createChatReply(...)`：让它接收 `ctx`，在调用 `ctx.provider.chat(messages, tools)` 之前：
  - `setLastRequest(ctx.sessionId, { ...meta, messages })`
  - `ctx.emit({ type: 'llm_request', requestId, step, task: ctx.taskCtx })`（只发元信息，不发 messages）

### 3) 增加调试接口
- 新增路由 `server/routes/debug.js`：
  - `GET /api/debug/last-llm-request?sessionId=...` → 返回最近一次请求的完整 payload（包含 messages）
- 在 `server/app.js` 挂载：`app.use('/api/debug', debugRouter)`
- 安全：
  - 不返回任何 API Key（目前 providerService 已不会把 key 放到 messages，这里也不额外拼接）
  - 可加 `maxChars` 限制（例如每条 message content 超过阈值则截断），避免极端情况下响应过大

## 前端改造
### 1) 新增调试面板组件
- 新增 `frontend/src/components/LlmMessagesViewer.vue`（弹层/抽屉形式）：
  - 顶部：刷新按钮、关闭按钮、显示 sessionId/provider/model/step/task
  - 内容：messages 列表（按 role 分组），支持展开/收起、自动换行、复制 JSON

### 2) 新增 composable
- 新增 `frontend/src/composables/useLlmDebug.js`：
  - `fetchLast(sessionId)` 调 `/api/debug/last-llm-request`
  - 管理 loading/error/lastRequest

### 3) 在 App.vue 加入口
- 在 `ChatHeader` 增加一个“请求”/“调试”按钮（类似“记忆”按钮），点击打开 LlmMessagesViewer。
- App.vue 管理 open 状态与 sessionId 传入。

## 验证
- 触发一次对话：
  - 后端应记录最近一次 provider.chat 的 messages
  - 前端打开面板能看到 messages（system/user/assistant 等）且自动换行
- 构建验证：`frontend npm run build`，server 启动无报错。

实施完成后，你就能在前端随时查看“最近一次大模型请求的完整 messages 上下文”。