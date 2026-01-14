// 提示服务：读取 AGENTS.md，或构建 fallback 的 <skills_system>
import { scanSkills } from './skillsService.js'

export function readAgentsPrompt() {
  const skills = scanSkills()
  const items = (Array.isArray(skills) ? skills : []).map((s) => {
    const name = String(s?.key || '').trim()
    const desc = String(s?.description || '').trim()
    const loc = 'project'
    return `<skill>\n<name>${name}</name>\n<description>${desc}</description>\n<location>${loc}</location>\n</skill>`
  }).join('\n')
  const usage = [
    '当用户要求你执行任务时，检查 <available_skills> 列表并判断是否有适用技能。',
    '',
    '技能使用方式：',
    '- 需要时，将该技能的 SKILL.md 内容加载到你的工作上下文。',
    '- 如有必要，从 references/<file> 加载配套文档。',
    '- 仅加载必要内容，避免冗余或批量加载。',
    '- 如果对话中已经出现“已捞取到技能…的…记忆缓存/缓存内容如下”这类内容，视为该技能内容已加载，无需重复 CALL_JSONS 调用。',
    '- 以“当前子任务”为单位管理上下文：只加载与当前子任务明显相关的技能描述/参考文件/脚本结果，避免把不相关内容带入思考。',
    '- 如果当前子任务依赖前序子任务结果，优先复用前序结果记忆；仅在确有必要时再调用工具重新获取。',
    '',
    '调用格式：',
    '- 读取技能：CALL_JSONS: [{\\"provider\\":\\"openskills\\",\\"tool\\":\\"read\\",\\"input\\":{\\"skill\\":\\"<skill-name>\\"}}]',
    '- 加载参考：CALL_JSONS: [{\\"provider\\":\\"openskills\\",\\"tool\\":\\"readReference\\",\\"input\\":{\\"skill\\":\\"<skill-name>\\",\\"file\\":\\"references/<file>\\"}}]',
    '- 调用脚本：CALL_JSONS: [{\\"provider\\":\\"openskills\\",\\"tool\\":\\"call\\",\\"input\\":{\\"skill\\":\\"<skill-name>\\",\\"script\\":\\"scripts/<script-file>\\",\\"params\\":{\\"<param1>\\":\\"<value1>\\",...}}}]',
    '- 批量调用：CALL_JSONS: [{\\"provider\\":\\"openskills\\",\\"tool\\":\\"read\\",\\"input\\":{\\"skill\\":\\"<skill-name>\\"}},{\\"provider\\":\\"openskills\\",\\"tool\\":\\"call\\",\\"input\\":{\\"skill\\":\\"<skill-name>\\",\\"script\\":\\"scripts/<script-file>\\",\\"params\\":{\\"<param1>\\":\\"<value1>\\",...}}}]',
    '',
    '必须遵守的规范：',
    '- 仅使用 <available_skills> 中列出的技能。',
    '- 不要调用或虚构未列出的技能。',
    '- 如果当前对话上下文已包含所需技能描述/参考文件/脚本调用结果（包括记忆缓存内容），则不要再使用 CALL_JSONS 重复调用。',
  ].join('\n')
  const combined = [
    '<usage>',
    usage,
    '</usage>',
    '',
    '<available_skills>',
    items,
    '</available_skills>',
  ].join('\n')
  return combined
}
