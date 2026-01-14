import { ref } from 'vue'

export function useSkills(opts = {}) {
  const baseUrl = String(opts.baseUrl || 'http://localhost:3334').replace(/\/$/, '')
  const skills = ref([])
  const loading = ref(false)
  const error = ref('')

  async function refresh() {
    try {
      loading.value = true
      error.value = ''
      const r = await fetch(`${baseUrl}/api/skills/manifest`)
      const j = await r.json()
      const arr = Array.isArray(j?.skills) ? j.skills : []
      skills.value = arr.map((x) => ({
        key: String(x?.key || ''),
        name: String(x?.name || ''),
        description: String(x?.description || ''),
      }))
    } catch (e) {
      error.value = '加载失败'
    } finally {
      loading.value = false
    }
  }

  return { skills, loading, error, refresh }
}

