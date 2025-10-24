import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.MCP_PORT || 3100;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mcp', port: PORT });
});

app.post('/mcp/invoke', async (req, res) => {
  const id = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
  const tool = String(req.body?.tool || '').trim();
  const input = req.body?.input || {};
  console.log(`[mcp-svc][start] id=${id} tool=${tool} inputLen=${JSON.stringify(input).length}`);
  try {
    switch (tool) {
      case 'policy.basic_info': {
        const policyId = input.policyId || input.policy_id || 'POLICY-001';
        const result = {
          policyId,
          effectiveDate: '2024-08-01',
          expiryDate: '2025-08-01',
          insuredAmount: '¥500,000',
          diseaseScope: '重大疾病（含癌症、心脑血管）',
        };
        console.log(`[mcp-svc][done] id=${id} tool=${tool} ok=true`);
        return res.json({ ok: true, result });
      }
      case 'policy.health_rules': {
        const policyId = input.policyId || input.policy_id || 'POLICY-001';
        const result = {
          policyId,
          rules: [
            { title: '住院史披露', detail: '投保前一年内住院史需如实告知。' },
            { title: '慢性病说明', detail: '既往慢性病（如高血压、糖尿病）需补充治疗情况。' },
            { title: '检查异常提示', detail: '近期重大检查异常（如肿瘤标志物升高）需说明。' },
          ],
        };
        console.log(`[mcp-svc][done] id=${id} tool=${tool} ok=true`);
        return res.json({ ok: true, result });
      }
      case 'policy.operation_guide': {
        const policyId = input.policyId || input.policy_id || 'POLICY-001';
        const opRaw = String(input.operation || input.topic || '').trim();
        const operation = opRaw || '变更开放期';
        const guides = {
          '变更开放期': [
            { title: '确认资格与限制', detail: '查看保单条款与产品公告，确认该保单允许变更开放期，了解等待期与变更频次限制。' },
            { title: '准备必要信息', detail: '准备保单号、投保人/被保人身份信息、期望的开放期变更时间与原因说明。' },
            { title: '提交变更申请', detail: '通过App、官网或人工客服渠道提交变更开放期申请，填写所需字段并上传相关证明（如适用）。' },
            { title: '审核与通知', detail: '运营或核保团队在约定时效内完成审核，结果将通过短信/邮件通知；若需补充材料请按要求补交。' },
            { title: '变更生效与费用', detail: '变更成功后生效时间以系统通知为准；如存在手续费或保费变化，需在规定时间内确认并支付。' }
          ],
          '中小微保全加人的配置步骤': [
            { title: '确认保全资格与限制', detail: '确认保单支持加人，核对被保人类型、等待期与保全限制。' },
            { title: '收集新增人员信息与证明', detail: '收集身份证件、关系证明、健康问卷等材料（如需核保）。' },
            { title: '提交保全加人申请', detail: '在App/官网选择保全加人，填写新增人员信息并提交材料。' },
            { title: '核保与费用调整', detail: '通过核保审核，如需加费或调整保费，按提示完成支付。' },
            { title: '生效通知与后续保障', detail: '审核通过后出具变更确认；新增保障的生效时间以通知为准。' }
          ],
          '配置计划与档次': [
            { title: '评估当前保障需求', detail: '结合个人或企业风险偏好与预算，明确保障目标。' },
            { title: '查询可选计划与档次', detail: '在产品页面查看各档次对应的保障责任、限额与价格。' },
            { title: '试算保费与保障变化', detail: '使用试算工具估算不同档次的保费与保障差异。' },
            { title: '提交计划调整申请', detail: '选择拟变更的计划/档次并提交申请，确认责任变化与限制。' },
            { title: '确认生效与账单处理', detail: '审核通过后按通知确认生效，如有差额保费按账单处理。' }
          ]
        };
        const steps = guides[operation] || [];
        const result = { policyId, operation, steps };
        console.log(`[mcp-svc][done] id=${id} tool=${tool} op=${operation} ok=true`);
        return res.json({ ok: true, result });
      }
      default: {
        console.warn(`[mcp-svc][warn] id=${id} unknown tool: ${tool}`);
        return res.json({ ok: false, error: `未知工具: ${tool}` });
      }
    }
  } catch (err) {
    console.error(`[mcp-svc][error] id=${id} tool=${tool} err=`, err);
    return res.status(500).json({ ok: false, error: '服务异常' });
  }
});

// 兼容默认路径：POST /invoke -> /mcp/invoke（保持方法与体）
app.post('/invoke', (req, res) => {
  return res.redirect(307, '/mcp/invoke');
});

// 统一 404 输出为 JSON 并记录日志，便于客户端诊断
app.use((req, res) => {
  console.warn(`[mcp-svc][404] ${req.method} ${req.originalUrl}`);
  return res.status(404).json({ ok: false, error: '未找到路由', method: req.method, url: req.originalUrl });
});

app.listen(PORT, () => {
  console.log(`MCP Server listening at http://localhost:${PORT}`);
});