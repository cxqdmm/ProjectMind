## 背景与选择
- 你当前项目已实现“Claude Skills”风格的本地技能系统，入口在 `frontend/src/lib/agent.js:407`，技能运行时在 `frontend/src/lib/skillsRuntime.js:24`，系统指令在 `frontend/src/lib/systemPrompt.js:1`，本地技能示例在 `frontend/src/skills/*`，清单在 `frontend/src/skills/manifest.json:1`。
- 开源生态里“OpenSkills”有两条主线：
  - OpenSkills（MCP 服务，BandarLabs）：在本机运行 Claude Skills，并通过 MCP 暴露给任何 MCP 客户端，适合与 Claude Desktop/Gemini/Qwen 等联动，支持本地沙盒执行代码。[GitHub: BandarLabs/open-skills](https://github.com/BandarLabs/open-skills)（来源）
  - OpenSkills（通用 CLI，numman-ali）：用 CLI 安装/管理技能，生成与 Claude Code 完全兼容的 `<available_skills>` 提示块，并可统一到 `.agent/skills` 供多代理共用。[GitHub: numman-ali/openskills](https://github.com/numman-ali/openskills)（来源）
- 官方技能仓库在 [anthropics/skills](https://github.com/anthropics/skills)（来源），包含文档类技能（pdf/xlsx/pptx/docx）与示例技能。

## 方案 A：集成 MCP 版 OpenSkills（BandarLabs）
- 目标：让 ProjectMind 通过 MCP 访问并运行本机技能，复用官方技能与本地代码执行能力。
- 使用方式（参考官方说明）：
  - 安装并启动 MCP 服务，服务默认暴露 `http://open-skills.local:8222/mcp`。
  - 在 Claude Desktop/Gemini/Qwen 等工具里配置该 MCP 服务即可使用技能。
  - 文档来源：[BandarLabs/open-skills](https://github.com/BandarLabs/open-skills)
- 项目内集成思路：
  - 在 `agent.js` 增加一个 `provider:"mcp"` 的工具路由，透传到 MCP 服务端，返回技能内容与执行结果（参考你现有的 `invokeMCPTool` 结构在 `frontend/src/lib/agent.js:61`）。
  - 在系统提示中加入来自 MCP 的可用技能索引（与当前 `buildToolSystemJSON`/技能索引拼装一致，见 `frontend/src/lib/agent.js:123`、`frontend/src/lib/agent.js:452`）。
  - 保留现有本地技能（`provider:"skill"`）作为离线兜底；新加的 MCP 技能作为增强路径。
- 适用场景与优点：需要跨工具复用技能、需要本地隔离执行或处理复杂文件（PDF/Office）。
- 风险与注意：前端直接请求 MCP 可能受跨域与持久连接限制，更稳妥的是在本项目的后端添加一个轻量代理再转发到 MCP。

## 方案 B：集成 CLI 版 OpenSkills（numman-ali）
- 目标：用 CLI 管理技能，自动生成 Claude Code 兼容的 `<available_skills>` 提示块，统一技能目录到 `.agent/skills` 或 `.claude/skills`，提升跨代理的可移植性。
- 使用方式（官方示例）：
  - 全局安装：`npm i -g openskills`
  - 安装技能：`openskills install anthropics/skills`
  - 生成提示块并写入 `AGENTS.md`：`openskills sync`
  - 文档来源：[numman-ali/openskills](https://github.com/numman-ali/openskills)
- 项目内集成思路：
  - 将 `AGENTS.md` 的 `<available_skills>` 区块读取进系统提示，作为“可用技能索引”（对应你现在的 `skillsMetaMsg` 逻辑在 `frontend/src/lib/agent.js:452`）。
  - 在工具层新增一个“读取技能正文”的命令通道，等价于执行 `openskills read <name>`，把输出注入对话上下文（与现有 `skill.load` 相同形态，见 `frontend/src/lib/agent.js:407`）。
  - 继续保留你现有的本地 `frontend/src/skills/*` 结构；增加一个脚本把 CLI 安装的技能同步/拷贝到 `frontend/src/skills/` 并更新 `manifest.json`（避免前端打包无法直接读取工作区外文件）。
- 适用场景与优点：与 Claude Code 提示格式完全一致；易于跨多代理共享；无需引入 MCP 通道即可获得技能管理与安装体验。
- 风险与注意：前端打包对动态读取工作区外路径有限制，建议在构建或开发前置阶段生成 `manifest.json` 与本地副本。

## 推荐路径
- 先落地方案 B（CLI 管理 + 读取 `AGENTS.md` + 同步到本地技能目录），与当前架构最兼容，改动小、见效快。
- 可选再添加方案 A（MCP），在需要本地隔离执行与跨工具协作时启用。

## 详细实施步骤（按推荐路径 B）
1. 在仓库根创建共享目录：`.agent/skills/`，并使用 CLI 安装官方技能与自定义技能。
2. 生成或维护 `AGENTS.md`（由 CLI 写入 `<available_skills>`），项目在启动时读取该区块并拼到系统提示。
3. 编写一个同步脚本：
   - 扫描 `.agent/skills/**/SKILL.md`，解析 name/description，拷贝到 `frontend/src/skills/<name>/SKILL.md` 与 `references/*`，并更新 `frontend/src/skills/manifest.json`。
   - 保持你现有 `skillsRuntime.js:24` 的解析逻辑不变（静态导入的 raw 文本）。
4. 在 `agent.js` 增加一个“外部技能读取”工具描述，形态与 `skill.load` 相同，但实现通过 CLI 输出注入（或直接使用已同步的本地副本）。
5. 验证：
   - 选取 `anthropics/skills` 中的一个轻量技能（如示例类技能），完成同步，确认技能索引与技能正文能被正确注入回答；
   - 保持现有 `poem_writer` 与 `bbc` 技能可用，确保回退路径有效。

## 最小使用指引
- 方案 A（MCP）：按 [BandarLabs/open-skills](https://github.com/BandarLabs/open-skills) 指南安装；把服务地址配置到你的工具或项目的 MCP 客户端；在项目中新增 `provider:"mcp"` 路由。
- 方案 B（CLI）：`npm i -g openskills` → `openskills install anthropics/skills` → `openskills sync`；读取 `AGENTS.md` 的 `<available_skills>` 并接入到你的系统提示与技能加载流程。

## 后续可选增强
- 引入官方文档技能（pdf/xlsx/pptx/docx）时，结合 MCP 方案提供本地文件处理与沙盒执行。
- 增加“skill.execute”执行脚本能力（你已有预留，见 `frontend/src/lib/agent.js:86` 注释块），用于确定性计算或模板生成。