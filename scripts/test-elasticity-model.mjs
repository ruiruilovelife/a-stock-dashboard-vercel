import assert from "node:assert/strict";

process.env.SKIP_DASHBOARD_MAIN = "true";

const {
  elasticityCandidateType,
  elasticityFailureReasons,
  elasticityFundsScore,
  elasticityIndustryScore,
  elasticityMoatScore,
  elasticityProbabilityStars,
  elasticityStartupPhase,
  elasticityTrendScore
} = await import("./update-dashboard.mjs");

const earlyWeekly = {
  quarterReturn: 28,
  yearReturn: 72,
  weeklyTrendPass: true,
  closeAbove20w: true,
  closeAbove60w: true,
  ma20Rising: true,
  ma60Rising: true,
  maQueue: true,
  longConsolidation: true,
  volumeStairPass: true,
  upDownVolumePass: true,
  noBlowoffPass: true
};

const acceleratedWeekly = { ...earlyWeekly, quarterReturn: 88, yearReturn: 185 };
const highRiskWeekly = { ...earlyWeekly, quarterReturn: 105, yearReturn: 245 };
const marketRow = { name: "示例公司", turnover: 3.2, amountRaw: 1_500_000_000, dayPct: 2.1, marketCapYi: 180 };
const sIndustry = { tier: "S", label: "半导体设备", chain: "国产替代" };
const weakIndustry = { tier: "C", label: "传统行业", chain: "普通竞争" };
const growth = { latestProfitGrowth: 65, latestRevenueGrowth: 28, roeTrend: 2, marginTrend: 1 };

assert.equal(elasticityStartupPhase(earlyWeekly), "主升初期");
assert.equal(elasticityStartupPhase(acceleratedWeekly), "加速期");
assert.equal(elasticityStartupPhase(highRiskWeekly), "高位风险");
assert.ok(elasticityTrendScore(earlyWeekly, "主升初期") > elasticityTrendScore(acceleratedWeekly, "加速期"));
assert.equal(elasticityFundsScore(marketRow, earlyWeekly), 30);
assert.ok(elasticityIndustryScore(sIndustry, growth) >= 28);
assert.ok(elasticityIndustryScore(sIndustry, growth) > elasticityIndustryScore(weakIndustry, growth));
assert.ok(elasticityMoatScore({ roe: 20, grossMargin: 35, ocfToProfit: 100, marginTrend: 1, debtToAssets: 40 }) >= 8);
assert.equal(elasticityCandidateType(sIndustry, marketRow), "产业趋势型");
assert.equal(elasticityCandidateType({ tier: "B", label: "化工", chain: "制冷剂" }, marketRow), "周期反转型");
assert.equal(elasticityProbabilityStars(90, 24, 24, 26), 5);

const risks = elasticityFailureReasons({
  weekly: { ...earlyWeekly, weeklyTrendPass: false, volumeStairPass: false },
  phase: "底部",
  industry: weakIndustry,
  growth: { latestProfitGrowth: -10 },
  fundsScore: 8,
  moatScore: 3
});
assert.ok(risks.includes("产业逻辑不足"));
assert.ok(risks.includes("资金可能只是短炒"));
assert.ok(risks.includes("周线未确认"));
assert.ok(risks.includes("业绩兑现不足"));
assert.ok(risks.includes("竞争壁垒证据不足"));

console.log(JSON.stringify({
  earlyPhase: elasticityStartupPhase(earlyWeekly),
  acceleratedPhase: elasticityStartupPhase(acceleratedWeekly),
  earlyTrendScore: elasticityTrendScore(earlyWeekly, "主升初期"),
  acceleratedTrendScore: elasticityTrendScore(acceleratedWeekly, "加速期"),
  fundsScore: elasticityFundsScore(marketRow, earlyWeekly),
  industryScore: elasticityIndustryScore(sIndustry, growth),
  risks
}, null, 2));
