import { createRequire } from "module";
const require = createRequire(import.meta.url);
const faqs = require("../../../data/faqs.json");

export async function queryFAQPolicyFunc(input) {
  const t = String(input || "").toLowerCase();
  // 关键词或问题匹配 FAQ 条目
  let f = faqs.find((x) => (x.keywords || []).some((k) => t.includes(String(k).toLowerCase())));
  if (!f) {
    f = faqs.find((x) => t.includes(String(x.question || "").toLowerCase()));
  }
  // 兜底：返回包含最多关键词的条目
  if (!f) {
    f = faqs
      .map((x) => ({
        x,
        score: (x.keywords || []).reduce((acc, k) => acc + (t.includes(String(k).toLowerCase()) ? 1 : 0), 0),
      }))
      .sort((a, b) => b.score - a.score)[0]?.x;
  }
  f = f || faqs[0];
  return JSON.stringify(f);
}