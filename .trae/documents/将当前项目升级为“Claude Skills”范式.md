## 现状梳理
- 前端以 `Vite + Vue3` 运行，核心代理逻辑在 `frontend/src/lib/agent.js:291` 的 `runAgentBrowser`，并用文本触发工具（`CALL/CALL_JSON`）。
- 技能以 Markdown + 简易 frontmatter 管理：加载在 `frontend/src/lib/skillsRuntime.js:26-38`，清单在 `frontend/public/skills/manifest.json`；技能注入通过本地工具 `skill.load`（`frontend/src/lib/localTools.js:47-57`）。
- 事件回传与工具并发调用由 `reasoningLoop` 驱动（`frontend/src/lib/agent.js:183-289`），但尚无权限/配额/错误分类等治理能力。
- 根目录存在后端依赖与脚本（`package.json:6-9`），但缺少 `server.js`，当前所有动作在浏览器侧执行，无法安全持有密钥与访问受限资源。

## 差距对照（与 Claude Skills 思路）
- 统一技能规范：缺少标准化 `manifest` 字段（版本、权限、输入/输出 schema、触发示例、依赖）。
- 运行时治理：没有权限、速率限制、审计日志、幂等与错误分级；工具仅为轻量函数映射。
- 触发协议：主要依赖文本 `CALL`，未适配函数调用原语（有的模型原生支持工具/函数调用）。
- 安全边界：没有后端执行面；无法安全访问外部 API/数据库；密钥暴露风险。
- 开发者体验：缺少技能脚手架、校验与测试工具；frontmatter 为自研解析，语法有限。

## 改造目标
- 设计可扩展“技能规范”（Skill Spec）：让每个技能拥有自描述的 `manifest`、清晰的输入输出与权限边界。
- 引入“技能运行时”（Skill Runtime）：统一加载、注册、执行、事件上报、错误与权限治理。
- 增强触发协议：优先使用函数/工具调用，保留文本触发作为回退；提供多模型适配层（Claude/OpenAI/Qwen）。
- 建立安全后端：将敏感工具与外部访问放到 Node/Express 服务；前端仅触发与展示。
- 提供 DX 工具链：脚手架、Schema 校验、单测、模拟器、示例模板。

## 实施方案（分阶段）
### Phase 1：规范与最小可用运行时
- 新建 `skills/` 规范：每个技能目录包含 `skill.json`（id、name、version、description、intents、input_schema、output_schema、permissions、examples、dependencies）与 `skill.md`（系统指令正文）。
- 替换/扩展 frontmatter 解析为标准 YAML；保留向后兼容（当前 `parseFrontmatter` 位于 `frontend/src/lib/skillsRuntime.js:7-24`）。
- 在前端实现“技能注册表”与“工具构建”：从 `skill.json` 自动生成工具说明，替换当前手工的 `skill.load` 注入（参考 `buildToolSystemJSON` 在 `frontend/src/lib/agent.js:124-172`）。
- 引入统一错误模型与事件结构：将工具事件统一为 `started/running/completed/failed` 与标准 payload（目前散落在 `reasoningLoop` 里，见 `frontend/src/lib/agent.js:194-213, 248-265`）。

### Phase 2：触发协议与多模型适配
- 抽象 `LLMProvider` 层：`claude/openai/qwen` 三类实现，暴露统一 `createChatCompletion()`；当前 Qwen 兼容模式实现位于 `frontend/src/lib/agent.js:174-181`。
- 工具触发优先走“函数调用”能力（模型支持时）；不支持则回退到 `CALL/CALL_JSON` 文本协议（现已实现）。
- 将技能的 `input_schema`/`output_schema` 直接映射到函数调用 schema，提高调用稳定性与可观测性。

### Phase 3：后端安全执行与权限治理
- 实现缺失的 `server.js`（根 `package.json:6-9` 指定）：提供 `/tools/*` API，统一承载敏感技能与外部访问（API key 存 `.env`）。
- 权限模型：`skill.json.permissions` 定义可调用的后端工具与资源范围；在后端网关强制校验。
- 速率限制与审计：对每个技能/会话进行限流与日志记录，产出审计事件供前端展示。

### Phase 4：开发者体验与质量保障
- CLI/脚手架：`npm run skill:new` 生成模板；`skill:test` 本地运行；`skill:lint` 校验 schema/manifest。
- 示例与测试：为内置技能（项目介绍/价格/退款/保单）各自补充 `examples` 与单测，确保推理稳定。
- 文档与约定：README 增加“如何编写技能”“怎样声明权限与依赖”“如何调试”。

## 关键变更点（文件级）
- `frontend/src/lib/agent.js`：抽象 Provider；工具说明从技能注册表生成；事件模型标准化；保留 `CALL` 回退。
- `frontend/src/lib/skillsRuntime.js`：支持 YAML frontmatter；新增 `loadSkillManifest()` 与 `loadAllSkills()`；`loadSkillByName()` 返回结构体统一。
- `frontend/src/lib/localTools.js`：拆分为前端轻工具与后端工具代理。前端只保留非敏感能力；敏感工具改走后端。
- 根目录新增 `server.js`、`.env`、工具路由与权限校验中间件。
- `frontend/public/skills/*`：迁移到 `skills/*` 新结构，含 `skill.json/skill.md` 与 `examples/`。

## 验收与回退
- 可视化事件流：继续使用现有事件卡片渲染，新增审计事件与权限拒绝提示。
- 模型无函数调用时回退到 `CALL` 文本协议，保证行为不回归。
- 单测覆盖：`schema 校验`、`工具调用`、`权限拒绝`、`回退路径` 4 大类。

请确认以上方案，我将按 Phase 1 开始具体实现与迁移（从结构与运行时最小改造入手）。