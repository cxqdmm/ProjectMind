// 工具解析：解析 CALL_JSONS 固定结构
export function parseToolCalls(text) {
  const s = String(text || '')
  const out = []
  const mjArr =
    s.match(/CALL_JSONS\s*[:=]?\s*(\[[\s\S]*?\])/i) ||
    s.match(/CALL_JSON\s*[:=]?\s*(\[[\s\S]*?\])/i)
  if (mjArr) {
    try {
      const arr = JSON.parse(mjArr[1])
      if (Array.isArray(arr)) {
        for (const obj of arr) {
          let provider = String(obj?.provider || '').trim()
          let toolName = String(obj?.tool || '').trim()
          const input = obj?.input ?? {}
          if (toolName.includes('.')) {
            const parts = toolName.split('.')
            provider = provider || parts[0]
            toolName = parts.slice(1).join('.')
          }
          const normalized = provider && toolName ? `${provider}.${toolName.replace(new RegExp(`^${provider}\.`), '')}` : provider || toolName
          out.push({ provider, tool: normalized, toolName, input })
        }
      }
    } catch {}
  }
  const dedup = []
  const seen = new Set()
  for (const c of out) {
    const key = `${c.provider}|${c.tool}|${JSON.stringify(c.input)}`
    if (!seen.has(key)) {
      seen.add(key)
      dedup.push(c)
    }
  }
  return dedup
}
