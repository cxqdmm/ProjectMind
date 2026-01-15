import { computed, ref } from 'vue'

export function useMemoryAdmin(opts = {}) {
  const baseUrl = String(opts.baseUrl || 'http://localhost:3334').replace(/\/$/, '')
  const includeDeprecated = ref(false)
  const list = ref([])
  const loading = ref(false)
  const error = ref('')

  const memories = computed(() => Array.isArray(list.value) ? list.value : [])

  async function refresh() {
    try {
      loading.value = true
      error.value = ''
      const url = `${baseUrl}/api/memories/files?includeDeprecated=${includeDeprecated.value ? '1' : '0'}`
      const r = await fetch(url)
      const j = await r.json()
      list.value = Array.isArray(j?.memories) ? j.memories : []
    } catch (e) {
      error.value = String(e?.message || e || '加载失败')
    } finally {
      loading.value = false
    }
  }

  async function getMemory(id) {
    const q = encodeURIComponent(String(id || ''))
    const r = await fetch(`${baseUrl}/api/memories/get?id=${q}`)
    const j = await r.json()
    if (!r.ok) throw new Error(String(j?.error || '读取失败'))
    return j
  }

  async function deprecate(id) {
    const r = await fetch(`${baseUrl}/api/memories/deprecate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(String(j?.error || '废弃失败'))
    return j
  }

  async function remove(id) {
    const r = await fetch(`${baseUrl}/api/memories/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(String(j?.error || '删除失败'))
    return j
  }

  return {
    includeDeprecated,
    memories,
    loading,
    error,
    refresh,
    getMemory,
    deprecate,
    remove,
  }
}

