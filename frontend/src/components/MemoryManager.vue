<template>
  <div v-if="open" class="mem-overlay" @click.self="$emit('close')">
    <div class="mem-panel">
      <div class="mem-head">
        <div class="mem-title">记忆管理</div>
        <div class="mem-actions">
          <label class="mem-toggle">
            <input type="checkbox" v-model="includeDeprecatedLocal" @change="onRefresh" />
            显示已废弃
          </label>
          <button class="mem-btn" type="button" @click="onRefresh" :disabled="loading">{{ loading ? '加载中…' : '刷新' }}</button>
          <button class="mem-btn danger" type="button" @click="$emit('close')">关闭</button>
        </div>
      </div>

      <div class="mem-toolbar">
        <input v-model.trim="q" class="mem-search" type="text" placeholder="搜索：文件名 / skill / snippet / 内容" />
      </div>

      <div class="mem-body">
        <div v-if="error" class="mem-error">{{ error }}</div>
        <div v-else-if="loading" class="mem-empty">加载中…</div>
        <div v-else-if="!filtered.length" class="mem-empty">暂无记忆</div>
        <div v-else class="mem-list">
          <div v-for="item in filtered" :key="item.id" class="mem-item">
            <div class="mem-item-main">
              <div class="mem-item-top">
                <div class="mem-file" :title="item.file">{{ item.file }}</div>
                <div class="mem-tags">
                  <span class="mem-tag">{{ item.memory?.skill || '-' }}</span>
                  <span class="mem-tag muted">{{ item.memory?.toolName || item.memory?.type || '-' }}</span>
                  <span v-if="item.memory?.deprecated" class="mem-tag warn">已废弃</span>
                </div>
              </div>
              <div class="mem-snippet" :title="item.memory?.snippet || ''">{{ item.memory?.snippet || '' }}</div>
              <div class="mem-meta">
                <span>更新：{{ formatTime(item.memory?.updatedAt) }}</span>
                <span>创建：{{ formatTime(item.memory?.createdAt) }}</span>
              </div>
            </div>
            <div class="mem-item-actions">
              <button class="mem-btn" type="button" @click="onView(item)">查看</button>
              <button class="mem-btn" type="button" @click="onDeprecate(item)" :disabled="!!item.memory?.deprecated">废弃</button>
              <button class="mem-btn danger" type="button" @click="onDelete(item)">删除文件</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="viewerOpen" class="mem-viewer" @click.self="viewerOpen=false">
        <div class="mem-viewer-panel">
          <div class="mem-viewer-head">
            <div class="mem-viewer-title">{{ viewerTitle }}</div>
            <button class="mem-btn danger" type="button" @click="viewerOpen=false">关闭</button>
          </div>
          <pre class="mem-viewer-pre">{{ viewerText }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useMemoryAdmin } from '../composables/useMemoryAdmin.js'

const props = defineProps({
  open: { type: Boolean, default: false },
})

defineEmits(['close'])

const q = ref('')
const viewerOpen = ref(false)
const viewerTitle = ref('')
const viewerText = ref('')

const admin = useMemoryAdmin()
const includeDeprecatedLocal = ref(false)

watch(includeDeprecatedLocal, (v) => {
  admin.includeDeprecated.value = Boolean(v)
})

const loading = computed(() => admin.loading.value)
const error = computed(() => admin.error.value)
const list = computed(() => admin.memories.value)

const filtered = computed(() => {
  const arr = Array.isArray(list.value) ? list.value : []
  const kw = String(q.value || '').trim().toLowerCase()
  if (!kw) return arr
  return arr.filter((x) => {
    const file = String(x?.file || x?.id || '').toLowerCase()
    const skill = String(x?.memory?.skill || '').toLowerCase()
    const snippet = String(x?.memory?.snippet || '').toLowerCase()
    const content = String(x?.memory?.content || '').toLowerCase()
    return file.includes(kw) || skill.includes(kw) || snippet.includes(kw) || content.includes(kw)
  })
})

