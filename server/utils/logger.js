// 轻量日志
export const logger = {
  info: (...args) => { try { console.log('[INFO]', ...args) } catch {} },
  error: (...args) => { try { console.error('[ERROR]', ...args) } catch {} },
}

