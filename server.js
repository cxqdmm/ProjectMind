import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAgentStream } from './server/agent/agent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态前端（当前仍使用 public 演示页；生产可切到 frontend/dist）
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// app.post('/api/chat', async (req, res) => {
//   const userText = req.body?.message || '';
//   const sessionId = req.body?.sessionId || req.ip || 'default';
//   const reqId = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
//   const start = Date.now();
//   console.log(`[chat][start] id=${reqId} sid=${sessionId} ip=${req.ip} ua=${req.headers['user-agent'] || ''} textLen=${userText.length}`);
//   try {
//     const result = await runAgent(userText, { sessionId });
//     console.log(`[chat][done] id=${reqId} ms=${Date.now()-start} replyLen=${String(result?.reply || '').length} citations=${(result?.citations || []).length}`);
//     res.json(result);
//   } catch (e) {
//     console.error(`[chat][error] id=${reqId} ms=${Date.now()-start}`, e);
//     res.status(500).json({ reply: '服务暂不可用，请稍后重试。', citations: [] });
//   }
// });

// SSE：按块输出工具事件与最终回答
app.get('/api/chat-sse', async (req, res) => {
  const userText = String(req.query?.message || '');
  const sessionId = String(req.query?.sessionId || req.ip || 'default');
  const reqId = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
  console.log(`[chat-sse][start] id=${reqId} sid=${sessionId} textLen=${userText.length}`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (obj) => {
    try {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
        console.warn(`[chat-sse][write] id=${reqId}`, obj);
    } catch (e) {
      console.warn(`[chat-sse][write-error] id=${reqId}`, e);
    }
  };

  const keepAlive = setInterval(() => { try { res.write(`: ping\n\n`); } catch(_){} }, 25000);

  try {
    const { reply } = await runAgentStream(userText, { sessionId }, (ev) => send(ev));
    send({ messageType: 'assistant_final', reply, citations: [], done: true });
  } catch (e) {
    send({ messageType: 'assistant_final', error: String(e?.message || e), done: true });
  } finally {
    clearInterval(keepAlive);
    try { res.end(); } catch (_) {}
    console.log(`[chat-sse][done] id=${reqId}`);
  }
});

// 首页回退
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 兼容默认路径：POST /invoke -> /mcp/invoke（保持方法与体）
app.post('/invoke', (req, res) => {
  return res.redirect(307, '/mcp/invoke');
});

// 统一 404 输出为 JSON 并记录日志，便于客户端诊断
app.use((req, res) => {
  console.warn(`[http][404] ${req.method} ${req.originalUrl}`);
  return res.status(404).json({ ok: false, error: '未找到路由', method: req.method, url: req.originalUrl });
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});