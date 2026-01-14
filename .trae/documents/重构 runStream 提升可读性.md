## 现状梳理（runStream 当前在做什么）
runStream 目前把一整套“人类式处理流程”都塞在一个函数里，主要包含 6 个阶段：
1) 初始化：读配置、初始化 MCP、拿工具列表、创建 provider、读系统提示。
2) 上下文构建：加载历史会话、做一次“初始记忆选择”，拼 baseMessages，并 emit memory_used。
3) 工具队列执行：drainToolQueue（包含 tool_update emit、MCP/OpenSkills 分发、把工具结果转为 openSkill/tool 消息、写回 messages、追加记忆）。
4) 任务拆解与队列初始化：planTasksWithProvider → setTasks → emit task_list。
5) 子任务循环：取 nextTask → 标记 in_progress → 选择“任务结果记忆 + 技能记忆”注入 → 建子任务 prompt → 工具循环（CALL_JSONS）→ FINAL 结束子任务 → 写任务结果记忆 → push taskResults。
6) 最终汇总：基于 taskResults 生成总结提示 → 生成最终 FINAL → 写历史 & emit done。

可读性差的根因：
- 阶段逻辑混杂在一个函数里，局部变量跨越范围太大（provider/mcpTools/baseMessages/step/injectedMemoryKeys/taskResults 等）。
- drainToolQueue 单个函数就接近“一个子系统”（执行、emit、消息转换、记忆落库），需要拆分。

## 重构目标
- 保持行为不变（只做结构调整）。
- 单个函数不超过 50 行（以“逻辑行”计）。
- 尽量减少参数传递噪声：引入一个轻量上下文对象 ctx，把共用依赖（provider/mcpTools/emit/step/cfg…）集中管理。

## 计划改造（函数拆分方案）
### 1) 提取上下文对象与初始化函数
- 新增：`async function buildAgentContext(userInput, sessionId, emit, selection)`（<=50）
  - 读 cfg
  - initMcpClients + getMcpTools
  - createProvider
  - readAgentsPrompt
  - getSessionHistory
  - 返回 ctx：{ cfg, provider, systemPrompt, historyRaw, mcpTools, emit, sessionId, userInput, step: 1 }

### 2) 提取“初始记忆选择 + baseMessages”
- 新增：`async function buildBaseMessages(ctx)`（<=50）
  - recentUserInputs 计算
  - selectSkillMemoriesForQuestion
  - buildMemoryMessages + buildMemoryEventPayload
  - 初始化 injectedMemoryKeys
  - emit memory_used
  - 返回 { baseMessages, injectedMemoryKeys }

### 3) 把工具队列执行拆成 3～4 个小函数
- `async function drainToolQueue(ctx, messages)`（<=50）只做循环与调度：
  - next = getNextPendingToolCall
  - await execSingleToolCall(ctx, messages, next)
- `async function execSingleToolCall(ctx, messages, call)`（<=50）
  - mark started + emit running
  - 分发执行（MCP/OpenSkills）→ 得到 toolResult
  - mark completed/failed + emit
  - openMsgs = buildOpenMsgs(call, toolResult, error)
  - appendOpenMsgsToConversation(messages, openMsgs)
- `function buildOpenMsgs(call, toolResult, errorMsg)`（<=50）
  - 统一把结果转换成 openSkill/tool 结构
- `function appendOpenMsgsToConversation(messages, openMsgs)`（<=50）
  - appendSkillMemories + buildMemoryMessages
  - 追加 tool 输出到 messages（role:user）

### 4) 提取任务规划与初始化
- `async function planAndInitTasks(ctx, baseMessages)`（<=50）
  - resetTasks + resetToolQueue
  - planTasksWithProvider
  - setTasks
  - emit task_list
  - 返回 tasks（可选）

### 5) 提取子任务循环（再拆 2～3 个函数）
- `async function runAllTasks(ctx, baseMessages, injectedMemoryKeys)`（<=50）
  - while(nextTask) { result = await runSingleTask(...) ; push taskResults }
  - 返回 taskResults
- `async function runSingleTask(ctx, baseMessages, injectedMemoryKeys, taskResults, nextTask)`（<=50）
  - updateTask in_progress + emit
  - depTexts = buildDepTexts(taskResults, task)
  - { taskResultMessages, taskMemoryMessages } = await selectTaskMemories(...)
  - messages = buildTaskMessages(...)
  - final = await runTaskToolLoop(ctx, messages)
  - updateTask completed + emit + appendTaskResultMemory
  - return { title, result }
- `function buildDepTexts(taskResults, task)`（<=50）
- `async function selectTaskMemories(ctx, injectedMemoryKeys, memQuery)`（<=50）
  - selectTaskResultMemoriesForQuestion + buildTaskResultMessages
  - selectSkillMemoriesForQuestion + 去重 + emit memory_used + buildMemoryMessages
- `async function runTaskToolLoop(ctx, messages)`（<=50）
  - while { chat → if CALL_JSONS enqueue+emit+drain → continue ; else return FINAL }

### 6) 提取最终汇总输出
- `async function finalizeReport(ctx, baseMessages, taskResults)`（<=50）
  - build summaryLines
  - build finalMessages
  - chat once
  - appendSessionSegments
  - emit done

## 代码组织方式
- 保持在 agentService.js 内部：把这些 helper 放在文件顶部（runStream 之上/之下均可），runStream 本体只做“串联调用”，控制在 30～50 行。
- 不新增注释（遵循你项目当前风格），但通过函数命名表达语义。

## 验证方式
- 不改业务逻辑前提下做两类验证：
  - `node -e import('./server/services/agentService.js')` 通过
  - `FAKE_LLM=1` 跑一轮 runStream，检查事件序列：task_list/task_update/tool_calls/tool_update/memory_used/done 都仍能发出

如果你同意，我下一步就按以上拆分把 runStream 重构到“主流程 50 行以内”，并确保每个新函数都控制在 50 行以内。