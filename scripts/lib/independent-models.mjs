// Independent research models. Each model owns its own score and admission rules.

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const num = value => Number.isFinite(Number(value)) ? Number(value) : null;

export function scoreFiveX(input = {}) {
  const score = {
    industryProfitPool: clamp(input.industryProfitPoolScore, 0, 20),
    moat: clamp(input.moatScore, 0, 20),
    shareGain: clamp(input.shareGainScore, 0, 15),
    profitCagr: clamp(input.profitCagrScore, 0, 15),
    cashFlowModel: clamp(input.cashFlowModelScore, 0, 10),
    governance: clamp(input.governanceScore, 0, 10),
    valuationFeasibility: clamp(input.valuationFeasibilityScore, 0, 10)
  };
  const currentMcapYi = num(input.currentMcapYi);
  const targetMcapYi = currentMcapYi && currentMcapYi > 0 ? currentMcapYi * 5 : null;
  const reasonablePe = num(input.targetPe);
  const targetProfitYi = targetMcapYi && reasonablePe && reasonablePe > 0 ? targetMcapYi / reasonablePe : null;
  const targetNetMarginPct = num(input.targetNetMarginPct);
  const targetRevenueYi = targetProfitYi && targetNetMarginPct && targetNetMarginPct > 0
    ? targetProfitYi / targetNetMarginPct * 100
    : null;
  const requiredSharePct = targetRevenueYi && num(input.samYi) && Number(input.samYi) > 0
    ? targetRevenueYi / Number(input.samYi) * 100
    : null;
  const vetoes = [];
  if (input.cycleOnly) vetoes.push("主要上涨逻辑仅为周期涨价");
  if (input.newBusinessStage && Number(input.newBusinessStage) < 4) vetoes.push("新业务尚未形成明确收入");
  if (input.nonRecurringProfitDominant) vetoes.push("当前利润主要来自非经常性损益");
  if (input.severeDilution) vetoes.push("存在严重潜在股本摊薄");
  if (input.governanceRisk) vetoes.push("公司治理或财务质量存在重大风险");
  if (!targetProfitYi || !targetRevenueYi || requiredSharePct === null) vetoes.push("五倍数学验证缺少目标利润、收入或份额证据");
  if (requiredSharePct !== null && requiredSharePct > Number(input.maxAchievableSharePct || 100)) vetoes.push("目标份额超过可实现上限");
  if (targetRevenueYi && num(input.capacityRevenueYi) && targetRevenueYi > Number(input.capacityRevenueYi)) vetoes.push("目标收入超过可验证产能上限");
  if (targetProfitYi && num(input.industryProfitPoolYi) && targetProfitYi > Number(input.industryProfitPoolYi)) vetoes.push("目标利润超过行业利润池承载范围");
  if (reasonablePe && num(input.maxReasonablePe) && reasonablePe > Number(input.maxReasonablePe)) vetoes.push("需要不现实的高估值才能完成五倍");
  const total = Object.values(score).reduce((sum, value) => sum + value, 0);
  return {
    model: "five_x_v2",
    score: Number(total.toFixed(1)),
    components: score,
    math: { targetMcapYi, targetProfitYi, targetRevenueYi, requiredSharePct, reasonablePe },
    vetoes,
    passed: vetoes.length === 0 && total >= 70
  };
}

export function scoreCurrentValue(input = {}) {
  const score = {
    normalizedEarnings: clamp(input.normalizedEarningsScore, 0, 25),
    cashFlow: clamp(input.cashFlowScore, 0, 15),
    assetValue: clamp(input.assetValueScore, 0, 15),
    cyclePosition: clamp(input.cyclePositionScore, 0, 15),
    balanceSheetCapex: clamp(input.balanceSheetCapexScore, 0, 10),
    shareholderReturn: clamp(input.shareholderReturnScore, 0, 10),
    reratingCatalyst: clamp(input.reratingCatalystScore, 0, 10)
  };
  const normalizedProfitYi = num(input.normalizedProfitYi);
  const currentMcapYi = num(input.currentMcapYi);
  const normalizedPe = normalizedProfitYi && currentMcapYi ? currentMcapYi / normalizedProfitYi : null;
  const vetoes = [];
  if (input.cyclePeak) vetoes.push("当前利润处于周期顶部，低PE可能是陷阱");
  if (input.cashFlowWeak) vetoes.push("经营现金流长期显著弱于净利润");
  if (input.receivablesOrInventoryAbnormal) vetoes.push("应收账款或存货异常增长");
  if (input.qualityRisk) vetoes.push("财务或治理质量风险未解除");
  const total = Object.values(score).reduce((sum, value) => sum + value, 0);
  return {
    model: "current_value_v2",
    score: Number(total.toFixed(1)),
    components: score,
    metrics: { normalizedProfitYi, normalizedPe },
    vetoes,
    classification: vetoes.length ? "低估陷阱或需降级" : total >= 70 ? "真低估/价值修复" : "当前估值待验证",
    passed: vetoes.length === 0 && total >= 60
  };
}

export function scoreShortTermElasticity(input = {}) {
  const score = {
    trendStart: clamp(input.trendStartScore, 0, 30),
    capitalEntry: clamp(input.capitalEntryScore, 0, 30),
    industryCatalyst: clamp(input.industryCatalystScore, 0, 30),
    competitiveMoat: clamp(input.competitiveMoatScore, 0, 10)
  };
  const total = Object.values(score).reduce((sum, value) => sum + value, 0);
  const vetoes = [];
  if (input.expectationEvidenceMissing) vetoes.push("缺少可验证的新增预期差，不作为强弹性推荐");
  if (input.catalystPricedIn) vetoes.push("催化已充分交易，不能重复加分");
  if (input.distributionRisk) vetoes.push("高位巨量更像筹码派发");
  if (input.breakdownRisk) vetoes.push("趋势破位，进入退潮风险");
  return {
    model: "short_term_elasticity_v3",
    score: Number(total.toFixed(1)),
    components: score,
    phase: input.phase || "阶段待确认",
    phaseConfidence: input.phaseConfidence ?? null,
    confirmation: input.confirmation || "等待下一阶段确认",
    support: input.support ?? null,
    resistance: input.resistance ?? null,
    vetoes,
    passed: vetoes.length === 0 && total >= 65
  };
}
