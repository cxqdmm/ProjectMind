import { createRequire } from "module";
const require = createRequire(import.meta.url);
const products = require("../../../data/products.json");

export async function queryProductInfoFunc(input) {
  const t = String(input || "").toLowerCase();
  // 精确匹配名称
  let p = products.find((p) => t.includes(p.name.toLowerCase()));
  // specs 关键词匹配
  if (!p) {
    p = products.find((p) => (p.specs || []).some((s) => t.includes(String(s).toLowerCase())));
  }
  // 简单关键词匹配
  if (!p) {
    if (t.includes("pro")) p = products.find((p) => /pro/i.test(p.name));
    else if (t.includes("lite")) p = products.find((p) => /lite/i.test(p.name));
  }
  // 兜底返回第一个
  p = p || products[0];
  return JSON.stringify(p);
}