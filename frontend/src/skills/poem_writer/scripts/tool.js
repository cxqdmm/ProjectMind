function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function suggestRhyme(theme, form) {
  const fallbacks = [
    { name: 'ang', examples: ['江', '阳', '香', '霜', '窗', '桑'] },
    { name: 'ong', examples: ['风', '松', '中', '鸿', '同', '红'] },
    { name: 'an', examples: ['山', '还', '间', '寒', '颜', '兰'] }
  ]
  if (String(theme).includes('春')) return { name: 'ong', examples: ['风', '鸿', '红', '同'] }
  if (String(theme).includes('秋')) return { name: 'ang', examples: ['霜', '光', '香', '桑'] }
  if (String(theme).includes('山')) return { name: 'an', examples: ['山', '间', '兰'] }
  return pick(fallbacks)
}

function suggestImagery(theme) {
  const s = String(theme || '')
  if (/春/.test(s)) return ['柳', '莺', '花', '雨', '烟', '江']
  if (/夏/.test(s)) return ['荷', '蝉', '舟', '云', '雷', '树荫']
  if (/秋/.test(s)) return ['雁', '枫', '月', '霜', '露', '长空']
  if (/冬|雪/.test(s)) return ['雪', '梅', '炉', '寒', '松', '冰']
  return ['云', '月', '风', '山', '江', '竹']
}

function tonePatterns(form) {
  if (form === 'qijue') {
    return [
      '平平仄仄平平仄',
      '仄仄平平仄仄平'
    ]
  }
  if (form === 'wujue') {
    return [
      '平平仄仄平',
      '仄仄平平仄'
    ]
  }
  // 律诗示意：仅给出颔/颈联需对仗提示
  return ['律诗：注意颔联、颈联对仗与粘对']
}

export async function run(input) {
  const theme = String(input?.theme || '')
  const rawForm = String(input?.form || 'qijue') // qijue|wujue|qilu|wulu
  const style = String(input?.style || 'tang')
  const acrostic = String(input?.acrostic || '')
  const form = ['qijue', 'wujue', 'qilu', 'wulu'].includes(rawForm) ? rawForm : 'qijue'
  const lines = form === 'qijue' || form === 'wujue' ? 4 : 8
  const rhyme = input?.rhyme && String(input.rhyme).length ? { name: input.rhyme, examples: [] } : suggestRhyme(theme, form)
  const patterns = tonePatterns(form)
  const imagery = suggestImagery(theme)
  const evaluation = {
    avoidModernWords: true,
    checkRhymeConsistency: true,
    checkParallelCouplets: form === 'qilu' || form === 'wulu',
    checkAcrostic: acrostic.length > 0
  }
  const guidance = [
    '意象要一致，避免现代词汇与科技术语',
    '尾字尽量统一韵部，必要时替换近义词以就韵',
    '律诗颔联颈联尝试对仗，词性与意象层级保持平衡'
  ]
  return {
    theme,
    form,
    style,
    lines,
    acrostic,
    rhyme,
    tonePatterns: patterns,
    imagery,
    evaluation,
    guidance
  }
}
