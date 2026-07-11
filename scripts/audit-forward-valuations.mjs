import fs from "node:fs";
import assert from "node:assert/strict";
import { buildCompanyResearchUniverse } from "./lib/unified-research-engine.mjs";

const dashboard = JSON.parse(fs.readFileSync(process.env.DASHBOARD_AUDIT_FILE || "data/dashboard.json", "utf8"));
const ideas = dashboard.oversoldValueIdeas || [];
const companies = ideas.map(item => ({
  code: item.code,
  name: item.name,
  industry: item.industryLabel || item.theme,
  legalIndustry: item.industryLabel || item.theme,
  close: item.close,
  marketCapYi: item.marketCapYi || item.currentMcapYi,
  totalSharesYi: Number(item.close) > 0 ? Number(item.marketCapYi || item.currentMcapYi) / Number(item.close) : null,
  peTtm: item.peTtm || item.pe,
  pb: item.pb,
  psTtm: item.ps,
  tradeDate: dashboard.meta?.lastUpdated?.slice(0, 10)?.replaceAll("-", "")
}));
const financialByCode = new Map(ideas.map(item => [item.code, {
  reportPeriod: item.financialPeriod || "20251231",
  revenueCagr3Y: item.growth?.revenueCagr3Y,
  profitCagr3Y: item.growth?.profitCagr3Y,
  latestRevenueGrowth: item.growth?.latestRevenueGrowth,
  latestProfitGrowth: item.growth?.latestProfitGrowth,
  roe: item.growth?.roe,
  roeTrend: item.growth?.roeTrend,
  marginTrend: item.growth?.marginTrend,
  ocfToProfit: 90,
  debtToAssets: 45
}]));
const result = buildCompanyResearchUniverse(companies, financialByCode, new Map(), {
  now: new Date("2026-07-11T22:00:00+08:00"),
  marketDate: "20260711",
  marketSource: "本地真实候选审计",
  financialSource: "页面财务快照",
  calculatedAt: "2026-07-11 22:00"
});
const audit = result.list.map(item => ({
  name: item.name,
  code: item.code,
  family: item.industry.familyId,
  valid: item.valuation.valid,
  current: item.market.marketCapYi,
  twelveMonth: item.valuation.scenarios.neutral?.marketCapYi,
  strategic3Y: item.valuation.futureScenarios.neutral?.marketCapYi,
  upside3Y: item.valuation.upsideMultiple,
  growth: item.valuation.forwardAssumptions.rates.neutral,
  reasons: item.valuation.invalidReasons
}));
for (const row of audit.filter(item => item.valid)) {
  assert.ok(row.twelveMonth > 0 && row.strategic3Y > 0, `${row.name}缺少前瞻估值`);
  assert.ok(row.strategic3Y >= row.twelveMonth * 0.7, `${row.name}三年价值异常低于12个月价值`);
  assert.ok(row.upside3Y > 0 && row.upside3Y <= 10, `${row.name}三年空间异常`);
}
console.log(JSON.stringify({ count: audit.length, valid: audit.filter(item => item.valid).length, audit }, null, 2));
