## 要点
- 生成符合 OpenSkills 的官方 `AGENTS.md`，包含 `<skills_system>`、`<usage>` 与 `<available_skills>` 列表
- 服务端代理完全使用 `AGENTS.md` 的系统提示，不再注入自定义工具说明 JSON
- 清理 `server/lib/agent.js` 中不再需要的代码块（工具清单构造、未用函数与多余 import）

## 生成 AGENTS.md（官方格式）
- 内容：
```
<skills_system priority="1">

## Available Skills

<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively.

How to use skills:
- Invoke: CALL_JSONS [{"provider":"openskills","tool":"read","input":{"skill":"<skill-name>"}}]
- To load references: CALL_JSONS [{"provider":"openskills","tool":"readReference","input":{"skill":"<skill-name>","file":"references/<file>"}}]
- The skill content will load with detailed instructions

Usage notes:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context
</usage>

<available_skills>
<skill>
<name>poem_writer</name>
<description>用于中文诗歌创作（现代诗/五绝/七绝/词），支持自检与润色。</description>
<location>project</location>
</skill>
<skill>
<name>bbc</name>
<description>面向 BBC（企业合作线下）保险业务的流程与规则说明。</description>
<location>project</location>
</skill>
</available_skills>

</skills_system>
```
- 位置：项目根目录 `AGENTS.md`
- 维护：后续通过 `openskills sync -o ./AGENTS.md` 自动生成或更新 `<skills_system>`

## 代码清理（server/lib/agent.js）
- 删除工具清单构造块：`L196-233`（skill.load/skill.loadReference 及 openskills.read/openskills.readReference 的定义与 `payload.tools` 聚合）
- 删除未使用函数：`buildToolSystemJSON`（若当前文件内无引用）
- 调整 import：移除未使用的 `loadSkillsManifest` 与 `SYS_REASONING_MSG` 引入
- 保留 `invokeMCPTool` 对 `openskills.read` / `openskills.readReference` 的支持（已实现）
- 系统消息构造：仅注入从 `AGENTS.md` 读取的 `<skills_system>`；若 `AGENTS.md` 不存在，则用当前技能清单动态生成同等提示

## 验证
- 启动服务：`node server.js`
- 验证系统提示生效：在请求 `POST /api/agent/run` 的上下文中，模型可按 `AGENTS.md` 指导触发 `openskills.read` 与 `openskills.readReference`
- 验证技能加载：
  - `GET /api/skills/load?skill=poem_writer` 返回 meta/body
  - `GET /api/skills/reference?skill=poem_writer&file=qijue.md` 返回引用内容

## 说明
- 保留 `invokeMCPTool` 中的 `skill.*` 兼容路径可选；建议逐步弃用，改为只暴露 `openskills.*`，以避免双范式并存
- 若未来需要多来源标注，可在 `<location>` 中区分 `server`/`agent`/`claude`/`project` 来源