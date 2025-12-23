export async function run(input) {
  const op = '退款'
  const steps = [
    { title: '登录账号', detail: '使用注册手机号登录' },
    { title: '进入订单', detail: '选择需要退款的订单' },
    { title: '提交申请', detail: '填写退款原因并提交' }
  ]
  return { operation: op, steps }
}
