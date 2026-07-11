import assert from "node:assert/strict";
import { buildCompanyResearchSnapshot, businessTransformationScore } from "./lib/unified-research-engine.mjs";

const context = {
  now: new Date("2026-07-11T12:00:00+08:00"),
  marketDate: "20260710",
  marketSource: "测试行情",
  financialSource: "测试财务",
  calculatedAt: "2026-07-11 12:00"
};

function company(code, name, industry, overrides = {}) {
  return {
    code,
    name,
    industry,
    legalIndustry: industry,
    tradeDate: "20260710",
    close: 20,
    marketCapYi: 200,
    totalSharesYi: 10,
    shareSource: "测试股本",
    peTtm: 20,
    pb: 2,
    psTtm: 2,
    ...overrides
  };
}

function financial(overrides = {}) {
  return {
    reportPeriod: "20251231",
    revenueCagr3Y: 15,
    profitCagr3Y: 20,
    latestRevenueGrowth: 18,
    latestProfitGrowth: 25,
    roe: 13,
    roeTrend: 1,
    marginTrend: 1,
    ocfToProfit: 95,
    debtToAssets: 45,
    ...overrides
  };
}

const samples = [
  [company("601336", "新华保险", "保险", { close: 62.98, marketCapYi: 1964.7, totalSharesYi: -0.3128, peTtm: 5.3, pb: 1.59, psTtm: 1.3 }), financial({ revenueCagr3Y: 48.5, profitCagr3Y: 104.1, roe: 34.69 }), {}, "insurance"],
  [company("601128", "常熟银行", "银行", { peTtm: 7, pb: 0.8 }), financial(), {}, "bank"],
  [company("600030", "中信证券", "证券", { peTtm: 15, pb: 1.2 }), financial(), {}, "securities"],
  [company("600160", "巨化股份", "高端制造", { peTtm: 12, pb: 2.5, coreBusiness: "制冷剂/氟化工" }), financial({ latestProfitGrowth: 90 }), { cyclePosition: "peak" }, "fluorochemicals"],
  [company("600570", "传统业务转AI样本", "软件服务"), financial(), { newBusinessName: "AI应用", newBusinessRevenueSharePct: 15, newBusinessProfitSharePct: 10, newBusinessOrderSharePct: 20, commercializationCode: "small_scale" }, "software_platform"],
  [company("300666", "江丰电子", "半导体材料", { peTtm: 35, psTtm: 6 }), financial(), {}, "semiconductor_advanced"],
  [company("300124", "汇川技术", "工业自动化", { peTtm: 30 }), financial(), {}, "semiconductor_advanced"],
  [company("300624", "未盈利AI软件", "软件服务", { peTtm: -30, psTtm: 5 }), financial({ latestProfitGrowth: -20 }), {}, "software_platform"],
  [company("600519", "消费公司样本", "白酒", { peTtm: 24 }), financial(), {}, "consumer"],
  [company("600900", "公用事业样本", "电力", { peTtm: 16, pb: 2 }), financial(), {}, "utilities"],
  [company("000100", "多业务经营样本", "电子设备"), financial({ netDebtYi: 10 }), { newBusinessName: "半导体显示", newBusinessRevenueSharePct: 45, newBusinessProfitSharePct: 50, newBusinessOrderSharePct: 50, newBusinessRevenueGrowthPct: 60, newBusinessProfitGrowthPct: 80, commercializationCode: "ramp_up", customerQuality: "high", researchIntensityPct: 10, newBusinessCapexSharePct: 35, segments: [{ name: "传统业务", valueYi: 100 }, { name: "新业务", valueYi: 180 }] }, "semiconductor_advanced"],
  [company("688001", "未盈利创新药", "创新药", { peTtm: -10, psTtm: 8 }), financial({ latestProfitGrowth: -50 }), {}, "innovation_pharma"],
  [company("002281", "海外光通信链样本", "通信设备", { peTtm: 30 }), financial(), {}, "semiconductor_advanced"],
  [company("600048", "地产样本", "房地产", { peTtm: 8, pb: 0.7 }), financial(), {}, "real_estate"],
  [company("600000", "无法分类样本", "未知行业"), financial(), {}, "generic_industrial"],
  [company("000977", "浪潮信息", "IT设备", { coreBusiness: "AI服务器/国产算力" }), financial(), { policyStrengthScore: 4 }, "ai_infrastructure"],
  [company("301607", "富特科技", "汽车配件", { coreBusiness: "高压电源/800V快充" }), financial(), { policyStrengthScore: 3 }, "new_energy_core"]
];

