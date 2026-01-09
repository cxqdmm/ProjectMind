## 接口与数据流
- 新增 `GET /api/models` 返回可用模型列表，含 `provider`、`model`、`baseURL`、`enabled`。
- 扩展 `POST /api/agent/stream` 请求体，增加 `provider` 与 `model` 字段，用于本次会话调用所选模型。
- 过滤规则：`enabled = true` 当对应 `API_KEY` 存在或 `FAKE_LLM=true`。

## Provider 适配
- 扩展 `server/services/providerService.js`：支持 `qwen` 与 `zhipuai` 两种提供商。
- 每个 provider 统一 `chat(messages)` 接口；根据 `selection.provider` 选择实现。
- API Key：`qwen` 读取 `QWEN_API_KEY`/`DASHSCOPE_API_KEY`，`zhipuai` 读取 `ZHIPUAI_API_KEY`；均回退至 `LLM_API_KEY`。
- 请求路径：
  - Qwen：`<baseURL>/chat/completions`
  - ZhipuAI：`<baseURL>/chat/completions`（默认 `https://open.bigmodel.cn/api/paas/v4/chat/completions`）
- 返回解析统一为 `String(data?.choices?.[0]?.message?.content || '')`。

## Agent 服务改造
- `runStream(userInput, sessionId, emit, selection)`：将前端选择的 `provider/model` 传入。
- 在创建 provider 时使用 `createProvider(cfg, selection)`。

## 模型列表路由
- 新增路由 `server/routes/models.js`：
  - `GET /api/models`：聚合 `readLLMConfig()` 两端配置，生成 `{ models: [{ id, label, provider, model, baseURL, enabled }] }`。
- 在 `server/index.js` 或路由聚合处挂载 `/api/models`。

## 前端 UI 与调用
- 在 `frontend/src/App.vue` 顶部工具栏新增“模型”入口，类似技能下拉：
  - 状态：`modelsOpen`、`modelsLoading`、`modelsError`、`models`、`selectedModel`。
  - 加载：进入页面或首次点击时调用 `GET /api/models`。
  - 选择：点击列表项设置 `selectedModel={ provider, model }`。
- 发送消息时：`fetch('.../api/agent/stream', { body: { userInput, sessionId, provider, model } })`。
- UI 呈现：在工具栏显示当前模型简称，如 `Qwen·qwen-plus` 或 `ZhipuAI·glm-4.7`。

## 安全与健壮性
- 不在前端展示或记录 API Key。
- 路由输出仅含模型元信息，不含敏感数据。
- 当选择的模型 `enabled=false`，前端禁用点击并给出提示。

## 测试与验证
- 单元测试：`providerService` 两个 provider 的请求构造与解析；`GET /api/models` 的过滤逻辑。
- 集成测试：前端选择不同模型后，后端收到正确的 `provider/model` 并能完成一次对话（在 `FAKE_LLM=true` 下可模拟）。
- 回归：保持现有 SSE 与工具事件流程不变。