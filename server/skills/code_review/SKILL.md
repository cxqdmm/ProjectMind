---
name: code_review
description: 用于对 Git 仓库中的代码变更进行全面的代码审查，识别潜在的逻辑漏洞、语法错误、代码质量问题以及常见的编程陷阱。
---
# Code Review 技能

## 技能描述
该技能用于对 Git 仓库中的代码变更进行全面的代码审查，识别潜在的逻辑漏洞、语法错误、代码质量问题以及常见的编程陷阱。

## 审查范围
- 逻辑漏洞检测
- 语法错误识别
- 空值（null/undefined）访问风险
- 代码风格问题
- 性能优化建议
- 安全性问题
- 错误处理完整性

## 工具使用流程

### 1. 获取变更文件列表
首先调用 `gitdifffiles.js` 脚本获取两个分支之间的所有变更文件：

**调用方式：**
```
使用 code_review 技能的 gitdifffiles.js 脚本，参数：
- repoUrl: Git 仓库地址（支持 HTTPS 和 SSH 格式）
- branch1: 基础分支（通常是 main/master）
- branch2: 对比分支（需要审查的功能分支）
```

**示例：**
```
请获取 https://github.com/user/repo.git 仓库 main 分支和 feature-branch 分支之间的变更文件列表
```

**返回格式：**
```json
{
  "files": [
    {
      "filename": "src/utils/helper.js",
      "status": "modified",
      "additions": 15,
      "deletions": 3
    },
    {
      "filename": "src/components/Button.vue",
      "status": "added",
      "additions": 45,
      "deletions": 0
    }
  ],
  "totalChanges": 2
}
```

### 2. 获取具体文件差异
对列表中的每个文件，调用 `getDiffinfoOfFile.js` 脚本获取详细的变更内容：

**调用方式：**
```
使用 code_review 技能的 getDiffinfoOfFile.js 脚本，参数：
- repoUrl: Git 仓库地址
- branch1: 基础分支
- branch2: 对比分支  
- filename: 要查看的文件路径（来自第一步的列表）
```

**示例：**
```
请获取 src/utils/helper.js 文件在 main 分支和 feature-branch 分支之间的详细差异内容
```

**返回格式：**
```json
{
  "filename": "src/utils/helper.js",
  "content": "diff --git a/src/utils/helper.js b/src/utils/helper.js\nindex abc123..def456 100644\n--- a/src/utils/helper.js\n+++ b/src/utils/helper.js\n@@ -10,7 +10,15 @@ export function formatData(data) {\n   if (!data) return null;\n   \n   // 新增的处理逻辑\n-  const result = data.map(item => item.value);\n+  const result = data.map(item => {\n+    if (item && item.value) {\n+      return item.value.trim();\n+    }\n+    return null;\n+  });\n+  \n+  // 过滤空值\n+  return result.filter(Boolean);\n }",
  "stats": {
    "additions": 8,
    "deletions": 1
  }
}
```

### 3. 代码审查执行
获取到文件差异后，按照以下维度进行审查：

#### 逻辑漏洞检测
- 检查条件判断是否正确
- 循环逻辑是否完整
- 边界条件处理
- 并发安全性

#### 语法错误识别
- 语法结构正确性
- 类型使用是否恰当
- 函数调用参数匹配
- 返回值处理

#### 空值访问风险
重点检查以下模式：
```javascript
// 高风险代码示例
const value = obj.property.nested.value;  // 可能访问 undefined
const result = array[0].method();       // 可能访问 null
const data = getData().map(process);      // getData() 可能返回 null
```

#### 代码质量问题
- 重复代码检测
- 函数复杂度评估
- 命名规范检查
- 注释完整性

#### 安全性检查
- SQL 注入风险
- XSS 攻击漏洞
- 敏感信息暴露
- 权限控制逻辑

#### 错误处理
- try-catch 完整性
- 错误信息是否明确
- 异常恢复机制
- 日志记录是否充分

## 审查输出格式

本技能的审查结果输出必须“可复核、可定位、可执行”。为避免输出风格不一致，以下规则为强制要求。

### 强制要求（必须遵守）
1. **按文件逐个审查**：尽可能做到“一个文件一段完整审查”，不要把多个文件的问题混在同一张表里。
2. **必须输出表格**：每个文件必须输出一张 Markdown 表格（即便没有问题也要输出空表）。
3. **必须包含行号**：每条问题必须包含“文件路径 + 行号/行号范围”，例如 `src/utils/helper.js:L15` 或 `src/utils/helper.js:L18-L20`。
4. **代码片段必须带行号**：代码片段用代码块展示，并给每行加 `Lxx:` 前缀（展示 5～15 行上下文，突出问题行）。
5. **严重级别必须标准化**：仅允许使用 `P0`（必须立刻修）、`P1`（应尽快修）、`P2`（建议优化）、`P3`（可选）四档。
6. **结论可执行**：每个问题必须给出明确修复建议（可直接改的写具体改法；需要确认的写清要确认什么）。

