import { ref } from 'vue'

export function useOpenState() {
  const openIds = ref(new Set())

  function isOpen(id) {
    return openIds.value.has(String(id))
  }

  function toggle(id) {
    const k = String(id)
    const s = new Set(openIds.value)
    if (s.has(k)) s.delete(k)
    else s.add(k)
    openIds.value = s
  }

  return { openIds, isOpen, toggle }
}

