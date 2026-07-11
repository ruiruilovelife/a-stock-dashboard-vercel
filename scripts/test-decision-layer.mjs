import assert from "node:assert/strict";
import { buildIndustryMap } from "./lib/industry-map-engine.mjs";
import {
  buildChiefDecision,
  buildFundingStructure,
  buildPortfolioAdvice,
  buildSystemDataHealth,
  buildUnifiedEvents
} from "./lib/decision-engine.mjs";

const generatedAt = "2026-07-11 17:00:00";
const research = {
  code: "000977",
  name: "浪潮信息",
  industry: { level1: "AI算力与数字基础设施", level2: "AI服务器" },
  business: {
    legalIndustry: "计算机设备",
    originalMainIndustry: "服务器",
    coreRevenueSource: "AI服务器",
    coreProfitSource: "AI服务器",
    newGrowthBusiness: "国产算力",
    marketPricingLogic: "AI算力",
    commercializationStage: "快速放量",
    transformationScore: 72
  },
  valuation: {
    valid: true,
    actionEligible: true,
    confidence: "中",
    scenarios: {
      conservative: { targetPrice: 70 },
      neutral: { targetPrice: 95 },
      optimistic: { targetPrice: 120 }
    },
    futureScenarios: {
      neutral: { targetPrice: 130 },
      optimistic: { targetPrice: 165 }
    }
  },
  dataHealth: { market: { stale: false }, business: { source: "财报/公告" } },
  conclusion: { generatedAt }
};

const holdings = [{ name: "浪潮信息", code: "000977", close: 86, pct: 3.2, weight: "25%", theme: "AI服务器", amount: "120亿" }];
const hardEvents = [{ name: "浪潮信息", code: "000977", title: "半年度业绩预告", date: "2026-07-11", source: "巨潮资讯", priority: "P0", importance: "高", facts: ["净利润同比增长226%-288%"] }];
const publicNews = [{ name: "浪潮信息", code: "000977", title: "半年度业绩预告解读", date: "2026-07-11", source: "公开搜索", url: "https://example.com", snippet: "媒体解读" }];
const events = buildUnifiedEvents(hardEvents, publicNews);
const advice = buildPortfolioAdvice(holdings, new Map([[research.code, research]]), hardEvents);
const funding = buildFundingStructure({ sampleSize: 5000, upCount: 3100, downCount: 1800, limitUp: 62, limitDown: 8, medianPct: 0.7, emotion: "赚钱效应扩散", read: "上涨家数占优", activeIndustries: [{ industry: "AI算力", avgPct: 2.1, upRatio: 70, amountShare: 9 }] }, [{ name: "上证指数", pct: 0.4, trend: { status: "趋势维持" } }]);
const health = buildSystemDataHealth({ meta: { lastUpdated: generatedAt, marketSource: "全A行情" }, marketRows: [{ tradeDate: "20260711" }], financialSummary: { source: "Tushare", periods: ["20260331"], covered: 1 }, announcementCoverage: [{ status: "成功", source: "巨潮资讯" }], publicNewsCandidates: publicNews, globalMarkets: [{ name: "纳斯达克", close: 22000 }], modelAnalysis: { model: "gpt", status: "成功" } });
const chief = buildChiefDecision({ marketRegime: { regime: "结构性牛市", score: 4, summary: "主线扩散", positionGuide: "只做强主线" }, indices: [{ name: "上证指数", close: 3500, pct: 0.4 }], internals: { sampleSize: 5000, activeIndustries: [{ industry: "AI算力" }] }, portfolioAdvice: advice, events, dataHealth: health, guidanceTarget: "下一交易日" });
const industry = buildIndustryMap([research], events, funding, generatedAt);

assert.equal(events[0].credibility, "高");
assert.equal(advice.items[0].valuationDistance.neutralTargetPrice, 95);
assert.equal(health.degraded, false);
assert.equal(chief.marketStage.regime, "结构性牛市");
assert.ok(industry.trackCount >= 60);
assert.ok(industry.categories.flatMap(item => item.tracks).find(item => item.name === "AI算力与数据中心").companies.some(item => item.code === "000977"));

console.log(JSON.stringify({ events: events.length, action: advice.items[0].action, dataHealth: health.degraded ? "degraded" : "healthy", industryCategories: industry.categoryCount, industryTracks: industry.trackCount }, null, 2));
