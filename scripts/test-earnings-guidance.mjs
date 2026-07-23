import assert from "node:assert/strict";
import { earningsGuidanceFromEvents } from "./lib/earnings-guidance.mjs";
import { buildCompanyResearchSnapshot } from "./lib/unified-research-engine.mjs";

const events = [{
  code: "000977",
  name: "浪潮信息",
  date: "2026-07-08",
  source: "巨潮资讯",
  title: "2026年半年度业绩预告",
  type: "业绩预告",
  facts: [
    "2026H1归母净利润预计26.00亿元至31.00亿元，上年同期7.986亿元，同比增长226%至288%。",
    "2026H1扣非净利润预计20.55亿元至25.55亿元，上年同期6.717亿元，同比增长206%至280%。"
  ]
}];

const guidance = earningsGuidanceFromEvents(events).get("000977");
assert.equal(guidance.guidancePeriod, "H1");
assert.equal(guidance.guidancePeriodProfitLowYi, 26);
assert.equal(guidance.guidancePeriodProfitHighYi, 31);
assert.equal(guidance.guidanceGrowthHighPct, 288);

const research = buildCompanyResearchSnapshot({
  code: "000977",
  name: "浪潮信息",
  industry: "IT设备",
  legalIndustry: "IT设备",
  coreBusiness: "AI服务器/国产算力",
  tradeDate: "20260710",
  close: 89.52,
  marketCapYi: 1314.6,
  totalSharesYi: 14.6848,
  peTtm: 51.4498,
  pb: 5.8943,
  psTtm: 0.857
}, {
  reportPeriod: "20251231",
  revenueCagr3Y: 58.2,
  profitCagr3Y: 16.3,
  latestRevenueGrowth: 43.25,
  latestProfitGrowth: 5.2,
  marginTrend: -5.2,
  roe: 11.55,
  roeTrend: 1.8,
  ocfToProfit: 226.6,
  ...guidance
}, {
  moatLevel: 4,
  policyStrengthScore: 4,
  coreRevenueSource: "AI服务器/国产算力",
  coreProfitSource: "AI服务器/国产算力",
  marketCapacity: {
    asOf: "2026-07-10",
    sources: ["测试用可追溯行业容量证据"],
    tamYi: 8000,
    samYi: 2400,
    horizonYears: 3,
    capacityRevenueYi: 900,
    scenarios: {
      conservative: { companySharePct: 12, netMarginPct: 4, peerPe: 24 },
      neutral: { companySharePct: 18, netMarginPct: 5, peerPe: 28 },
      optimistic: { companySharePct: 24, netMarginPct: 6, peerPe: 32 }
    }
  }
}, {
  now: new Date("2026-07-12T02:00:00+08:00"),
  marketDate: "20260710",
  marketSource: "测试行情",
  financialSource: "年报+业绩预告",
  calculatedAt: "2026-07-12 02:00"
});

assert.equal(research.industry.familyId, "ai_infrastructure");
assert.equal(research.valuation.actionEligible, true);
assert.equal(research.valuation.audit.earningsSource, "业绩预告分期年化");
assert.ok(research.valuation.audit.guidanceAudit.annualized.neutral > 50);
assert.ok(research.valuation.scenarios.neutral.targetPrice > research.market.close, "业绩预告未能进入未来估值");
assert.equal(research.valuation.rankingEligible, true, "有业绩预告的公司应可进入估值空间排名");
assert.ok(research.valuation.probabilityWeighted?.targetPrice > 0, "缺少12个月概率加权估值");
assert.ok(research.valuation.strategicProbabilityWeighted?.targetPrice > 0, "缺少三年概率加权估值");

console.log(JSON.stringify({
  family: research.industry.familyId,
  annualizedProfit: research.valuation.audit.guidanceAudit.annualized,
  twelveMonthPrices: Object.fromEntries(Object.entries(research.valuation.scenarios).map(([key, value]) => [key, value?.targetPrice])),
  threeYearPrices: Object.fromEntries(Object.entries(research.valuation.futureScenarios).map(([key, value]) => [key, value?.targetPrice]))
}, null, 2));
