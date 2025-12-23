export async function run(input) {
  const product = String(input?.product || '')
  const plans = [
    { name: 'Lite', price: 99, features: ['基础功能'] },
    { name: 'Pro', price: 199, features: ['全部功能', '优先支持'] }
  ]
  return { product, plans }
}
