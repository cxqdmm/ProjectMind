# Project Context

## Purpose
- 提供一个“智能问答”系统，包含前端对话界面与后端 Agent 服务
- 目标：高质量对话、可靠工具调用、技能清单管理、低延迟流式输出、易于扩展与运维
- 范围：`frontend`（Vue3 界面与事件渲染）、`server`（Express Agent 编排与SSE流式输出）

## Tech Stack
- 前端：Vue 3（`script setup`），Ant Design Vue
- 后端：Node.js（Express）
- 通信：SSE（Server-Sent Events，使用 POST 请求体解决 URL 长度限制）
- 语言与构建：JavaScript（可按需逐步引入 TypeScript）

## Project Conventions
本项目遵循“简洁、明确、可维护”的约定，以下为关键实践：

### Code Style
- 命名：语义化、统一大小写与驼峰规则；组件/模块按职责命名
- 结构：单一职责、避免超长函数；工具与业务逻辑分层
- 格式化：建议统一使用 Prettier；静态检查建议接入 ESLint（Vue/Node 规则集）
- 依赖：避免未使用依赖与隐式全局；严禁提交任何密钥/令牌
- 文档：接口/事件格式需在代码旁以简洁注释或 docs 维护

### Architecture Patterns
- 分层：UI（`frontend`）/ 服务接口与编排（`server`）清晰分离
- 事件驱动：后端以“事件”流式推送，前端将消息 `content` 规范为数组项（文本/事件）
- 工具调用：统一解析工具事件，前端紧凑展示（仅显示状态点、工具名、参考文件/技能）
- 技能清单：在顶部工具栏入口展示，来源于后端 `GET /api/skills/manifest`
- 配置：所有环境变量集中管理，支持本地/测试/生产环境隔离

### Testing Strategy
- 单元测试（后端）：路由与事件生成、错误分支；建议使用 Jest/Vitest + Supertest
- 组件测试（前端）：消息渲染、工具条交互；建议使用 Vitest + Vue Test Utils
- 端到端（E2E）：对话链路、SSE 流式渲染；建议使用 Playwright/Cypress（按实际选择）
- 覆盖率：核心路径（事件解析、SSE 输出、技能入口）需达标
- Mock：使用 `FAKE_LLM` 模式进行本地可重复测试

### Git Workflow
- 分支：`master` 做稳定发布；功能以 `feature/*`，修复以 `fix/*`
- 提交：遵循 Conventional Commits（如 `feat:`, `fix:`, `chore:`）
- PR：小步提交，说明动机与影响面，必须通过基本测试后合并
- 版本：语义化版本号（`MAJOR.MINOR.PATCH`），变更日志自动生成（后续可引入）

## Domain Context
- 智能问答场景：面对工具调用、技能检索、引用展示的对话系统
- 流式事件：后端以事件类型（如 `text`, `tool`, `end`, `error`）推送，前端按类型渲染


## Architecture Overview
- 目录结构（简要）
  - `frontend/`：Vue3 应用，消息 `content` 为数组（文本/事件），顶部工具栏包含技能入口
  - `server/`：Express 路由与 Agent 编排，流式事件输出
- 关键流程
  - 用户输入 → `POST /api/agent/stream`（请求体包含 `userInput`, `sessionId`）→ 后端逐条推送事件
  - 前端解析事件：先移除“处理中”占位，再按事件类型追加内容或工具项
  - 工具展示：仅用圆点颜色表达状态，显示工具名与参考文件/技能名，布局紧凑水平化




