## 你说的痛点
- 现在后端只保存“最后一次 LLM 请求”，会被覆盖，无法按“轮次”追踪。
- 你还希望把 LLM 的回复也推到前端（方便把 request/response 串起来看）。

## 目标
- 每次调用 LLM 视为一轮（round），**不覆盖**：按 `sessionId` 追加保存最近 N 轮。
- 每轮都能在前端看到：
  - 请求 messages（完整）
  - 模型返回 reply（完整）
  - 元信息（provider/model/step/task/purpose/timestamp）
- 通过 SSE 推送“有新一轮 + 回复结果”，前端无需手动刷新也能跟踪；完整 messages 通过 API 拉取（避免 SSE 过大）。

## 后端改造
### 1) 升级 llmRequestStore：从“单条”变为“多轮历史”
- `server/services/llmRequestStore.js`
  - `pushLlmRound(sessionId, round)`：追加一轮并做容量限制（默认保留 20 轮）
  - `updateLlmRound(sessionId, id, patch)`：把 response/错误等补到对应 round 上
  - `listLlmRounds(sessionId)`：返回按时间倒序的 meta 列表（不带 messages，或可选带 messages）
  - `getLlmRound(sessionId, id)`：返回某一轮完整数据（含 messages + reply）

### 2) agentService 在每次 LLM 调用前后都记录
- `createChatReply(ctx, messages, tools, meta)` 里：
  - 调用前：生成 `requestId`，`pushLlmRound(..., { id, messages, meta, ... })`
  - 调用后：`updateLlmRound(..., { reply, usage })`
  - 异常：`updateLlmRound(..., { error })`
- SSE 事件：
  - 继续发 `llm_request`（只发 id + meta + messagesCount + preview）
  - 新增发 `llm_response`（发 id + reply + error + usage + timestamp）
  - 这样你在前端可以按 id 把一轮串起来。

### 3) debug API 扩展为“列表 + 详情”
- `server/routes/debug.js`
  - `GET /api/debug/llm-rounds?sessionId=...` → 返回轮次 meta 列表（轻量）
  - `GET /api/debug/llm-round?sessionId=...&id=...` → 返回该轮完整 messages+reply
  - 保留现有 `GET /api/debug/last-llm-request` 但内部改为返回“最新一轮”（兼容旧面板）

## 前端改造
### 1) 改造 LlmMessagesViewer 成“轮次列表 + 详情”
- 左侧：轮次列表（时间、purpose、task、step、provider/model、是否有 reply/错误）
- 右侧：
  - messages 展示（列表 + 原始 JSON）
  - reply 展示（单独区域，支持复制）
- 交互：点击某一轮，通过 `/api/debug/llm-round` 拉取完整内容。

### 2) useLlmDebug 支持列表与详情
- `useLlmDebug` 新增：
  - `refreshRounds(sessionId)`
  - `fetchRound(sessionId, id)`
  - 仍保留 `refresh(sessionId)` 兼容旧逻辑（对应“最新一轮”）。

### 3) SSE 实时更新（可选但推荐）
- 在 `useAgentStream` 增加对 `llm_request/llm_response` 的消费：
  - 收到 `llm_request`：把轮次 meta 追加到 viewer 的列表缓存（或提示“有新轮次”）
  - 收到 `llm_response`：更新对应轮次的 reply 状态
- 完整 messages 仍然按需用 API 拉取。

## 数据量与安全
- 默认保留最近 20 轮；每轮 messages 可做字段截断（如单条 content 超过 50k 字符可截断），避免极端内存/响应爆炸。
- 不记录/不返回任何 API Key。

## 验证
- 触发连续多次对话：
  - 前端轮次列表应不断增加（不覆盖）
  - 每轮可看到对应 reply，并能查看该轮完整 messages
- 前后端 build/启动无报错。

确认后我会按以上步骤开始改代码，并把旧的“只看最后一次”面板平滑升级成“多轮追踪”。