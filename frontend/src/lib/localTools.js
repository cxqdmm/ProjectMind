async function tryImportSkillTool(key) {
  try {
    const mod = await import(`../skills/${key}/tool.js`)
    return typeof mod?.run === 'function' ? mod.run : null
  } catch {
    return null
  }
}

export const LOCAL_MCP_TOOLS = {
  'policy.basic_info': (input) => {
    const id = String(input?.policyId || 'POLICY-001')
    return {
      policyId: id,
      effectiveDate: '2025-01-01',
      expiryDate: '2026-01-01',
      insuredAmount: 100000,
      diseaseScope: '重疾与轻疾'
    }
  },
  'policy.health_rules': (input) => {
    const id = String(input?.policyId || 'POLICY-001')
    return {
      policyId: id,
      rules: [
        { title: '既往史告知', detail: '近一年内重大疾病需如实告知' },
        { title: '体检报告', detail: '如有异常指标需补充说明' }
      ]
    }
  },
  'policy.operation_guide': (input) => {
    const op = String(input?.operation || '投保')
    const steps = op === '退款'
      ? [
          { title: '登录账号', detail: '使用注册手机号登录' },
          { title: '进入订单', detail: '选择需要退款的订单' },
          { title: '提交申请', detail: '填写退款原因并提交' }
        ]
      : [
          { title: '选择产品', detail: '在产品列表中选择合适方案' },
          { title: '填写信息', detail: '按要求填写被保人与投保人信息' },
          { title: '完成支付', detail: '核对保费后完成支付' }
        ]
    return { operation: op, steps }
  },
  'project.intro': (input) => {
    const name = String(input?.name || '')
    const map = {
      '中小微线上': '面向中小微企业的线上化投保方案，支持快速批量导入与在线签署。',
      '中小微线下': '线下服务流程优化，适配各地合规要求，提供驻场支持。',
      '高端员福': '面向中大型企业的员工福利方案，覆盖高端医疗与补充保障。',
      '清单投保': '按清单逐项投保，灵活定制风险项与额度。'
    }
    return { name, intro: map[name] || '项目介绍待补充' }
  },
  'skill.list': async () => {
    const { loadSkillsManifest } = await import('./skillsRuntime.js')
    const m = await loadSkillsManifest()
    return m
  },
  'skill.load': async (input) => {
    const { loadSkillByName, fetchSkillFile } = await import('./skillsRuntime.js')
    const key = String(input?.skill || '')
    const s = await loadSkillByName(key)
    const files = Array.isArray(input?.files) ? input.files : []
    const extras = []
    for (const f of files) {
      try {
        const ex = await fetchSkillFile(key, f)
        extras.push(ex)
      } catch {}
    }
    return { key: s.key, meta: s.meta, body: s.body, extras }
  },
  'skill.execute': async (input) => {
    const { loadSkillManifest, loadSkillByName } = await import('./skillsRuntime.js')
    const key = String(input?.skill || '')
    if (!key) throw new Error('skill required')
    const def = await loadSkillManifest(key)
    const s = await loadSkillByName(key)
    const args = input?.args || {}
    let result = null
    const runner = await tryImportSkillTool(key)
    if (runner) {
      result = await Promise.resolve(runner(args))
    }
    return { key, manifest: def, args, body: s.body, result }
  }
}
