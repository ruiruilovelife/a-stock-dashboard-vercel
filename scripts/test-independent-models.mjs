import assert from "node:assert/strict";
import { scoreCurrentValue, scoreFiveX, scoreShortTermElasticity } from "./lib/independent-models.mjs";

const fiveX = scoreFiveX({
  industryProfitPoolScore: 18, moatScore: 18, shareGainScore: 12, profitCagrScore: 12,
  cashFlowModelScore: 8, governanceScore: 8, valuationFeasibilityScore: 9,
  currentMcapYi: 100, targetPe: 25, maxReasonablePe: 35, targetNetMarginPct: 20,
  samYi: 800, maxAchievableSharePct: 20, capacityRevenueYi: 160, industryProfitPoolYi: 35
});
assert.equal(fiveX.passed, true);
assert.equal(fiveX.math.targetMcapYi, 500);
assert.equal(fiveX.math.targetProfitYi, 20);

const capacityFail = scoreFiveX({
  industryProfitPoolScore: 20, moatScore: 20, shareGainScore: 15, profitCagrScore: 15,
  cashFlowModelScore: 10, governanceScore: 10, valuationFeasibilityScore: 10,
  currentMcapYi: 100, targetPe: 20, maxReasonablePe: 30, targetNetMarginPct: 20,
  samYi: 100, maxAchievableSharePct: 20, capacityRevenueYi: 10, industryProfitPoolYi: 5
});
assert.equal(capacityFail.passed, false);
assert.ok(capacityFail.vetoes.some(item => item.includes("份额") || item.includes("产能") || item.includes("利润池")));

const valueTrap = scoreCurrentValue({
  normalizedEarningsScore: 24, cashFlowScore: 2, assetValueScore: 10, cyclePositionScore: 0,
  balanceSheetCapexScore: 4, shareholderReturnScore: 2, reratingCatalystScore: 3,
  currentMcapYi: 100, normalizedProfitYi: 10, cyclePeak: true, cashFlowWeak: true
});
assert.equal(valueTrap.passed, false);
assert.match(valueTrap.classification, /陷阱/);

const pricedIn = scoreShortTermElasticity({
  trendStartScore: 24, capitalEntryScore: 24, industryCatalystScore: 25,
  competitiveMoatScore: 8, catalystPricedIn: true,
  phase: "主升前爬坡"
});
assert.equal(pricedIn.passed, false);
assert.ok(pricedIn.vetoes.some(item => item.includes("充分交易")));

const noNewExpectation = scoreShortTermElasticity({
  trendStartScore: 25, capitalEntryScore: 25, industryCatalystScore: 26,
  competitiveMoatScore: 8, expectationEvidenceMissing: true,
  phase: "首次放量突破"
});
assert.equal(noNewExpectation.passed, false);
assert.ok(noNewExpectation.vetoes.some(item => item.includes("新增预期差")));

console.log("independent-models: passed");
