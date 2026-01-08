## Context
当前记忆系统仅使用内存存储（`memoryStore`），记忆在会话结束后丢失。需要引入文档化存储，使记忆可以持久化、版本化管理，并支持跨会话复用。

## Goals / Non-Goals

### Goals
- 记忆以 JSON 文件形式存储在 `server/memories/` 目录
- 支持技能记忆和参考文件记忆两种类型
- 记忆文件包含完整的元数据（技能名称、描述等）
- 文档化记忆与运行时记忆统一检索
- 支持记忆的更新和废弃操作

### Non-Goals
- 不实现复杂的版本控制系统（如 Git）
- 不实现记忆的自动同步机制（手动管理）
- 不实现记忆的分布式存储（单机文件系统）

## Decisions

### Decision: 记忆文件命名规则
使用格式：`{skill}-{type}-{hash}.json`
- `skill`: 技能名称（kebab-case）
- `type`: `skill` 或 `reference`
- `hash`: 内容摘要的前 8 位（用于去重）

示例：
- `poem-writer-skill-a1b2c3d4.json`
- `poem-writer-reference-qijue-e5f6g7h8.json`

### Decision: JSON Schema 设计

#### 技能记忆 JSON Schema
```json
{
  "id": "string (UUID or hash-based)",
  "type": "skill",
  "content": "string (完整技能内容)",
  "snippet": "string (摘要，用于检索展示)",
  "skill": "string (技能名称)",
  "skillDescription": "string (技能描述)",
  "createdAt": "number (Unix timestamp)",
  "updatedAt": "number (Unix timestamp)",
  "meta": {
    "name": "string (可选，技能元数据中的 name)",
    "description": "string (可选，技能元数据中的 description)"
  }
}
```

#### 参考文件记忆 JSON Schema
```json
{
  "id": "string (UUID or hash-based)",
  "type": "reference",
  "content": "string (完整参考文件内容)",
  "snippet": "string (摘要，通常使用 meta.name + meta.description)",
  "skill": "string (技能名称)",
  "skillDescription": "string (技能描述)",
  "reference": "string (参考文件路径，如 references/qijue.md)",
  "createdAt": "number (Unix timestamp)",
  "updatedAt": "number (Unix timestamp)",
  "meta": {
    "name": "string (参考文件的 name，来自 frontmatter)",
    "description": "string (参考文件的 description，来自 frontmatter)"
  }
}
```

### Decision: 目录结构
```
server/memories/
├── poem-writer-skill-*.json
├── poem-writer-reference-*.json
├── bbc-skill-*.json
├── bbc-reference-*.json
└── .deprecated/  (废弃的记忆文件)
    └── ...
```

### Decision: 记忆合并策略
1. 读取 `server/memories/` 目录下所有 `.json` 文件（排除 `.deprecated/`）
2. 解析 JSON，构建文档化记忆列表
3. 与运行时记忆（`memoryStore`）合并
4. 去重策略：相同 `skill` + `type` + `reference`（如适用）时，优先使用文档化记忆
5. 如果文档化记忆的 `updatedAt` 更旧，则使用运行时记忆

## Risks / Trade-offs

### Risk: 文件系统 I/O 性能
- **Mitigation**: 缓存已读取的记忆文件，仅在启动时或文件变更时重新读取

### Risk: 记忆文件数量增长
- **Mitigation**: 定期清理废弃记忆，限制每个技能的记忆文件数量

### Risk: JSON 格式不一致
- **Mitigation**: 实现 JSON Schema 验证，提供迁移工具

## Migration Plan

1. 创建 `server/memories/` 目录
2. 实现记忆文件的读写接口
3. 在 `memoryService.js` 中集成文档化记忆读取
4. 实现记忆合并逻辑
5. 提供工具函数将现有运行时记忆导出为 JSON 文件（可选）

## Open Questions
- 是否需要支持记忆文件的自动生成（从技能内容自动创建）？
- 记忆文件的更新是否需要版本历史记录？
