# Change: 为 Agent 记忆引入文档化管理

## Why
当前记忆系统仅使用内存存储，缺乏持久化和版本管理能力。需要将记忆文档化，类似 skills 的目录管理方式，使得：
- 记忆可以持久化存储，不随会话结束而丢失
- 记忆可以版本化管理，支持更新、废弃等操作
- 记忆可以跨会话复用，提升系统效率
- 记忆内容可以人工审查和编辑

## What Changes
- 新增“记忆文档化（memory-documentation）”能力规范，定义记忆文件的存储格式和组织方式
- 设计记忆目录结构（类似 `server/memories/`），每个记忆条目对应一个 JSON 文件
- 定义记忆 JSON 格式规范：包含记忆内容、类型、关联技能元数据等信息
- 实现记忆文件的读取、写入、更新、废弃等基础操作接口
- 集成到现有记忆系统，支持从文档化记忆和运行时记忆的统一检索

## Impact
- Affected specs: 计划新增 `specs/memory-documentation/spec.md` 能力
- Affected code（预期影响区域）:
  - `server/services/memoryService.js`: 增加从文件系统读取/写入记忆的能力
  - 新增 `server/memories/` 目录结构，存储记忆 JSON 文件
  - 记忆检索逻辑需要合并文档化记忆和运行时记忆
