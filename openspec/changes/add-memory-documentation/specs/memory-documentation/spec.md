## ADDED Requirements

### Requirement: 记忆必须以 JSON 文件形式文档化存储
系统 SHALL 将记忆条目以 JSON 文件形式存储在 `server/memories/` 目录下，每个记忆条目对应一个独立的 JSON 文件，支持持久化存储和版本管理。

#### Scenario: 创建新的文档化记忆
- **WHEN** 需要将技能内容或参考文件内容保存为文档化记忆
- **THEN** 系统 SHALL 在 `server/memories/` 目录下创建对应的 JSON 文件
- **AND** SHALL 使用规范的 JSON 格式，包含所有必需字段和元数据
- **AND** SHALL 使用有意义的文件名（如基于技能名和内容摘要生成）

#### Scenario: 读取文档化记忆
- **WHEN** 系统需要检索记忆时
- **THEN** 系统 SHALL 从 `server/memories/` 目录读取所有有效的记忆 JSON 文件
- **AND** SHALL 解析 JSON 内容并合并到记忆检索候选池中

### Requirement: 记忆 JSON 格式必须包含核心字段和元数据
记忆 JSON 文件 SHALL 包含记忆内容、类型、创建时间等核心字段；对于技能相关记忆，SHALL 额外包含技能名称、技能描述等元数据信息。

#### Scenario: 技能记忆的 JSON 格式
- **WHEN** 创建一个技能正文的记忆条目
- **THEN** JSON 文件 SHALL 包含以下字段：
  - `id`: 唯一标识符
  - `type`: 记忆类型（如 "skill" 或 "reference"）
  - `content`: 记忆的完整内容
  - `snippet`: 记忆摘要（用于检索展示）
  - `skill`: 技能名称（必需）
  - `skillDescription`: 技能描述（必需）
  - `createdAt`: 创建时间戳
  - `updatedAt`: 更新时间戳
  - `meta`: 其他元数据对象

#### Scenario: 参考文件记忆的 JSON 格式
- **WHEN** 创建一个技能参考文件的记忆条目
- **THEN** JSON 文件 SHALL 包含技能记忆的所有字段
- **AND** SHALL 额外包含 `reference` 字段（参考文件路径）
- **AND** SHALL 在 `meta` 中包含参考文件的元数据（如 name、description）

### Requirement: 文档化记忆必须与运行时记忆统一检索
系统 SHALL 在记忆检索时，将文档化记忆（从文件系统读取）与运行时记忆（从内存存储读取）合并，提供统一的检索接口。

#### Scenario: 合并文档化记忆和运行时记忆
- **WHEN** 系统执行记忆检索时
- **THEN** 系统 SHALL 同时读取 `server/memories/` 目录下的所有记忆文件
- **AND** SHALL 将文档化记忆与当前会话的运行时记忆合并为统一的候选池
- **AND** SHALL 在记忆选择时对两类记忆一视同仁，基于相关性选择

#### Scenario: 记忆优先级和去重
- **WHEN** 文档化记忆与运行时记忆存在重复（如相同技能内容）
- **THEN** 系统 SHALL 优先使用文档化记忆（更稳定、可审查）
- **OR** SHALL 使用最近更新的记忆版本

### Requirement: 记忆文件必须支持更新和废弃操作
系统 SHALL 支持对文档化记忆的更新（修改 JSON 文件内容）和废弃（标记为无效或移动到废弃目录），确保记忆库的维护和演进。

#### Scenario: 更新记忆内容
- **WHEN** 技能内容或参考文件发生变化，需要更新对应记忆
- **THEN** 系统 SHALL 支持更新现有记忆 JSON 文件的 `content` 和 `updatedAt` 字段
- **AND** SHALL 保持 `id` 和其他元数据字段的稳定性

#### Scenario: 废弃过时记忆
- **WHEN** 某条记忆被判定为过时或无效
- **THEN** 系统 SHALL 支持将记忆文件移动到废弃目录（如 `server/memories/.deprecated/`）
- **OR** SHALL 在 JSON 文件中添加 `deprecated: true` 标记
- **AND** SHALL 在检索时排除已废弃的记忆
