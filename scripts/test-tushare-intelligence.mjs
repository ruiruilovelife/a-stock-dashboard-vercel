import assert from "node:assert/strict";

process.env.SKIP_DASHBOARD_MAIN = "true";
const { aggregateSellerConsensus } = await import("./update-dashboard.mjs");

const year = new Date().getFullYear();
const rows = [
  { ts_code: "000977.SZ", quarter: `${year}Q4`, org_name: "甲机构", report_date: `${year}0701`, np: 300000, op_rt: 1800000, eps: 2, pe: 20, min_price: 90, max_price: 110, report_title: "预测一", rating: "买入" },
  { ts_code: "000977.SZ", quarter: `${year}Q4`, org_name: "乙机构", report_date: `${year}0702`, np: 500000, op_rt: 2200000, eps: 3, pe: 24, min_price: 100, max_price: 120, report_title: "预测二", rating: "增持" },
  { ts_code: "000977.SZ", quarter: `${year + 1}Q4`, org_name: "甲机构", report_date: `${year}0702`, np: 700000, op_rt: 2600000, eps: 4, pe: 18, min_price: 130, max_price: 150, report_title: "远期预测", rating: "买入" },
  { ts_code: "300001.SZ", quarter: `${year}Q4`, org_name: "甲机构", report_date: `${year}0702`, np: null, op_rt: null, report_title: "缺值预测" }
];

const result = aggregateSellerConsensus(rows);
const consensus = result.get("000977");
assert.equal(consensus.consensusQuarter, `${year}Q4`, "应优先采用最近的未来完整年度预测");
assert.equal(consensus.consensusProfitYi, 40, "预测净利润万元必须正确换算为亿元并取中位数");
assert.equal(consensus.consensusRevenueYi, 200, "预测收入万元必须正确换算为亿元并取中位数");
assert.equal(consensus.consensusBrokerCount, 2);
assert.equal(consensus.consensusTargetPrice, 105, "目标价区间应使用全部上下限的中位数");
assert.equal(result.get("300001").consensusProfitYi, null, "缺失预测不得伪装成零利润");

console.log("Tushare institutional intelligence parser passed");
