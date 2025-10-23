const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('input-form');
const inputEl = document.getElementById('user-input');

const SID_KEY = 'pm_session_id';
let sessionId = localStorage.getItem(SID_KEY);
if (!sessionId) {
  sessionId = 'pm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  localStorage.setItem(SID_KEY, sessionId);
}

function addMessage(role, content, citations = []) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;
  const roleEl = document.createElement('div');
  roleEl.className = 'role';
  roleEl.textContent = role === 'user' ? '你' : '助手';
  const contentEl = document.createElement('div');
  contentEl.className = 'content';
  contentEl.textContent = content;

  wrapper.appendChild(roleEl);
  wrapper.appendChild(contentEl);

  if (citations && citations.length > 0) {
    const citationsEl = document.createElement('div');
    citationsEl.className = 'citations';
    citationsEl.textContent = '引用：';
    citations.forEach(c => {
      const item = document.createElement('span');
      item.className = 'citation-item';
      item.textContent = `${c.title} · ${c.source}`;
      item.title = c.snippet || '';
      citationsEl.appendChild(item);
    });
    wrapper.appendChild(citationsEl);
  }

  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = (inputEl.value || '').trim();
  if (!text) return;
  addMessage('user', text);
  inputEl.value = '';

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId })
    });
    const data = await resp.json();
    addMessage('assistant', data.reply, data.citations);
  } catch (err) {
    addMessage('assistant', '抱歉，后端接口暂时不可用，请稍后重试。');
  }
});

// 初始欢迎消息
addMessage('assistant', '你好！我可以帮助你了解产品信息或解答常见客诉问题。试着问我：\n- “ProjectMind Pro 的价格和主要功能？”\n- “如何申请退款？”');