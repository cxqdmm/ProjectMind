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
          '员福保全加人的配置步骤': [
            { title: '员工', detail: '确认保单支持加人，核对被保人类型、等待期与保全限制。' },
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
        const result = { operation, steps };
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

// 直接处理 /invoke 路径的项目相关请求
app.post('/invoke', async (req, res) => {
  const id = `i${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
  const tool = String(req.body?.tool || '').trim();
  const input = req.body?.input || {};
  console.log(`[invoke-svc][start] id=${id} tool=${tool} inputLen=${JSON.stringify(input).length}`);
  
  try {
    switch (tool) {
      case 'project.intro': {
        const nameRaw = String(input.name || input.projectName || '').trim();
        const name = nameRaw || '示例项目';
        const intros = {
          '中小微线上': '中小微线上是面向中小微企业的线上保险服务平台，提供便捷的投保流程、智能核保和在线理赔服务，助力中小微企业快速获得保险保障。',
          '中小微线下': '中小微线下是传统线下渠道的中小微企业保险服务项目，通过代理人和经纪人网络，为中小微企业提供个性化的保险咨询和投保服务。',
          '高端员福': '高端员福是针对高端企业客户的员工福利保险项目，提供全面的员工健康保障、意外险和补充医疗等高品质保险产品和服务。',
          '清单投保': '清单投保是批量投保管理系统，支持企业客户通过清单方式批量为员工投保，提供高效的保单管理和理赔处理服务。'
        };
        const intro = intros[name] || `项目 ${name} 的介绍暂未收录，请联系项目负责人获取更多信息。`;
        console.log(`[invoke-svc][done] id=${id} tool=${tool} name=${name} ok=true`);
        return res.json({ ok: true, result: { name, intro } });
      }
      default: {
        console.warn(`[invoke-svc][warn] id=${id} unknown tool: ${tool}`);
        return res.json({ ok: false, error: `未知工具: ${tool}` });
      }
    }
  } catch (err) {
    console.error(`[invoke-svc][error] id=${id} tool=${tool} err=`, err);
    return res.status(500).json({ ok: false, error: '服务异常' });
  }
});

// 统一 404 输出为 JSON 并记录日志，便于客户端诊断
app.use((req, res) => {
  console.warn(`[mcp-svc][404] ${req.method} ${req.originalUrl}`);
  return res.status(404).json({ ok: false, error: '未找到路由', method: req.method, url: req.originalUrl });
});

app.listen(PORT, () => {
  console.log(`MCP Server listening at http://localhost:${PORT}`);
});