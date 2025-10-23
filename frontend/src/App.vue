<template>
  <div class="app">
    <header class="header">
      <h1>ProjectMind · Vue3 聊天演示</h1>
      <p class="subtitle">产品咨询与客诉问题最小可用骨架</p>
    </header>

    <main class="main">
      <div class="messages" ref="messagesRef">
        <div v-for="(m, idx) in messages" :key="idx" class="message" :class="m.role">
          <div class="role">{{ m.role === 'user' ? '你' : '助手' }}</div>
          <div class="content">
            <pre>{{ m.content }}</pre>
            <div v-if="m.citations?.length" class="citations">
              引用：
              <span v-for="(c, i) in m.citations" :key="i" class="citation-item" :title="c.snippet || ''">
                {{ c.title }} · {{ c.source }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <form class="input-row" @submit.prevent="onSend">
        <input v-model.trim="input" type="text" placeholder="例如：ProjectMind Pro 的价格？或 如何申请退款？" />
        <button type="submit" :disabled="sending">{{ sending ? '发送中...' : '发送' }}</button>
      </form>
      <p class="tip">前端使用 Vue3 + Vite，后端为 Express，在本地跨域调用。</p>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'

const messages = ref([])
const input = ref('')
const sending = ref(false)
const messagesRef = ref(null)
const sessionId = ref(localStorage.getItem('pm_session_id') || '')

function scrollToBottom() {
  nextTick(() => {
    const el = messagesRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function addMessage(role, content, citations = []) {
  messages.value.push({ role, content, citations })
  scrollToBottom()
}

async function onSend() {
  const text = input.value
  if (!text) return
  addMessage('user', text)
  input.value = ''
  sending.value = true
  try {
    const resp = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId: sessionId.value })
    })
    const data = await resp.json()
    addMessage('assistant', data.reply, data.citations)
  } catch (e) {
    addMessage('assistant', '抱歉，后端接口暂时不可用，请稍后重试。')
  } finally {
    sending.value = false
  }
}

onMounted(() => {
  if (!sessionId.value) {
    sessionId.value = `pm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem('pm_session_id', sessionId.value)
  }
  addMessage('assistant', '你好！我可以帮助你了解产品信息或解答常见客诉问题。试着问我：\n- “ProjectMind Pro 的价格和主要功能？”\n- “如何申请退款？”')
})
</script>

<style scoped>
.app { color: #222; background: #f7f7f7; min-height: 100vh; }
.header { background: #111827; color: #fff; padding: 24px 16px; }
.header h1 { margin: 0; font-size: 20px; }
.subtitle { color: #cbd5e1; margin-top: 4px; }
.main { max-width: 840px; margin: 0 auto; padding: 16px; }
.messages { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; min-height: 300px; max-height: 60vh; overflow-y: auto; }
.message { display: flex; gap: 12px; margin-bottom: 12px; }
.role { font-weight: 600; min-width: 64px; }
.user .role { color: #2563eb; }
.assistant .role { color: #16a34a; }
.content pre { white-space: pre-wrap; line-height: 1.5; margin: 0; }
.citations { font-size: 12px; color: #6b7280; margin-top: 6px; }
.citation-item { display: inline-block; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; margin-right: 8px; }
.input-row { display: flex; gap: 8px; margin-top: 12px; }
.input-row input { flex: 1; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; }
.input-row button { padding: 0 16px; border: none; border-radius: 6px; background: #111827; color: #fff; font-weight: 600; cursor: pointer; }
.input-row button:hover { background: #374151; }
.tip { font-size: 12px; color: #6b7280; margin-top: 8px; }
</style>
