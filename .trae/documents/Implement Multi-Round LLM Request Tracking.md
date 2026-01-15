# Implement Multi-Round LLM Request Tracking

本计划旨在实现对 LLM 请求的完整生命周期追踪（Request/Response/Meta），支持多轮历史记录，并在前端提供可视化的列表与详情查看。

## Backend Implementation

### 1. 创建存储服务 `server/services/llmRequestStore.js`
- **功能**: 内存级存储，管理 Session 的 LLM 调用历史。
- **接口**:
    - `pushLlmRound(sessionId, roundData)`: 追加新轮次，包含容量限制（默认 20 轮）。
    - `updateLlmRound(sessionId, roundId, patch)`: 更新现有轮次（用于追加 Response/Error）。
    - `listLlmRounds(sessionId)`: 获取轮次列表（轻量级 Meta）。
    - `getLlmRound(sessionId, roundId)`: 获取特定轮次的完整详情（含 Messages）。

### 2. 改造 `server/services/agentService.js`
- **目标**: 在 `createChatReply` 中注入追踪钩子。
- **变更**:
    - 在调用 Provider 前：生成 `requestId`，收集 `messages`、`tools`、`meta`，调用 `store.pushLlmRound`，并发送 SSE 事件 `llm_request`。
    - 在调用 Provider 后：收集 `content`、`usage`，调用 `store.updateLlmRound`，并发送 SSE 事件 `llm_response`。
    - 错误处理：捕获异常，记录 `error` 信息到 Store，并重新抛出。

### 3. 新增 Debug 路由 `server/routes/debug.js`
- **API**:
    - `GET /api/debug/llm-rounds`: 返回轮次列表。
    - `GET /api/debug/llm-round`: 返回单轮详情。
    - `GET /api/debug/last-llm-request`: 兼容旧接口（返回最新一轮）。
- **注册**: 在 `server/app.js` 中挂载该路由。

## Frontend Implementation

### 1. 创建/改造 Debug 逻辑
- **新建 `frontend/src/composables/useLlmDebug.js`**:
    - 封装 `fetchRounds` 和 `fetchRoundDetail` API 调用。
    - 提供响应式状态供 UI 消费。
- **更新 `frontend/src/composables/useAgentStream.js`**:
    - 监听 `llm_request` 和 `llm_response` SSE 事件。
    - 实时触发 UI 更新（如追加新轮次到列表）。

### 2. 创建 UI 组件 `frontend/src/components/LlmMessagesViewer.vue`
- **布局**: 左侧列表（Rounds List），右侧详情（Detail View）。
- **功能**:
    - 列表展示：时间、Step、Purpose、Status（Loading/Success/Error）。
    - 详情展示：完整 Messages（支持 JSON 格式化）、Reply 内容、Usage 统计。
    - 交互：点击列表项加载详情。

### 3. 集成到主应用
- **修改 `frontend/src/App.vue`**:
    - 引入 `LlmMessagesViewer` 组件。
    - 添加入口（如在 TokenPanel 旁或专门的 Debug 按钮）以打开该面板。

## Verification
1.  **启动服务**: 确保前后端无报错。
2.  **执行任务**: 发起一个多步骤 Agent 任务（如“写一首诗并解释”）。
3.  **检查追踪**:
    - 确认前端 Debug 面板实时出现多个轮次。
    - 确认点击轮次能看到对应的 System Prompt、User Input 和 Model Reply。
    - 确认页面刷新后历史轮次依然存在。
