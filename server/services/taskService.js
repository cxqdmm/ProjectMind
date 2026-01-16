import { readAgentsPrompt } from './promptService.js'

const tasksStore = []

function now() {
  return Date.now()
}

function newId() {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function normalizeStatus(s) {
  const v = String(s || '').trim()
  if (v === 'in_progress' || v === 'completed' || v === 'failed') return v
  return 'pending'
}

function normalizeTask(t, idx = 0) {
  const title = String(t?.title || t?.content || t || '').trim()
  const createdAt = Number(t?.createdAt || now())
  const updatedAt = Number(t?.updatedAt || createdAt)
  const dependsOn = Array.isArray(t?.dependsOn) ? t.dependsOn : []
  const deliverable = String(t?.deliverable || '').trim()
  return {
    id: String(t?.id || newId()),
    index: Number.isFinite(Number(t?.index)) ? Number(t.index) : idx,
    title: title || `子任务 ${idx + 1}`,
    dependsOn: dependsOn.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 0),
    deliverable,
    status: normalizeStatus(t?.status),
    createdAt,
    updatedAt,
    result: t?.result ?? null,
    error: t?.error ?? null,
  }
}

export function resetTasks(sessionId = 'default') {
  tasksStore.length = 0
}

export function setTasks(tasks = []) {
  const arr = Array.isArray(tasks) ? tasks : []
  const normalized = arr.map((t, i) => normalizeTask(t, i))
  tasksStore.length = 0
  tasksStore.push(...normalized)
  return tasksStore
}

export function getTasks() {
  return tasksStore
}

export function hasPendingTasks() {
  return getTasks().some((t) => t.status === 'pending' || t.status === 'in_progress')
}

export function getNextTask() {
  const tasks = getTasks()
  return tasks.find((t) => t.status === 'pending') || null
}

export function updateTask(taskId, patch = {}) {
  const next = tasksStore.map((t) => {
    if (String(t.id) !== String(taskId)) return t
    const updated = {
      ...t,
      ...patch,
      status: patch.status ? normalizeStatus(patch.status) : t.status,
      updatedAt: now(),
    }
    return normalizeTask(updated, t.index)
  })
  tasksStore.length = 0
  tasksStore.push(...next)
  return tasksStore.find((t) => String(t.id) === String(taskId)) || null
}

function parseJsonArray(text) {
  const s = String(text || '').trim()
  if (!s) return null
  try {
    const v = JSON.parse(s)
    if (Array.isArray(v)) return v
  } catch {}
  const m = s.match(/\[[\s\S]*\]/)
  if (m) {
    try {
      const v = JSON.parse(m[0])
      if (Array.isArray(v)) return v
    } catch {}
  }
  return null
}

function normalizePlannedTask(x, idx) {
  if (typeof x === 'string') {
    return {
      title: x.trim() || `子任务 ${idx + 1}`,
      dependsOn: [],
      deliverable: '',
    }
  }
  const title = String(x?.title || x?.task || x?.name || '').trim()
  const dependsOn = Array.isArray(x?.dependsOn) ? x.dependsOn : []
  const deliverable = String(x?.deliverable || '').trim()
  return {
    title: title || `子任务 ${idx + 1}`,
    dependsOn: dependsOn.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 0),
    deliverable,
  }
}

export async function planTasksWithProvider(provider, userInput, history = []) {
  const promptSystem =
    '你是一个“任务拆解器”。你的工作是把用户输入拆解为可执行的子任务列表。' +
    '你必须只输出一个 JSON 数组，数组元素为对象，不要输出任何其他文字。'
  const promptUser =
    '请基于“历史对话上下文”和“本次用户需求”，拆解为子任务列表：\n\n' +
    '历史对话上下文（摘要）：\n' +
    JSON.stringify(history) +
    '\n\n本次用户需求：\n' +
    String(userInput || '') +
    '\n\n要求：\n' +
    '- 子任务一定是为了完成“历史上下文中尚未完成的事情”，不要重复拆解已经完成的工作。\n' +
    '- 如果你判断：历史上下文已经包含完成本次需求所需的关键结果，且不需要进一步动作，请直接返回空数组 []。\n' +
    '- 子任务要按执行顺序排列。\n' +
    '- 子任务要能直接执行，尽量具体，但不要包含工具调用格式。\n' +
    '- 如果子任务依赖前面任务的结果，请在 dependsOn 里填依赖的子任务序号（从 0 开始）。\n' +
    '- deliverable 用一句话描述该子任务的产物（可选）。\n' +
    '- 如果需求很简单，可以只返回 1 条。\n\n' +
    '只输出 JSON 数组，例如：\n' +
    '[\n' +
    '  {"title":"获取变更文件列表","dependsOn":[],"deliverable":"变更文件列表"},\n' +
    '  {"title":"针对每个文件获取 diff 并审查","dependsOn":[0],"deliverable":"每个文件的问题表格"}\n' +
    ']'

  try {
    const raw = await provider.chat(
      [
        { role: 'system', content: promptSystem },
        { role: 'user', content: promptUser },
      ],
      []
    )
    const arr = parseJsonArray(raw) || []
    const cleaned = arr
      .map((x, i) => normalizePlannedTask(x, i))
      .filter((t) => t && t.title)
    return cleaned
  } catch {}
}
