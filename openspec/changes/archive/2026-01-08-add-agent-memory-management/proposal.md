# Change: 为 Agent 引入类人记忆管理能力

## Why
后端大模型的自定义 Agent 目前缺乏系统化的记忆管理能力，只能依靠当前对话上下文和手工传入信息，导致：
- 无法稳定复用长期对话/任务中的关键信息
- 难以对不同会话/用户进行差异化决策
- 记忆检索逻辑分散在各个调用点，难以维护与演进

## What Changes
- 新增“Agent 记忆管理（agent-memory）”能力规范，明确记忆范围仅覆盖“技能内容与技能参考文件内容”，不对普通对话文本做记忆
- 定义独立于 skills 的记忆层（结构/接口参考 skills），在 Agent 编排中位于 skills 调用之前，统一执行“先取记忆，再决策/调用”
- 设计基于大模型的记忆选择流程：由模型根据记忆元数据 + 当前问题判定需注入的记忆条目（依赖模型能力，而非复杂检索算法）
- 规范记忆在事件流/前端的展示：增加记忆展示组件，并以事件形式输出“本轮使用的记忆摘要”便于用户与开发者调试
- 预留后端 memory provider / memory manager 抽象接口，支撑独立记忆层的接入与演进

## Impact
- Affected specs: 计划新增 `specs/agent-memory/spec.md` 能力（当前变更先在 `changes/add-agent-memory-management/specs/agent-memory/spec.md` 中以 ADDED 形式定义）
- Affected code（预期影响区域，供后续实现阶段使用）:
  - `server` 端 Agent 编排逻辑：在调用 skills / tools 前插入独立记忆层的检索步骤
  - 记忆存储与检索模块：初版聚焦“技能内容/技能参考文件”的记忆，基于模型选择逻辑
  - SSE/前端：输出“使用的记忆”事件，新增记忆展示组件

