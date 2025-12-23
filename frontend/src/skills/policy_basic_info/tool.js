export async function run(input) {
  const id = String(input?.policyId || 'POLICY-001')
  return {
    policyId: id,
    effectiveDate: '2025-01-01',
    expiryDate: '2026-01-01',
    insuredAmount: 100000,
    diseaseScope: '重疾与轻疾'
  }
}
