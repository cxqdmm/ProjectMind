// 提示服务：读取 AGENTS.md，或构建 fallback 的 <skills_system>
import path from 'path'
import { readFileSafe } from '../utils/fsUtils.js'
import { scanSkills } from './skillsService.js'

export function readAgentsPrompt() {
  const p = path.join(process.cwd(), 'AGENTS.md')
  const txt = readFileSafe(p)
  if (txt && txt.includes('<skills_system')) return txt
  const skills = scanSkills()
  const items = (Array.isArray(skills) ? skills : []).map((s) => {
    const name = String(s?.key || '').trim()
    const desc = String(s?.description || '').trim()
    const loc = 'project'
    return `<skill>\n<name>${name}</name>\n<description>${desc}</description>\n<location>${loc}</location>\n</skill>`
  }).join('\n')
  const usage = [
    'When users ask you to perform tasks, check the list in <available_skills> and decide whether a skill applies.',
    '',
    'How to use skills:',
    '- Load the skill’s SKILL.md content into your working context when needed',
    '- If necessary, load supporting documents from references/<file>',
    '- Load only what is necessary; avoid redundant or bulk loading',
    '',
    'Invocation format:',
    '- Single call: CALL_JSONS: [{\\"provider\\":\\"openskills\\",\\"tool\\":\\"read\\",\\"input\\":{\\"skill\\":\\"<skill-name>\\"}}]',
    '- Load reference: CALL_JSONS: [{\\"provider\\":\\"openskills\\",\\"tool\\":\\"readReference\\",\\"input\\":{\\"skill\\":\\"<skill-name>\\",\\"file\\":\\"references/<file>\\"}}]',
    '- Batch calls: CALL_JSONS: [{\\"provider\\":\\"openskills\\",\\"tool\\":\\"read\\",\\"input\\":{\\"skill\\":\\"<skill-name>\\"}},{\\"provider\\":\\"openskills\\",\\"tool\\":\\"readReference\\",\\"input\\":{\\"skill\\":\\"<skill-name>\\",\\"file\\":\\"references/<file>\\"}}]',
    '',
    'Usage notes:',
    '- Only use skills listed in <available_skills>',
    '- Do not call or invent skills that are not listed',
    '- Do not reload a skill that is already present in context',
  ].join('\n')
  const xml = [
    '<skills_system priority="1">',
    '',
    '## Available Skills',
    '',
    '<usage>',
    usage,
    '</usage>',
    '',
    '<available_skills>',
    items,
    '</available_skills>',
    '',
    '</skills_system>',
  ].join('\n')
  return xml
}
