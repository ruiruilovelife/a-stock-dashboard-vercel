import assert from "node:assert/strict";

process.env.SKIP_DASHBOARD_MAIN = "true";
const { buildInstitutionalGrowthResearch, buildRollingResearchPool } = await import("./update-dashboard.mjs");

const rows = [
  { code: "300001", name: "成长待估样本", buyable: true, close: 20, marketCapYi: 100, industry: "半导体材料", dayPct: 1, turnover: 2, amountRaw: 500000000 },
  { code: "300002", name: "成长可估样本", buyable: true, close: 25, marketCapYi: 120, industry: "半导体设备", dayPct: 2, turnover: 3, amountRaw: 800000000 },
  { code: "300003", name: "普通成长样本", buyable: true, close: 12, marketCapYi: 80, industry: "工业设备", dayPct: -1, turnover: 1, amountRaw: 200000000 },
  { code: "688001", name: "科创不可买样本", buyable: false, close: 30, marketCapYi: 90, industry: "半导体", dayPct: 1, turnover: 2, amountRaw: 300000000 }
];

const research = new Map([
  ["300001", {
    industry: { familyId: "semiconductor_advanced", level2: "半导体材料", confidence: "medium" },
    business: { marketPricingLogic: "国产替代", transformationScore: 20 },
    financial: { latestRevenueGrowth: 35, latestProfitGrowth: 80, profitCagr3Y: 25, marginTrend: 2, roe: 14, roeTrend: 2 },
    valuation: { rankingEligible: false, invalidReasons: ["未来盈利待补"] }
  }],
  ["300002", {
    industry: { familyId: "semiconductor_advanced", level2: "半导体设备", confidence: "medium" },
    business: { marketPricingLogic: "国产替代", transformationScore: 45 },
    financial: { latestRevenueGrowth: 45, latestProfitGrowth: 120, profitCagr3Y: 40, marginTrend: 4, roe: 20, roeTrend: 3 },
    valuation: { rankingEligible: true, strategicProbabilityWeighted: { marketCapYi: 480 }, futureScenarios: { neutral: { marketCapYi: 480 } }, invalidReasons: [] }
  }],
  ["300003", {
    industry: { familyId: "generic_industrial", level2: "工业设备", confidence: "medium" },
    business: { marketPricingLogic: "设备更新", transformationScore: 10 },
    financial: { latestRevenueGrowth: 12, latestProfitGrowth: 18, profitCagr3Y: 10, marginTrend: 0, roe: 9, roeTrend: 0 },
    valuation: { rankingEligible: false, invalidReasons: ["未来盈利待补"] }
  }]
]);

const daily = [{
  code: "300002",
  quarterReturn: 45,
  yearReturn: 110,
  weeklyTrendPass: true,
  closeAbove20w: true,
  ma20Rising: true,
  volumeStairPass: true,
  upDownVolumePass: true,
  phase: "主升初期"
}];
const result = await buildInstitutionalGrowthResearch(rows, daily, research, new Map());
assert.equal(result.scanStats.scanned, 3, "必须扫描全部可买样本");
assert.equal(result.scanStats.growthResearchRetained, 3, "估值缺失不得删除成长样本");
assert.equal(result.scanStats.valuationPending, 2);
assert.equal(result.scanStats.valuationReady, 1);
assert.ok(result.all.some(item => item.code === "300001" && item.valuationPending), "高成长但估值待补样本必须保留");
assert.ok(result.futureFiveXCandidates.some(item => item.code === "300002"), "满足70分、三倍空间和财务改善的样本应进入正式候选");
assert.ok(!result.futureFiveXCandidates.some(item => item.code === "300001"), "缺少估值证据的样本不能输出三倍空间建议");
const qualified = result.all.find(item => item.code === "300002");
assert.ok(!("fiveXScore" in qualified), "不得保留旧版10分五倍相似度");
assert.equal(qualified.score, qualified.fiveXPotentialIndex, "只能使用同一个100分制评分");
assert.ok(qualified.historicalPatternMatched.includes("周线趋势开始转强"), "历史样本共性必须实际进入判断结果");
assert.equal(qualified.historicalPatternEligible, true, "启动早中期样本应通过历史位置风控");

const retained = buildRollingResearchPool(
  { trackedFiveXIdeas: [{ code: "300003", name: "普通成长样本", fiveXPotentialIndex: 62, selectedAt: "2026-07-01" }] },
  "trackedFiveXIdeas",
  [],
  [],
  { minScore: 70, scoreField: "fiveXPotentialIndex", dropBelowMin: false }
);
assert.ok(retained.some(item => item.code === "300003"), "滚动研究样本不得仅因当前低于候选分数线被自动删除");

console.log(JSON.stringify(result.scanStats, null, 2));
