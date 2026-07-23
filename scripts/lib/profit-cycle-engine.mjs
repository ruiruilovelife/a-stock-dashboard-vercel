const n = value => Number.isFinite(Number(value)) ? Number(value) : null;
const round = value => value === null ? null : Number(value.toFixed(2));

export function buildProfitBridge(input = {}) {
  const rows = [
    ["销量变化", input.volumeImpactYi, "主营"],
    ["产品价格/价差", input.priceSpreadImpactYi, input.isCyclical ? "周期" : "主营"],
    ["原材料成本", input.rawMaterialImpactYi, input.isCyclical ? "周期" : "主营"],
    ["产品结构", input.mixImpactYi, "结构"],
    ["产能利用率", input.utilizationImpactYi, "结构"],
    ["新增产能", input.newCapacityImpactYi, "结构"],
    ["毛利率变化", input.marginImpactYi, "结构"],
    ["折旧摊销", input.depreciationImpactYi, "主营"],
    ["财务费用", input.financeCostImpactYi, "主营"],
    ["投资收益", input.investmentIncomeImpactYi, "一次性"],
    ["政府补助及非经常损益", input.nonRecurringImpactYi, "一次性"]
  ].map(([factor, impactYi, type]) => {
    const impact = n(impactYi);
    return {
      factor,
      impactYi: impact,
      direction: impact === null ? "待验证" : impact > 0 ? "正向" : impact < 0 ? "负向" : "中性",
      sustainability: type === "一次性" ? "不可持续" : type === "周期" ? "随周期波动" : "需财报连续验证",
      mainBusiness: type !== "一次性",
      usableForValuation: type === "结构" || type === "主营"
    };
  });
  const missing = rows.filter(row => row.impactYi === null).map(row => row.factor);
  return { rows, missing, complete: missing.length === 0 };
}

export function normalizedProfit(input = {}) {
  const reportedProfitYi = n(input.reportedProfitYi);
  if (reportedProfitYi === null) {
    return { valid: false, normalizedProfitYi: null, reasons: ["缺少当期归母/扣非利润"] };
  }
  const nonRecurring = n(input.nonRecurringProfitYi) || 0;
  const investment = n(input.investmentIncomeProfitYi) || 0;
  const subsidy = n(input.governmentSubsidyProfitYi) || 0;
  const highCyclePremium = n(input.highCyclePremiumYi) || 0;
  const oneOff = nonRecurring + investment + subsidy;
  const normalized = Math.max(0, reportedProfitYi - oneOff - highCyclePremium);
  const structural = n(input.structuralProfitYi);
  const cyclical = n(input.cyclicalProfitYi);
  const reasons = [];
  if (oneOff > 0) reasons.push("已扣除投资收益、补助或其他一次性利润");
  if (highCyclePremium > 0) reasons.push("已扣除高景气周期溢利");
  if (structural === null) reasons.push("结构性利润贡献待财报分部数据验证");
  if (input.cyclePosition === "peak") reasons.push("处于周期顶部，正常化利润采用保守口径");
  return {
    valid: true,
    reportedProfitYi,
    normalizedProfitYi: round(normalized),
    cyclicalProfitYi: cyclical,
    structuralProfitYi: structural,
    oneOffProfitYi: round(oneOff),
    highCycleProfitYi: highCyclePremium || null,
    stressProfitYi: round(Math.max(0, normalized * Number(input.stressRatio ?? 0.7))),
    reasons
  };
}

export function buildCycleModel(input = {}) {
  const normalized = normalizedProfit(input);
  const cyclePosition = input.cyclePosition || "unknown";
  const currentProfitYi = normalized.reportedProfitYi ?? null;
  const normalProfitYi = normalized.normalizedProfitYi ?? null;
  const bottomProfitYi = n(input.bottomProfitYi) ?? (normalProfitYi === null ? null : round(normalProfitYi * 0.65));
  const peakProfitYi = n(input.peakProfitYi) ?? (currentProfitYi === null ? null : Math.max(currentProfitYi, normalProfitYi || 0));
  const currentMcapYi = n(input.currentMcapYi);
  const ratio = profit => currentMcapYi && profit ? round(currentMcapYi / profit) : null;
  const warning = cyclePosition === "peak" && currentProfitYi && normalProfitYi && currentProfitYi > normalProfitYi * 1.25
    ? "低PE可能来自周期顶部利润，禁止直接判定低估"
    : null;
  return {
    cyclePosition,
    confidence: input.cycleDataComplete ? "高" : "低",
    currentProfitYi,
    normalizedProfitYi: normalProfitYi,
    bottomProfitYi,
    peakProfitYi,
    currentPe: ratio(currentProfitYi),
    normalizedPe: ratio(normalProfitYi),
    bottomPe: ratio(bottomProfitYi),
    peakPe: ratio(peakProfitYi),
    warning,
    scenarios: {
      bottom: { profitYi: bottomProfitYi, label: "周期底部" },
      normal: { profitYi: normalProfitYi, label: "正常情景" },
      peak: { profitYi: peakProfitYi, label: "高景气情景" }
    }
  };
}
