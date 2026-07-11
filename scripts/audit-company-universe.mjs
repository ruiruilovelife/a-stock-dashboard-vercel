import fs from "node:fs";
import assert from "node:assert/strict";
import { buildCompanyResearchUniverse } from "./lib/unified-research-engine.mjs";

const source = JSON.parse(fs.readFileSync("data/company-research.json", "utf8"));
const rows = source.companies || source.list || [];
const companies = rows.map(item => ({
  code: item.code,
  name: item.name,
  industry: item.business?.legalIndustry || item.industry?.level2,
  legalIndustry: item.business?.legalIndustry || item.industry?.level2,
  coreBusiness: [item.business?.coreRevenueSource, item.business?.coreProfitSource, item.business?.marketPricingLogic].filter(Boolean).join(" / "),
  tradeDate: item.market?.tradeDate,
  close: item.market?.close,
  marketCapYi: item.market?.marketCapYi,
  totalSharesYi: item.market?.totalSharesYi,
  peTtm: item.market?.pe,
  pb: item.market?.pb,
  psTtm: item.market?.ps
}));
const financialByCode = new Map(rows.map(item => [item.code, item.financial || {}]));
const evidenceByCode = new Map(rows.map(item => [item.code, {
  coreRevenueSource: item.business?.coreRevenueSource,
  coreProfitSource: item.business?.coreProfitSource,
  marketPricingLogic: item.business?.marketPricingLogic,
  newBusinessName: item.business?.newGrowthBusiness,
  newBusinessIndustry: item.business?.newBusinessIndustry,
  newBusinessRevenueSharePct: item.business?.transformationBreakdown?.revenueShare,
  newBusinessProfitSharePct: item.business?.transformationBreakdown?.profitShare
}]));

const rebuilt = buildCompanyResearchUniverse(companies, financialByCode, evidenceByCode, {
  now: new Date("2026-07-12T03:00:00+08:00"),
  marketDate: "20260710",
  marketSource: "公司库离线审计",
  financialSource: "公司库财务快照",
  calculatedAt: "2026-07-12 03:00"
});

const familyCounts = {};
const extreme = [];
for (const item of rebuilt.list) {
  familyCounts[item.industry.familyId] = (familyCounts[item.industry.familyId] || 0) + 1;
  const ratio = item.valuation.upsideMultiple;
  if (ratio !== null && (ratio > 5 || ratio < 0.2)) extreme.push({ name: item.name, code: item.code, family: item.industry.familyId, ratio });
  if (item.valuation.valid) {
    assert.ok(item.valuation.futureScenarios.neutral?.marketCapYi > 0, `${item.name}缺三年中性估值`);
    assert.equal(item.valuation.actionEligible, false, `${item.name}缺少前瞻盈利证据却可驱动买卖`);
  }
}

const holdings = ["600160", "000977", "301607", "300666"].map(code => {
  const item = rebuilt.byCode.get(code);
  return item ? {
    name: item.name,
    code,
    family: item.industry.familyId,
    valid: item.valuation.valid,
    actionEligible: item.valuation.actionEligible,
    current: item.market.marketCapYi,
    twelveMonth: item.valuation.scenarios.neutral?.marketCapYi,
    strategic3Y: item.valuation.futureScenarios.neutral?.marketCapYi,
    decomposition: item.valuation.forwardAssumptions.decomposition
  } : { code, missing: true };
});

console.log(JSON.stringify({
  total: rebuilt.list.length,
  valid: rebuilt.list.filter(item => item.valuation.valid).length,
  invalid: rebuilt.list.filter(item => !item.valuation.valid).length,
  familyCounts,
  extremeCount: extreme.length,
  extreme: extreme.slice(0, 30),
  holdings
}, null, 2));
