<template>
  <div class="app">
    <header class="app-header">助手</header>
    <main class="app-main">
      <section class="chat">
        <div v-for="(m, idx) in messages" :key="idx" class="msg" :class="m.role">
          <div class="msg-role">{{ m.role === 'user' ? '你' : '助手' }}</div>
          <div class="msg-content">
            <div v-if="m.role === 'user'">{{ m.content }}</div>
            <div v-else>
              <div v-if="m.tools">
                <div class="tool-batch-title">工具批次 · {{ m.tools.order.length }} 个调用</div>
                <div class="tool-call" v-for="tid in m.tools.order" :key="tid" :class="statusClass(m.tools.items[tid].status)">
                  <div class="tool-header">
                    <span class="tool-name">{{ displayToolName(m.tools.items[tid]) }}</span>
                    <span class="tool-badge" :class="statusBadgeClass(m.tools.items[tid].status)">{{ statusText(m.tools.items[tid].status) }}</span>
                  </div>
                  <pre class="tool-input">{{ m.tools.items[tid].inputPreview || '{}' }}</pre>
                  <pre v-if="m.tools.items[tid].preview" class="tool-output">{{ m.tools.items[tid].preview }}</pre>
                  <pre v-if="m.tools.items[tid].error" class="tool-error">{{ JSON.stringify(m.tools.items[tid].error, null, 2) }}</pre>
                </div>
              </div>
              <div v-else>{{ m.content }}</div>
            </div>
          </div>
        </div>
      </section>
      <section class="input">
        <input v-model="input" class="text" placeholder="请输入问题..." @keyup.enter="send" />
        <button class="send" @click="send">发送</button>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const input = ref('');
const messages = ref([{ role: 'assistant', content: '你好，我是你的助手。' }]);
let currentSSE = null;

function statusText(s) {
  if (s === 'running') return '执行中';
  if (s === 'completed') return '完成';
  if (s === 'failed') return '失败';
  return '排队';
}
function statusClass(s) {
  return s === 'failed' ? 'failed' : s === 'completed' ? 'completed' : 'running';
}
function statusBadgeClass(s) {
  return s === 'failed' ? 'badge-error' : s === 'completed' ? 'badge-success' : 'badge-processing';
}
function displayToolName(t) {
  return t?.name || (t?.toolName ? `${t.provider}.${t.toolName}` : (t?.tool || '未知工具'));
}

function ensureAssistantPlaceholder() {
  const last = messages.value[messages.value.length - 1];
  if (!last || last.role !== 'assistant' || last.tools) {
    messages.value.push({ role: 'assistant', content: '...', tools: null });
  }
}

function applyEventToPlaceholder(ev) {
  ensureAssistantPlaceholder();
  const idx = messages.value.length - 1;
  const m = messages.value[idx];
  if (ev.messageType === 'tool_calls') {
    const items = {};
    const order = [];
    for (const c of ev.calls) {
      items[c.id] = {
        id: c.id,
        provider: c.provider,
        tool: c.tool,
        toolName: c.toolName,
        name: c.name,
        status: 'pending',
        inputPreview: c.inputPreview,
        preview: null,
        error: null
      };
      order.push(c.id);
    }
    m.tools = { items, order };
    m.content = '工具调用中...';
  } else if (ev.messageType === 'tool_update') {
    if (!m.tools) m.tools = { items: {}, order: [] };
    const t = m.tools.items[ev.id] || {
      id: ev.id,
      provider: ev.provider,
      tool: ev.tool,
      toolName: ev.toolName,
      name: ev.name,
      status: 'pending'
    };
    t.status = ev.status || t.status;
    if (ev.preview) t.preview = ev.preview;
    if (ev.error) t.error = ev.error;
    if (ev.inputPreview && !t.inputPreview) t.inputPreview = ev.inputPreview;
    m.tools.items[ev.id] = t;
    if (!m.tools.order.includes(ev.id)) m.tools.order.push(ev.id);
  } else if (ev.messageType === 'assistant_final') {
    // Replace placeholder content with final message
    m.content = ev.reply || m.content;
  }
  messages.value[idx] = { ...m };
}

async function send() {
  const text = input.value.trim();
  if (!text) return;
  messages.value.push({ role: 'user', content: text });
  input.value = '';

  // SSE first
  ensureAssistantPlaceholder();
  const url = `/api/chat-sse?q=${encodeURIComponent(text)}`;
  try {
    if (currentSSE) { currentSSE.close(); currentSSE = null; }
    currentSSE = new EventSource(url);
    currentSSE.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        applyEventToPlaceholder(ev);
      } catch (_) {}
    };
    currentSSE.onerror = () => {
      try { currentSSE && currentSSE.close(); } catch (_) {}
      currentSSE = null;
    };
  } catch (err) {
    // fallback
    const resp = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: text }) });
    const data = await resp.json();
    messages.value.push({ role: 'assistant', content: data.reply || '(无回复)' });
  }
}
</script>

<style>
.app { max-width: 800px; margin: 0 auto; font-family: system-ui, sans-serif; }
.app-header { font-weight: 600; padding: 16px; border-bottom: 1px solid #eee; }
.app-main { padding: 16px; }
.msg { margin: 16px 0; }
.msg-role { font-size: 12px; color: #888; margin-bottom: 4px; }
.msg .msg-content { background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 12px; }
.msg.user .msg-content { background: #fff; }
.tool-batch-title { font-size: 13px; color: #666; margin-bottom: 8px; }
.tool-call { border: 1px solid #e6e6e6; border-radius: 8px; padding: 10px; margin-bottom: 8px; background: #fff; }
.tool-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.tool-name { font-weight: 600; }
.tool-input, .tool-output, .tool-error { background: #f7f7f8; border-radius: 6px; padding: 8px; overflow: auto; max-height: 160px; }
.tool-error { background: #fff4f4; border: 1px solid #ffd6d6; }
.badge-processing { color: #0b66c3; }
.badge-success { color: #1a7f37; }
.badge-error { color: #b42318; }
.running { border-left: 4px solid #0b66c3; }
.completed { border-left: 4px solid #1a7f37; }
.failed { border-left: 4px solid #b42318; }
.input { display: flex; gap: 8px; margin-top: 12px; }
.text { flex: 1; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; }
.send { padding: 8px 14px; border: 1px solid #ddd; border-radius: 6px; background: #fff; cursor: pointer; }
</style>
