import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAgent } from './server/agent/agent.js';

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

app.post('/mcp/invoke', async (req, res) => {
  const id = 5;
  const tool = String(req.body?.tool || '').trim();
  const input = req.body?.input || {};
  console.log(`[mcp/invoke][start] id=${id} tool=${tool} inputLen=${JSON.stringify(input).length}`);
  try {
    switch (tool) {
      case 'policy.basic_info': {
        const policyId = input.policyId || input.policy_id || 'POLICY-001';
        const mock = {
          ok: true,
          data: {
            policyId,
            effectiveDate: '2024-08-01',
            expiryDate: '2025-08-01',
            insuredAmount: '¥500,000',
            diseaseScope: '重大疾病（含癌症、心脑血管）',
          }
        };
        console.log(`[mcp/invoke][done] id=${id} tool=${tool} ok=true`);
        return res.json(mock);
      }
      case 'policy.health_rules': {
        const policyId = input.policyId || input.policy_id || 'POLICY-001';
        const mock = {
          ok: true,
          data: {
            policyId,
            rules: [
              '投保前一年内住院史需如实告知',
              '既往慢性病（如高血压、糖尿病）需补充治疗情况',
              '近期重大检查异常（如肿瘤标志物升高）需说明',
            ],
          }
        };
        console.log(`[mcp/invoke][done] id=${id} tool=${tool} ok=true`);
        return res.json(mock);
      }
      default: {
        console.warn(`[mcp/invoke][warn] id=${id} unknown tool: ${tool}`);
        return res.json({ ok: false, error: `未知工具: ${tool}` });
      }
    }
  } catch (err) {
    console.error(`[mcp/invoke][error] id=${id} tool=${tool} err=`, err);
    return res.status(500).json({ ok: false, error: '服务异常' });
  }
});
app.post('/api/chat', async (req, res) => {
  const userText = req.body?.message || '';
  const sessionId = req.body?.sessionId || req.ip || 'default';
  const reqId = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
  const start = Date.now();
  console.log(`[chat][start] id=${reqId} sid=${sessionId} ip=${req.ip} ua=${req.headers['user-agent'] || ''} textLen=${userText.length}`);
  try {
    const result = await runAgent(userText, { sessionId });
    console.log(`[chat][done] id=${reqId} ms=${Date.now()-start} replyLen=${String(result?.reply || '').length} citations=${(result?.citations || []).length}`);
    res.json(result);
  } catch (e) {
    console.error(`[chat][error] id=${reqId} ms=${Date.now()-start}`, e);
    res.status(500).json({ reply: '服务暂不可用，请稍后重试。', citations: [] });
  }
});

// 首页回退
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});