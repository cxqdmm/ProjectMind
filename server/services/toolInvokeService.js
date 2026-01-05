// 工具调用：路由到技能服务
import { loadSkill, loadReference } from './skillsService.js'

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
          extras.push(ex)
        } catch {}
      }
      return { result: { key: name, extras } }
    }
    throw new Error(`tool ${full} not found`)
  }
  throw new Error(`provider ${provider} not supported`)
}

