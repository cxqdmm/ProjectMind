## 改动目标
- 标题改为“智能助手”，保留亮橙渐变头部风格
- 对话容器占据屏幕 80% 宽度，整体更宽更沉浸
- 助手消息用 Markdown 渲染，并进行 HTML 安全清理

## 技术方案
- 引入 Markdown 渲染与安全库：`marked` + `dompurify`
- 在 `App.vue` 中将助手消息的 `<pre>{{ m.content }}</pre>` 改为 `v-html` 渲染已清理的 Markdown HTML
- 提供基础的 Markdown 样式（标题、段落、列表、代码块、链接等）以适配亮橙主题
- 保持事件卡片与折叠交互不变，颜色与圆角沿用当前设计

## 具体修改
1) 依赖（frontend/package.json）
- 添加：`marked`、`dompurify`

2) `frontend/src/App.vue`
- 标题：将 `<h1>ProjectMind · Vue3 聊天演示</h1>` 改为 `智能助手`
- 宽度：将 `.main { max-width: 1080px; }` 改为 `.main { max-width: 80vw; }`
- Markdown 渲染：
  - 在 `<script setup>` 顶部引入：`import { marked } from 'marked'`; `import DOMPurify from 'dompurify'`
  - 新增函数：
    ```js
    function renderMarkdown(t) {
      try {
        return DOMPurify.sanitize(marked.parse(String(t || '')))
      } catch (_) {
        return DOMPurify.sanitize(String(t || ''))
      }
    }
    ```
  - 模板中改造消息正文：
    - 对助手消息：`<div class="md" v-html="renderMarkdown(m.content)"></div>`
    - 对用户消息仍用 `<pre>` 或同样渲染（可选）
- 样式：在 `<style scoped>` 追加 `.md` 的基础样式：
  - 标题、段落、列表、代码块、链接配色与间距
  - 代码块背景：浅橙；链接颜色：深橙；整体字号与行高匹配当前主题

3) 术语一致化（可选）
- 将“工具批次”文案改为“函数批次”，与后端 `function` 字段一致

## 验证步骤
- 启动前端后，发送包含 Markdown 的内容（如标题、列表、代码块）验证渲染效果
- 校验折叠/展开与事件卡片不受影响
- 检查 XSS 安全：在消息中包含 `<script>` 或不可信链接，确认被 `DOMPurify` 清理

## 影响范围与回滚
- 只改动 `App.vue` 样式与渲染逻辑；依赖新增 `marked`/`dompurify`
- 回滚：移除依赖与 `renderMarkdown`，模板恢复 `<pre>` 纯文本显示