## 你说的问题本质
你看到的这个结构：
```json
{ "messageType": "tool_calls", "calls": [ { "id": "call_xxx", ... } ] }
```
属于“一个 LLM 响应里可能包含多次工具调用”的批量表达（CALL_JSONS 本身就是数组），所以消息级别（message.content）用 `tool_calls + calls[]` 是合理的。

但 **task 维度的 toolEvents 如果也照搬这个批量结构**，会带来两个坏处：
- 更新困难：你希望按 `id` 直接定位一个工具调用更新；但现在需要先定位 batch，再定位 batch.calls 里的 call。
- 语义不直观：你期望 toolEvents 每一项就是一次工具调用（单条记录）。

另外我也确认了：当前 `tool_calls`/`tool_update` 分支里仍然残留 `debugger`（见 [useAgentStream.js](file:///Users/mac/Documents/cxq/工作/ProjectMind/frontend/src/composables/useAgentStream.js#L221-L241)）。

## 目标
- **task.tasks[].toolEvents 扁平化**：每个元素就是一条工具调用（包含 id/provider/tool/input/status/result/error/时间字段）。
- tool_update 到达时按 `id` **就地更新该 call 对象**（找不到则补一个占位 call，再更新）。
- 不强行改动 message.content 的 tool_calls 结构（保持兼容：消息级依然可以批量展示）。
- 移除所有残留 debugger。

## 改造方案
### 1) 修改 useAgentStream：task 维度不再 push batch
- `data.type === 'tool_calls'` 且 `data.task` 存在时：
  - 对 `data.calls` 做 `for (call of calls)`，把每个 call **upsert** 到 `t.toolEvents`（按 call.id）。
  - toolEvents 的元素形状直接就是 call（可选带 `timestamp`）。
- `data.type === 'tool_update'` 且 `data.task` 存在时：
  - 在 `t.toolEvents` 中按 `data.id` 找到对应 call，更新 status/result/error/startedAt/completedAt/durationMs。
  - 如果还没收到对应 tool_calls（更新先到），创建 `{ id, status: 'pending' }` 占位再更新。
- 同时删掉 tool_calls/tool_update 两处 `debugger`。

### 2) 更新 ToolTimeline：兼容两种输入
目前 ToolTimeline 在 `props.events` 场景会调用 `buildToolView(events)`（它只认识 `tool_calls/tool_update` 这种事件流）。
改造为：
- 若 `props.events` 看起来是“扁平 call 列表”（数组元素有 `id` 且不含 `messageType === 'tool_calls'`）：
  - 直接把它当作 calls 渲染（或包装成一个 batch：`[{ calls }]`），不再走 buildToolView。
- message+part 的消息级工具展示保持现状（仍用 buildBatchForItem/buildToolView）。

### 3) 可选：useToolView 保持不变
- 因为我们只让 task 维度扁平化，消息级仍是 batch 事件流，所以 useToolView 现有逻辑可继续使用。

## 验证点
- 同一个 callId 的状态不会出现多条重复记录（task.toolEvents 数组里同 id 仅一条）。
- tool_update 先到/后到都能正确落到同一条 call 上。
- `npm run build` 通过。

我会按以上方案修改 2 个文件：
- [useAgentStream.js](file:///Users/mac/Documents/cxq/工作/ProjectMind/frontend/src/composables/useAgentStream.js)
- [ToolTimeline.vue](file:///Users/mac/Documents/cxq/工作/ProjectMind/frontend/src/components/ToolTimeline.vue)
并补上构建验证。