const results = samples.map(([c, f, e, expectedFamily]) => {
  const result = buildCompanyResearchSnapshot(c, f, e, context);
  assert.equal(result.industry.familyId, expectedFamily, `${c.name}行业识别错误`);
  if (result.valuation.neutral) {
    assert.equal(Number((result.valuation.neutral.marketCapYi / result.market.totalSharesYi).toFixed(2)), result.valuation.neutral.targetPrice, `${c.name}目标价不一致`);
  }
  return result;
});

const xinhua = results[0];
assert.equal(xinhua.valuation.method, "PB");
assert.equal(xinhua.valuation.rankingEligible, false);
assert.ok(xinhua.valuation.warnings.some(item => item.includes("内含价值缺失")));
assert.ok(xinhua.valuation.warnings.some(item => item.includes("股本字段异常")));
assert.ok(xinhua.market.totalSharesYi > 0);
assert.ok(xinhua.valuation.neutral.targetPrice > 0);
assert.ok(xinhua.valuation.neutral.marketCapYi < 4000, "新华保险仍存在异常目标市值");
assert.notEqual(xinhua.valuation.method, "PS");

const cycle = results[3];
assert.equal(cycle.valuation.method, "MID_CYCLE_PE");

const lossSoftware = results[7];
assert.equal(lossSoftware.valuation.method, "PS");

const semiconductor = results[5];
assert.ok(semiconductor.valuation.futureScenarios.neutral.marketCapYi > semiconductor.valuation.scenarios.neutral.marketCapYi, "成长型公司三年估值未体现未来增长");
assert.ok(semiconductor.valuation.forwardAssumptions.evidenceCount >= 2);
assert.equal(semiconductor.valuation.rankingEligible, false, "缺少未来盈利基数的公司不得进入估值空间排名");
assert.ok(semiconductor.valuation.strategicProbabilityWeighted?.marketCapYi > 0, "缺少概率加权研究情景");

const noGrowth = buildCompanyResearchSnapshot(company("300999", "缺成长数据样本", "半导体材料"), { reportPeriod: "20251231" }, {}, context);
assert.equal(noGrowth.valuation.valid, false);
assert.ok(noGrowth.valuation.invalidReasons.some(item => item.includes("成长数据")));

const migrated = buildCompanyResearchSnapshot(
  company("600999", "传统业务完成AI转型样本", "化学制品", { psTtm: 3 }),
  financial(),
  { newBusinessName: "AI软件平台", newBusinessIndustry: "软件服务", newBusinessRevenueSharePct: 85, newBusinessProfitSharePct: 90, newBusinessOrderSharePct: 90, newBusinessRevenueGrowthPct: 60, newBusinessProfitGrowthPct: 80, commercializationCode: "mature", customerQuality: "high", researchIntensityPct: 15, newBusinessCapexSharePct: 70, adjustmentReason: "新业务成为主要收入和利润来源" },
  context
);
assert.equal(migrated.business.migrationApplied, true);
assert.equal(migrated.industry.familyId, "software_platform");

const multiBusiness = results[10];
assert.equal(multiBusiness.valuation.neutral.method, "SOTP");

const innovationDrug = results[11];
assert.equal(innovationDrug.valuation.valid, false);
assert.ok(innovationDrug.valuation.invalidReasons.some(item => item.includes("管线")));

const unknown = results[14];
assert.equal(unknown.valuation.valid, false);
assert.ok(unknown.valuation.invalidReasons.includes("行业无法可靠识别"));

const weakTransition = businessTransformationScore({ newBusinessName: "AI", commercializationCode: "concept" });
assert.ok(weakTransition.score <= 20);
assert.equal(weakTransition.newBusinessValuationWeight, 0);

console.log(JSON.stringify({
  tested: results.length,
  valid: results.filter(item => item.valuation.valid).length,
  invalid: results.filter(item => !item.valuation.valid).length,
  xinhua: {
    method: xinhua.valuation.method,
    currentMcapYi: xinhua.market.marketCapYi,
    conservative: xinhua.valuation.conservative?.marketCapYi,
    neutral: xinhua.valuation.neutral?.marketCapYi,
    optimistic: xinhua.valuation.optimistic?.marketCapYi,
    rankingEligible: xinhua.valuation.rankingEligible,
    warnings: xinhua.valuation.warnings
  },
  families: results.map(item => `${item.name}:${item.industry.familyId}:${item.valuation.method || "INVALID"}`)
}, null, 2));