function formatTime(ts) {
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return '-'
  const d = new Date(n)
  const pad2 = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

async function onRefresh() {
  await admin.refresh()
}

async function onView(item) {
  try {
    const id = item?.id || item?.file
    const j = await admin.getMemory(id)
    viewerTitle.value = String(j?.file || id || '')
    viewerText.value = JSON.stringify(j?.memory || {}, null, 2)
    viewerOpen.value = true
  } catch (e) {
    admin.error.value = String(e?.message || e)
  }
}

async function onDeprecate(item) {
  const id = String(item?.id || item?.file || '')
  if (!id) return
  if (!confirm(`确认废弃该记忆？\\n\\n${id}`)) return
  try {
    await admin.deprecate(id)
    await admin.refresh()
  } catch (e) {
    admin.error.value = String(e?.message || e)
  }
}

async function onDelete(item) {
  const id = String(item?.id || item?.file || '')
  if (!id) return
  if (!confirm(`确认物理删除该记忆文件？\\n\\n${id}\\n\\n此操作不可恢复。`)) return
  try {
    await admin.remove(id)
    await admin.refresh()
  } catch (e) {
    admin.error.value = String(e?.message || e)
  }
}

watch(
  () => props.open,
  (v) => {
    if (v) onRefresh()
  }
)

onMounted(() => {
  if (props.open) onRefresh()
})
</script>

<style scoped>
.mem-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); z-index: 40; overflow: auto; display: flex; justify-content: center; align-items: flex-start; padding: 64px 20px; box-sizing: border-box; }
.mem-panel { width: min(980px, calc(100% - 0px)); background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.25); overflow: hidden; box-sizing: border-box; }
.mem-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #e5e7eb; }
.mem-title { font-size: 14px; font-weight: 800; color: #0f172a; }
.mem-actions { display: flex; align-items: center; gap: 10px; }
.mem-toggle { font-size: 12px; color: #475569; display: inline-flex; align-items: center; gap: 6px; }
.mem-btn { border: 1px solid #e5e7eb; background: #fff; color: #0f172a; font-size: 12px; border-radius: 12px; padding: 6px 10px; cursor: pointer; }
.mem-btn:hover { background: #f8fafc; }
.mem-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.mem-btn.danger { border-color: #fecaca; color: #b91c1c; }
.mem-btn.danger:hover { background: #fef2f2; }
.mem-toolbar { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; }
.mem-search { width: 100%; border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px 12px; font-size: 13px; outline: none; }
.mem-search:focus { border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
.mem-body { padding: 12px 14px; overflow: visible; }
.mem-error { padding: 10px 12px; border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; border-radius: 12px; font-size: 12px; }
.mem-empty { padding: 16px 12px; color: #64748b; font-size: 13px; text-align: left; }
.mem-list { display: grid; grid-template-columns: 1fr; gap: 10px; }
.mem-item { display: flex; gap: 12px; border: 1px solid #e5e7eb; border-radius: 14px; padding: 12px; background: #ffffff; align-items: flex-start; }
.mem-item-main { flex: 1; min-width: 0; }
.mem-item-top { display: flex; gap: 10px; align-items: center; justify-content: space-between; }
.mem-file { text-align: left;font-size: 12px; font-weight: 700; color: #0f172a; white-space: normal; overflow-wrap: anywhere; word-break: break-word; line-height: 1.35; }
.mem-tags { display: inline-flex; gap: 6px; align-items: center; flex-wrap: nowrap; justify-content: flex-end;  white-space: nowrap; }
.mem-tag { font-size: 11px; border: 1px solid #e5e7eb; background: #f8fafc; color: #334155; padding: 2px 8px; border-radius: 999px; }
.mem-tag.muted { background: #fff; color: #475569; }
.mem-tag.warn { background: #fffbeb; border-color: #fde68a; color: #b45309; }
.mem-snippet {text-align: left; margin-top: 6px; color: #475569; font-size: 12px; white-space: normal; overflow-wrap: anywhere; word-break: break-word; line-height: 1.5; }
.mem-meta { margin-top: 8px; display: flex; gap: 12px; color: #94a3b8; font-size: 11px; flex-wrap: wrap; }
.mem-item-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.mem-viewer { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); z-index: 50; overflow: auto; display: flex; justify-content: center; align-items: flex-start; padding: 80px 20px; box-sizing: border-box; }
.mem-viewer-panel { width: min(920px, 100%); background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.25); overflow: hidden; }
.mem-viewer-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #e5e7eb; }
.mem-viewer-title { font-size: 13px; font-weight: 800; color: #0f172a; white-space: normal; overflow-wrap: anywhere; word-break: break-word; flex: 1; min-width: 0; margin-right: 10px; }
.mem-viewer-pre { margin: 0; padding: 12px 14px; font-size: 12px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; background: #f8fafc; color: #0f172a; }
</style>
