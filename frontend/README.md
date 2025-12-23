# Vue 3 + Vite

This template should help get you started developing with Vue 3 in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about IDE Support for Vue in the [Vue Docs Scaling up Guide](https://vuejs.org/guide/scaling-up/tooling.html#ide-support).

## 技能范式（Claude Skills 风格）
 - 技能目录：`frontend/src/skills/<key>/`，包含 `skill.json` 与 `SKILL.md`。
 - 清单：`frontend/src/skills/manifest.json` 列出所有技能键 `key`。
- 运行时：前端通过 `skill.load/skill.execute` 注入技能正文与定义，工具说明自动生成。
- 输入输出：在 `skill.json` 中声明 `input_schema` 与 `output_schema`，用于模型工具调用说明与校验。
- 校验：根目录执行 `npm run skill:lint` 校验技能 JSON 与 Markdown 完整性。
 - 渐进式披露：系统提示仅预加载技能的 `name/description` 索引；命中后通过 `skill.load` 按需加载 `SKILL.md` 正文与附加文件。

### 新建技能步骤
- 在 `frontend/public/skills/<new_key>/` 创建 `skill.json` 与 `SKILL.md`。
- 在 `manifest.json` 增加 `{ \"key\": \"<new_key>\", \"name\": \"...\", \"description\": \"...\" }`。
- 在 `frontend/src/skills/<new_key>/tool.js` 编写本地可执行函数：
  ```
  export async function run(input) {
    return { ... }
  }
  ```
- 通过 `CALL_JSON: {"provider":"skill","tool":"execute","input":{"skill":"<new_key>","args":{...}}}` 触发运行并返回结果。
 - 按需加载额外资源文件（同目录下文件）：
   - 调用：`CALL_JSON: {"provider":"skill","tool":"load","input":{"skill":"project_intro","files":["context.md"]}}`
   - 返回：`extras: [{ file, content }]`
