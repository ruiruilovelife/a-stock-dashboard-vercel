process.env.SKIP_DASHBOARD_MAIN = "true";

const { buildMarketWideValueResearch } = await import("./update-dashboard.mjs");
const { buildCompanyResearchUniverse } = await import("./lib/unified-research-engine.mjs");

const snapshot = [
  {
    code: "300416",
    name: "苏试试验",
    industry: "专用机械",
    buyable: true,
    close: 20,
    dayPct: 1.5,
    amountRaw: 500000000,
    turnover: 3,
    peTtm: 18,
    pb: 2,
    psTtm: 3,
    marketCapYi: 100
    ,tradeDate: "20260710", totalSharesYi: 5
  },
  {
    code: "601128",
    name: "常熟银行",
    industry: "银行",
    buyable: true,
    close: 8,
    dayPct: 0.5,
    amountRaw: 300000000,
    turnover: 1,
    peTtm: 7,
    pb: 0.8,
    psTtm: 1.5,
    marketCapYi: 250
    ,tradeDate: "20260710", totalSharesYi: 31.25
  },
  {
    code: "600001",
    name: "低价周期样本",
    industry: "钢铁",
    buyable: true,
    close: 3,
    dayPct: 2,
    amountRaw: 300000000,
    turnover: 2,
    peTtm: 5,
    pb: 0.5,
    psTtm: 0.5,
    marketCapYi: 80
    ,tradeDate: "20260710", totalSharesYi: 26.6667
  }
];

const financials = new Map([
  ["300416", {
    revenueCagr3Y: 22,
    profitCagr3Y: 52,
    latestRevenueGrowth: 18,
    latestProfitGrowth: 58,
    roe: 19,
    roeTrend: 5,
    grossMargin: 42,
    marginTrend: 2.5,
    ocfToProfit: 105,
    debtToAssets: 38,
    latestProfitYi: 8,
    reportPeriod: "20251231"
  }],
  ["601128", {
    revenueCagr3Y: 9,
    profitCagr3Y: 14,
    latestRevenueGrowth: 8,
    latestProfitGrowth: 12,
    roe: 13,
    roeTrend: 1,
    grossMargin: null,
    marginTrend: null,
    ocfToProfit: 90,
    debtToAssets: null,
    latestProfitYi: 20,
    reportPeriod: "20251231"
  }],
  ["600001", {
    revenueCagr3Y: -12,
    profitCagr3Y: -35,
    latestRevenueGrowth: -15,
    latestProfitGrowth: -55,
    roe: 3,
    roeTrend: -6,
    grossMargin: 8,
    marginTrend: -4,
    ocfToProfit: 20,
    debtToAssets: 75,
    latestProfitYi: 16,
    reportPeriod: "20251231"
  }]
]);

const unified = buildCompanyResearchUniverse(snapshot, financials, new Map(), {
  now: new Date("2026-07-11T12:00:00+08:00"),
  marketDate: "20260710",
  marketSource: "测试行情",
  financialSource: "测试财务",
  calculatedAt: "2026-07-11 12:00"
});
const result = buildMarketWideValueResearch(snapshot, {}, financials, unified.byCode);
const byCode = new Map([...result.ideas, ...result.traps].map(item => [item.code, item]));
const growthAsset = byCode.get("300416");
const matureBank = byCode.get("601128");
const trap = byCode.get("600001");

if (!growthAsset || growthAsset.compositeScore < 60 || growthAsset.valueComponents.normalizedEarnings <= 0) {
  throw new Error(`当前低估值样本评分异常：${JSON.stringify(growthAsset)}`);
}
if (!matureBank || !matureBank.recommendationEligible) {
  throw new Error(`成熟银行当前低估判断异常：${JSON.stringify(matureBank)}`);
}
if (!trap || trap.valueTrapRisk !== "高" || trap.valueTrapIndex < 60 || result.ideas.some(item => item.code === trap.code)) {
  throw new Error(`低估陷阱识别异常：${JSON.stringify(trap)}`);
}
if (!growthAsset.currentValuationValid || growthAsset.investmentStatus === "当前估值待补") {
  throw new Error(`当前估值不应依赖未来目标市值：${JSON.stringify(growthAsset)}`);
}
if (!matureBank.currentValuationValid || !["真低估/价值修复", "当前估值待验证"].includes(matureBank.investmentStatus)) {
  throw new Error(`银行当前业绩低估判断异常：${JSON.stringify(matureBank)}`);
}
if (trap.investmentStatus !== "低估陷阱或需降级") {
  throw new Error(`低PE价值陷阱不应被标为低估：${JSON.stringify(trap)}`);
}

console.log(JSON.stringify({
  growthAsset: { score: growthAsset.compositeScore, status: growthAsset.investmentStatus, upside: growthAsset.upsideMultiple },
  matureBank: { score: matureBank.compositeScore, status: matureBank.investmentStatus, upside: matureBank.upsideMultiple },
  trap: { score: trap.compositeScore, trapIndex: trap.valueTrapIndex, reasons: trap.valueTrapReasons }
}, null, 2));
