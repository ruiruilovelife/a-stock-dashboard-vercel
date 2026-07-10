process.env.SKIP_DASHBOARD_MAIN = "true";

const { buildMarketWideValueResearch } = await import("./update-dashboard.mjs");

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
    reportPeriod: "20251231"
  }]
]);

const result = buildMarketWideValueResearch(snapshot, {}, financials);
const byCode = new Map([...result.ideas, ...result.traps].map(item => [item.code, item]));
const growthAsset = byCode.get("300416");
const matureBank = byCode.get("601128");
const trap = byCode.get("600001");

if (!growthAsset || growthAsset.compositeScore < 80 || growthAsset.growthScore < 25 || growthAsset.industryScore !== 25) {
  throw new Error(`成长价值样本评分异常：${JSON.stringify(growthAsset)}`);
}
if (!matureBank || matureBank.compositeScore >= growthAsset.compositeScore || matureBank.industryScore >= growthAsset.industryScore) {
  throw new Error(`成熟银行相对评分异常：${JSON.stringify(matureBank)}`);
}
if (!trap || trap.valueTrapRisk !== "高" || trap.valueTrapIndex < 60 || result.ideas.some(item => item.code === trap.code)) {
  throw new Error(`低估陷阱识别异常：${JSON.stringify(trap)}`);
}

console.log(JSON.stringify({
  growthAsset: { score: growthAsset.compositeScore, status: growthAsset.investmentStatus, upside: growthAsset.upsideMultiple },
  matureBank: { score: matureBank.compositeScore, status: matureBank.investmentStatus, upside: matureBank.upsideMultiple },
  trap: { score: trap.compositeScore, trapIndex: trap.valueTrapIndex, reasons: trap.valueTrapReasons }
}, null, 2));