### 子任务拆分策略（用于 Agent 规划与执行）
当需要审查一个分支/提交集合的差异时，子任务拆分应遵循：
1. **子任务 1：获取变更文件列表**（调用 `gitdifffiles.js`）
2. **子任务 2..N：逐文件审查**（每个变更文件一个子任务）
   - 每个“逐文件审查”子任务内部可再调用 `getDiffinfoOfFile.js` 拉取该文件 diff
   - 子任务产物必须是该文件的完整审查输出（包含“变更概览 + 问题表格 + 本文件建议”）
3. **最终汇总**：在所有文件审查完成后，生成总体结论（可选简短）

### 每个文件的输出结构（模板）
对每个文件的审查结果必须按以下结构输出：

```markdown
## 文件审查：src/utils/helper.js

### 变更概览
- 新增行数：8
- 删除行数：1
- 修改类型：功能增强

### 问题列表

| # | 文件路径 | 行号 | 代码片段（带行号） | 问题描述 | 严重级别 | 建议修复 |
|---:|---|---|---|---|---|---|
| 1 | src/utils/helper.js | L15 | ```js\nL12: export function formatData(data) {\nL13:   if (!data) return null;\nL14: \nL15:   const result = data.map(item => item.value.trim());\nL16:   return result;\nL17: }\n``` | 空值访问风险：`item` 或 `item.value` 可能为空，直接调用 `trim()` 会抛异常。 | P0 | 增加空值保护：`item?.value?.trim()`，并明确空值策略（返回 `''`/`null`/过滤）。 |
| 2 | src/utils/helper.js | L18-L20 | ```js\nL18: // 过滤空值\nL19: return result.filter(Boolean)\nL20: ``` | 过滤条件可能误伤有效值：`filter(Boolean)` 会过滤 `0`、`''` 等，需结合业务确认。 | P2 | 改为更精确条件，例如仅过滤 `null/undefined`：`x != null`。 |

### 代码质量评估
- 可维护性：良好
- 可读性：较好
- 性能：无明显问题
- 安全性：安全

### 建议
1. 添加单元测试覆盖边界情况
2. 考虑使用 TypeScript 进行类型约束
3. 添加 JSDoc 注释说明函数用途
```

### 总结输出（可选）
为避免重复信息，默认不需要额外汇总表。如果确实需要总结，只输出一段简短“总体结论”，包含以下信息即可：

```markdown
## 总体结论
- 审查文件数：N
- 发现问题数：M（其中 P0：A，P1：B，P2：C，P3：D）
- 最高优先级问题：<用一句话概述，带文件路径与行号>
```

## 使用示例

### 完整流程示例

**用户请求：**
```
请对 https://github.com/example/project 仓库的 main 分支和 feature/auth 分支进行代码审查。
```

**执行步骤：**

1. **获取变更文件列表**
   ```
   请获取 https://github.com/example/project 仓库 main 分支和 feature/auth 分支之间的变更文件列表
   ```

2. **逐个文件进行审查**
   ```
   请获取 src/utils/helper.js 文件在 main 分支和 feature/auth 分支之间的详细差异内容
   ```

3. **进行代码审查分析**
   基于获取到的差异内容，按照审查维度进行分析：
   - 检查逻辑漏洞
   - 识别语法错误
   - 检测空值访问风险
   - 评估代码质量
   - 检查安全性问题
   - 验证错误处理

4. **输出审查结果**
   按照标准格式输出每个文件的审查结果

5. **总结审查结果**
   汇总所有文件的审查结果，提供整体评估和改进建议

## 注意事项

1. **仓库访问权限**：确保有权限访问目标 Git 仓库
2. **分支存在性**：确认对比的分支都存在
3. **文件大小限制**：对于大文件，建议分段处理
4. **二进制文件**：跳过非文本文件的审查
5. **依赖关系**：注意文件间的依赖变更

## 最佳实践

1. **增量审查**：优先关注新增和修改的文件
2. **重点检查**：对核心业务逻辑进行深度审查
3. **自动化集成**：可以与 CI/CD 流程集成
4. **团队协作**：建立代码审查标准和checklist
5. **持续改进**：根据发现的问题更新审查规则
