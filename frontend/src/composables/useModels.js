import { ref } from 'vue'

export function useModels(opts = {}) {
  const baseUrl = String(opts.baseUrl || 'http://localhost:3334').replace(/\/$/, '')
  const models = ref([])
  const loading = ref(false)
  const error = ref('')
  const selectedModel = ref(null)
  const currentLabel = ref('')

  function syncLabel() {
    const cur = selectedModel.value
    if (!cur) {
      currentLabel.value = ''
      return
    }
    const found = models.value.find((m) => m.provider === cur.provider && m.model === cur.model)
    currentLabel.value = found ? found.label : ''
  }

  async function refresh() {
    try {
      loading.value = true
      error.value = ''
      const r = await fetch(`${baseUrl}/api/models`)
      const j = await r.json()
      const arr = Array.isArray(j?.models) ? j.models : []
      models.value = arr.map((x) => ({
        id: String(x?.id || ''),
        label: String(x?.label || ''),
        provider: String(x?.provider || ''),
        model: String(x?.model || ''),
        baseURL: String(x?.baseURL || ''),
        enabled: Boolean(x?.enabled),
      }))

      if (selectedModel.value) {
        syncLabel()
        return
      }
      const firstEnabled = models.value.find((m) => m.enabled)
      if (firstEnabled) {
        selectedModel.value = { provider: firstEnabled.provider, model: firstEnabled.model }
        currentLabel.value = firstEnabled.label
      } else {
        currentLabel.value = ''
      }
    } catch (e) {
      error.value = '加载失败'
    } finally {
      loading.value = false
    }
  }

  function choose(modelItem) {
    if (!modelItem?.enabled) return
    selectedModel.value = { provider: modelItem.provider, model: modelItem.model }
    currentLabel.value = String(modelItem.label || '')
  }

  return { models, loading, error, selectedModel, currentLabel, refresh, choose }
}

