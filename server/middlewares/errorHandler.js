// 全局错误处理中间件：统一 JSON 错误输出
export function errorHandler(err, req, res, next) {
  const code = err?.code || 'INTERNAL_ERROR'
  const message = String(err?.message || 'internal error')
  res.status(500).json({ error: { code, message } })
}

