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
    '',
    '调用格式：',
    '- 单次调用：CALL_JSONS: [{\\"provider\\":\\"openskills\\",\\"tool\\":\\"read\\",\\"input\\":{\\"skill\\":\\"<skill-name>\\"}}]',
    '- 加载参考：CALL_JSONS: [{\\"provider\\":\\"openskills\\",\\"tool\\":\\"readReference\\",\\"input\\":{\\"skill\\":\\"<skill-name>\\",\\"file\\":\\"references/<file>\\"}}]',
    '- 批量调用：CALL_JSONS: [{\\"provider\\":\\"openskills\\",\\"tool\\":\\"read\\",\\"input\\":{\\"skill\\":\\"<skill-name>\\"}},{\\"provider\\":\\"openskills\\",\\"tool\\":\\"readReference\\",\\"input\\":{\\"skill\\":\\"<skill-name>\\",\\"file\\":\\"references/<file>\\"}}]',
    '',
    '必须遵守的规范：',
    '- 仅使用 <available_skills> 中列出的技能。',
    '- 不要调用或虚构未列出的技能。',
    '- 如果已经存在需要的技能正文 和 技能参考文件。则不要再使用CALL_JSONS调用。',
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
