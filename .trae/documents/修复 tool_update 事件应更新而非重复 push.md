## 问题原因
在 [useAgentStream.js](file:///Users/mac/Documents/cxq/工作/ProjectMind/frontend/src/composables/useAgentStream.js) 当前实现里：
- `tool_update` 每来一次就 `push` 一条新事件到 `t.toolEvents` 或 `message.content`。
- 这会导致同一个 tool call 的状态更新产生大量重复记录（内存增长、难以追踪最新状态），并且你代码里还残留了 `debugger`。

## 目标
- 对同一个 `data.id` 的工具调用：`tool_update` 应该 **upsert（就地更新）**，而不是每次新增一条。
- 保持 UI 行为不变（工具列表仍能正确展示状态、输入/输出）。

## 改造方案
### 1) 删除遗留的 debugger
- 移除 `tool_update` 分支里的 `debugger`（这是明显的残留调试代码）。

### 2) 为 tool_update 增加 upsert 帮助函数
新增两个小工具函数（放在 useAgentStream.js 内部）：
- `upsertToolUpdateEvent(list, ev)`：用于 task 维度（`t.toolEvents`）
  - 在 `list` 中查找 `messageType === 'tool_update' && id === ev.id` 的最后一条
  - 找到则 `Object.assign` 更新字段（status/result/error/startedAt/completedAt/durationMs/timestamp）
  - 找不到才 `push`
- `upsertToolUpdatePart(contentParts, part)`：用于消息级别（`messages.value[idx].content`）
  - 查找 `type === 'tool_update' && id === part.id` 的最后一条
  - 找到则更新；找不到才 push

### 3) 可选增强：同时更新 tool_calls 里的 call 对象
为了让 UI 更“实时/直观”，在收到 `tool_update` 时，额外尝试：
- 找到最近的 `tool_calls`（task/toolEvents 或 message.content）里包含该 id 的 call，对该 call 就地更新 status/result/error/时间字段。
这样即使未来我们完全不存 tool_update，也能靠 call 对象直接渲染。

## 修改点（只动一个文件）
- 仅修改 [useAgentStream.js](file:///Users/mac/Documents/cxq/工作/ProjectMind/frontend/src/composables/useAgentStream.js)：
  - 去掉 debugger
  - tool_update 分支从 push 改为 upsert（task 维度 + message 维度）
  - （可选）同步更新 tool_calls 内 call 对象

## 验证
- 运行 `frontend npm run build`。
- 手动触发一次含工具调用的对话：
  - 期望同一个 callId 在内存结构中只有 1 条 tool_update（或被就地更新）
  - UI 上状态从 running → completed/failed 正常变化，输入/输出仍可展开查看

我会按以上步骤直接修复，确保 tool_update 不再无限累积。