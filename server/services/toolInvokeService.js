// 工具调用：路由到技能服务
import { loadSkill, loadReference, callSkillScript } from './skillsService.js'

export async function invoke(provider, tool, input) {
  const full = tool && tool.includes('.') ? tool : `${provider}.${tool}`
  if (provider === 'openskills') {
    const name = String(input?.skill || '')
    if (!name) throw new Error('skill required')
    if (full === 'openskills.read') {
      const s = await Promise.resolve(loadSkill(name))
      return { result: { key: s.key, meta: s.meta, body: s.body } }
    }
    if (full === 'openskills.readReference') {
      const files = Array.isArray(input?.files) ? input.files : input?.file ? [input.file] : []
      const extras = []
      for (const f of files) {
        try {
          const ex = await Promise.resolve(loadReference(name, String(f)))
          extras.push({ file: ex.file, meta: ex.meta || {}, content: ex.content })
        } catch {}
      }
      return { result: { key: name, extras } }
    }
    if (full === 'openskills.call') {
      // 调用技能脚本函数
      const script = String(input?.script || '')
      if (!script) throw new Error('script required')
      
      // 提取参数对象（除了 skill 和 script 之外的所有参数）
      const { params } = input
      
      // 调用技能服务中的脚本执行函数
      try {
        const result = await callSkillScript(name, script, params)
        return { result }
      } catch (e) {
        throw new Error(`脚本执行失败: ${e.message}`)
      }
    }
    throw new Error(`tool ${full} not found`)
  }
  throw new Error(`provider ${provider} not supported`)
}