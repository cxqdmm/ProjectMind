export async function run(input) {
  const reason = String(input?.reason || '')
  const contact = '400-000-0000'
  const hours = '工作日 9:00-18:00'
  return { contact, hours, reason }
}
