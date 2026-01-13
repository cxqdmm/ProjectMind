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

为了让用户更容易阅读与定位问题，审查输出必须满足以下要求：

1. **必须定位到行号**：每个问题必须包含“文件路径 + 行号/行号范围”，例如 `src/utils/helper.js:L15` 或 `src/utils/helper.js:L18-L20`。
2. **代码展示必须带行号**：引用代码片段时，使用带行号的代码块（可用 `L15:` 这种前缀行号格式），并尽量只展示与问题相关的 5～15 行上下文。
3. **问题列表必须用表格**：对每个文件输出一个问题表格，列包含：问题序号、文件路径、行号、代码片段（带行号）、问题描述、严重级别、建议修复。
4. **先概览再细节**：每个文件先输出“变更概览”，再输出“问题表格”，最后给出“整体建议”。

对每个文件的审查结果按照以下结构输出（示例模板）：

```markdown
## 文件审查：src/utils/helper.js

### 变更概览
- 新增行数：8
- 删除行数：1
- 修改类型：功能增强

### 问题列表

| # | 文件路径 | 行号 | 代码片段（带行号） | 问题描述 | 严重级别 | 建议修复 |
|---:|---|---|---|---|---|---|
| 1 | src/utils/helper.js | L15 | ```js\nL15: const result = data.map(item => item.value.trim());\n``` | 空值访问风险：`item` 或 `item.value` 可能为空，直接调用 `trim()` 会抛异常。 | 🔴 严重 | 增加空值保护：`item?.value?.trim() ?? ''`，并确认空值策略。 |
| 2 | src/utils/helper.js | L18-L20 | ```js\nL18: // 过滤空值\nL19: return result.filter(Boolean);\n``` | 逻辑可能不严谨：`filter(Boolean)` 会过滤掉 `0`、`''` 等可能有效值，需要结合业务确认。 | 🟡 一般 | 改为更精确的过滤条件，例如只过滤 `null/undefined`。 |

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
为避免重复信息，默认不需要按文件再做一张“汇总表”。如果确实需要总结，只输出一句“总体结论”，包含以下信息即可：

```markdown
## 总体结论
- 审查文件数：N
- 发现问题数：M（其中严重：S）
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
