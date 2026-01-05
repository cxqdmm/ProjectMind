## 概览
- OpenSkills 有两个常见实现：
  - Python/MCP 服务器版：GitHub 仓库“open-skills”，在本机运行一个 MCP 服务，供 Claude Desktop、Gemini CLI 等调用，依赖 Python 3.10+［https://github.com/BandarLabs/open-skills］。
  - Node/TypeScript CLI 版：npm 包“openskills”，以 CLI 管理/加载技能，生成与 Claude Code 一致的 <available_skills> 格式，并通过命令 `openskills read <name>` 输出 SKILL.md 内容［https://github.com/numman-ali/openskills］。
- 你的项目已具备前端 Skills 运行时（`skill.load` / `skill.loadReference`），文件位于 `frontend/src/lib/agent.js:61`、`frontend/src/lib/skillsRuntime.js:24`，清单位于 `frontend/src/skills/manifest.json:1`。
- 建议选择 TS/CLI 版“openskills”，用于安装与管理社区技能，再与现有前端 Skills 运行时对接，无需引入 MCP。

## 实施方案（TS/CLI 集成）
1. 安装与目录约定
- 全局安装 CLI：`npm i -g openskills`
- 使用通用目录：`openskills install anthropics/skills --universal`，将技能安装到 `.agent/skills/`；也可默认 `.claude/skills/`。

2. 目录对接与同步
- 新增一个项目脚本（Node）：扫描 `.agent/skills/**/SKILL.md`，解析 frontmatter，生成 `frontend/src/skills/manifest.json`，并将每个技能的 `SKILL.md` 与 `references/*` 复制/链接到 `frontend/src/skills/<name>/`。
- 保持你现有加载逻辑不变：`skillsRuntime.js` 仍从 `../skills/<name>/SKILL.md` 读取，引用文件走 `references/*`（已支持：`frontend/src/lib/skillsRuntime.js:49`）。

3. 系统提示与工具保持兼容
- 你的系统提示已注入“可用技能索引”（`agent.js:461`）与工具说明；同步后即可显示新技能。
- 无需新增工具：沿用 `skill.load` 与 `skill.loadReference`（`agent.js:407`）。

4. 使用流程
- 安装技能：`openskills install anthropics/skills`
- 同步清单：运行项目脚本，生成/更新 `manifest.json` 与技能文件夹
- 在对话中直接调用：模型先检查索引，再按需执行 `skill.load` → `skill.loadReference`，与你当前范式一致。

5. 备选方案（仅在需要 MCP 时）
- 若需将技能暴露为 MCP 服务供外部客户端共用，可部署 Python 版“open-skills”（本机隔离运行，HTTP MCP：`http://open-skills.local:8222/mcp`）。这与现有浏览器端运行时不同步，需要 MCP 客户端；对你当前前端集成价值较小。

## 验收与迁移注意
- 解析规则：遵循 Anthropic Skills 的 YAML frontmatter（至少 `name`、`description`），路径规则为 `references/*`（你的运行时已适配）。
- 安全与来源：仅安装可信技能仓库；避免执行型脚本在浏览器端直接运行。
- 版本控制：将同步后的 `frontend/src/skills/*` 与 `manifest.json` 纳入仓库，CLI 安装目录 `.agent/skills` 可忽略提交。

## 成果
- 在不引入 MCP 的前提下，获得面向 Claude Skills 生态的技能安装/管理能力，并与现有前端 Skills 运行时无缝对接，实现“Claude Skills”范式落地。
