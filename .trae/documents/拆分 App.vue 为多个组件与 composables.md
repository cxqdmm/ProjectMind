## 现状：为什么 App.vue 太重
App.vue 目前同时承担了：
- Header（技能/模型下拉、拉取列表、选择模型）
- 聊天 UI（消息列表、渲染 markdown、引用、loading）
- 工具调用 UI（tool_calls/tool_update 合并与折叠）
- 子任务 UI（tasks part 时间轴、task 展开、task 下工具/记忆/结果）
- SSE 流处理（解析事件、写入 message/content/tasks、去重/补偿顺序）
- 诸多工具函数（formatJSON/renderMarkdown/buildToolView/mergeMemories…）
这会导致：可读性差、修改容易牵一发而动全身、测试困难。

## 目标
- App.vue 只做“页面组装 + 少量顶层状态”。
- UI 逻辑拆成组件；数据处理拆成 composable（可复用、可单测）。
- 拆分后每个文件职责单一，组件 props 明确。

## 组件拆分建议（优先级从高到低）
### 1) ChatHeader.vue（头部与下拉）
- 负责：标题、模型选择按钮、技能按钮、下拉层 UI。
- 通过 props/emit 与 App.vue 交互：
  - props：currentModelLabel, skills, models, loading/error 状态
  - emits：toggleSkills/toggleModels/refreshSkills/refreshModels/chooseModel/insertSkill
- App.vue 保留数据拉取逻辑，或进一步下沉到 composable（见下）。

### 2) MessageList.vue（消息列表容器）
- 负责：messages 的 v-for、滚动到底部、每条消息渲染。
- 内部再拆：MessageItem.vue

### 3) MessageItem.vue（单条消息）
- 负责：role 头像/标签、content 时间轴渲染（text/tasks/tool_calls/memory_used）、pending、citations。
- 依赖子组件：
  - TaskTimeline.vue（渲染 tasks part 对应的任务卡片）
  - ToolTimeline.vue（渲染 tool_calls/tool_update 的批次与折叠）
  - MemoryUsedList.vue（已有）

### 4) TaskTimeline.vue（任务卡片 + 展开详情）
- 输入：tasks 数组、messageIndex、openIds（或折叠回调）。
- 内部展示：任务列表 + 每个任务展开区（工具→记忆→结果）。
- 复用：ToolTimeline.vue（展示 taskToolBatches 的工具列表）。

### 5) ToolTimeline.vue（工具调用列表）
- 输入：events（tool_calls/tool_update 的事件数组）或 batches。
- 负责：buildToolView 合并、排序、折叠展开、输入/输出展示。
- 这样你以后想把工具展示也做成“更像时间轴”会更好改。

### 6) ChatInput.vue（底部输入框）
- 输入：sending
- emits：send(text)

### 7) TokenPanel.vue（token 面板）
- 输入：tokenVisible、tokenLast、tokenTotal

## 逻辑下沉：composables（让组件更轻）
建议把“非 UI 的业务逻辑”拆到 composables 目录：
- useAgentStream.ts/js：
  - 封装 onSend、SSE 解析、把事件写入 message/content/tasks 的归档逻辑
  - 对外暴露：send(text, sessionId, modelSelection) + reactive 状态（sending 等）
- useSkills.ts/js：拉取技能列表、open 状态、插入 skill 到 input
- useModels.ts/js：拉取模型、选择模型、currentModelLabel
- useMessageOpenState.ts/js：统一管理 openIds（工具/任务/任务内工具折叠）
- useToolView.ts/js：buildToolView/buildBatchForItem 等工具视图转换函数

## 迁移步骤（低风险、逐步拆）
1) 先抽纯展示组件（TokenPanel、ChatInput）：App.vue 逻辑几乎不动。
2) 抽 ToolTimeline：把 buildToolView/buildBatchForItem/callTitle/toolInfoLabel 等移动到组件或 useToolView。
3) 抽 TaskTimeline：把 tasks part 的模板与相关小函数搬走。
4) 抽 MessageItem/MessageList：App.vue 只传 messages。
5) 最后抽 ChatHeader + skills/models 两套下拉与请求逻辑。

## 文件结构建议
- frontend/src/components/
  - ChatHeader.vue
  - TokenPanel.vue
  - ChatInput.vue
  - MessageList.vue
  - MessageItem.vue
  - TaskTimeline.vue
  - ToolTimeline.vue
- frontend/src/composables/
  - useAgentStream.js
  - useSkills.js
  - useModels.js
  - useToolView.js
  - useOpenState.js

## 验证方式
- 每完成一轮拆分：跑一次 `npm run build`。
- 手动验证：发送一轮包含 tasks/tool/memory 的对话，确保顺序、折叠、渲染一致。

如果你同意，我会按上述顺序开始拆分（每次拆 1–2 个组件），保证每一步都可运行、可回滚。