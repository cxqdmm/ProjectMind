export async function run(input) {
  const id = String(input?.policyId || 'POLICY-001')
  return {
    policyId: id,
    rules: [
      { title: '既往史告知', detail: '近一年内重大疾病需如实告知' },
      { title: '体检报告', detail: '如有异常指标需补充说明' }
    ]
  }
}
