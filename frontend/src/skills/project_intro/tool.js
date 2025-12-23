export async function run(input) {
  const name = String(input?.name || '')
  const map = {
    '中小微线上': '面向中小微企业的线上化投保方案，支持快速批量导入与在线签署。',
    '中小微线下': '线下服务流程优化，适配各地合规要求，提供驻场支持。',
    '高端员福': '面向中大型企业的员工福利方案，覆盖高端医疗与补充保障。',
    '清单投保': '按清单逐项投保，灵活定制风险项与额度。'
  }
  return { name, intro: map[name] || '项目介绍待补充' }
}
