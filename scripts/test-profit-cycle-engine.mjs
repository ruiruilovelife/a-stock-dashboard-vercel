import assert from "node:assert/strict";
import { buildCycleModel, buildProfitBridge, normalizedProfit } from "./lib/profit-cycle-engine.mjs";

const bridge = buildProfitBridge({ volumeImpactYi: 3, priceSpreadImpactYi: 5, nonRecurringImpactYi: 2, isCyclical: true });
assert.equal(bridge.rows.find(row => row.factor === "政府补助及非经常损益").usableForValuation, false);

const normalized = normalizedProfit({
  reportedProfitYi: 20,
  nonRecurringProfitYi: 2,
  investmentIncomeProfitYi: 1,
  highCyclePremiumYi: 5,
  cyclePosition: "peak"
});
assert.equal(normalized.normalizedProfitYi, 12);

const cycle = buildCycleModel({
  reportedProfitYi: 20,
  nonRecurringProfitYi: 2,
  highCyclePremiumYi: 5,
  cyclePosition: "peak",
  currentMcapYi: 240
});
assert.equal(cycle.normalizedPe, 18.46);
assert.match(cycle.warning, /周期顶部/);
console.log("profit-cycle-engine: passed");
