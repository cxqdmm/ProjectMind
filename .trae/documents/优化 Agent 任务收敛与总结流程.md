## 问题概述
- 当前流程：一次性规划 → 顺序执行所有子任务 → 直接进入总结。
- 风险：最后一个子任务可能识别到仍需继续，但流程强行总结，导致任务未完成。

## 目标
- 在“所有子任务执行完”后增加收敛判定，不满足完成标准则自动**迭代再规划**（继续执行），满足才终止并总结。
- 通过“协议化输出”与“Prompt 约束”避免模型误输出。

## Prompt 优化
- **任务级 Prompt（buildTaskMessages）**
  - 明确“完成门槛”：必须满足 deliverable/验收标准才能输出 FINAL；否则仅输出 CALL_JSONS。
  - 强化约束：
    - 只能二选一（CALL_JSONS | FINAL）；
    - 禁止回到自然语言解释；
    - 若依赖不满足或产物不完整，严格输出 CALL_JSONS。

- **总结/收敛 Prompt（finalizeGate）**
  - 新增 gate 提示：
    - “基于全部子任务结果，判断是否已完全满足用户需求与验收标准；若未满足，输出 FOLLOWUP_TASKS: [...]（结构化），否则输出 FINAL: <最终答复>。”
  - 输出协议：
    - 只能二选一：FOLLOWUP_TASKS | FINAL；
    - FOLLOWUP_TASKS 使用 JSON（任务标题、必要工具、预期产物）。

## 流程改造
- 新增函数：`finalizeGate(ctx, baseMessages, taskResults)`
  - 行为：向 LLM 询问收敛判定；解析结果：
    - 若输出 FINAL：照旧走 `finalizeReport`（或直接将该 FINAL 作为最终答复）。
    - 若输出 FOLLOWUP_TASKS：将这些任务作为新的 `planned`，走“再规划→执行”迭代。

- 修改主循环（runStream）：
  1) `planAndInitTasks`
  2) `runAllTasks`
  3) `finalizeGate`：
     - 如果 MORE（FOLLOWUP_TASKS）：`setTasks` 再次进入 2）；
     - 如果 FINAL：结束。
  4) 设定最大迭代 `N`（如 3-5），超过则“带当前进展的总结”并提示未完成项。

## 解析与鲁棒性
- 为 `FOLLOWUP_TASKS` / `CALL_JSONS` 增加解析器（宽容格式、严格字段校验）。
- 若模型输出不符合协议，回退一次重询（带错误反馈）。

## 事件与可视化
- 新增事件：
  - `plan_update`（FOLLOWUP_TASKS 确定时）
  - `finalization_gate`（收敛判定结果）
- 前端显示：在任务卡片上新增“迭代批次”标识、在总结前展示一次“已满足/未满足”的明确判定信息。

## 兼容性
- 保留现有 `FINAL` 与 `CALL_JSONS` 语义；仅在总结前插入 gate 步；不影响工具队列、记忆注入与任务 UI。

## 实施
- 新增 `finalizeGate` 与解析函数；
- 调整 runStream 主循环（插入 gate）；
- 更新 Prompt 文本（任务级与 gate）；
- 前端消费新事件（可选）。

## 迭代边界与安全
- 设最大迭代 N，加入“切分粒度”与“超时回退总结”；
- 在每次迭代前把上一轮产物落盘（记忆），确保上下文稳定。