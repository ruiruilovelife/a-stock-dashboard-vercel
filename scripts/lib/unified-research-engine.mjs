import fs from "node:fs";

const valuationConfig = JSON.parse(fs.readFileSync(new URL("../../config/industry-valuation-parameters.json", import.meta.url), "utf8"));
const taxonomyConfig = JSON.parse(fs.readFileSync(new URL("../../config/industry-taxonomy.json", import.meta.url), "utf8"));
const businessStageConfig = JSON.parse(fs.readFileSync(new URL("../../config/business-stage-rules.json", import.meta.url), "utf8"));
const forwardGrowthConfig = JSON.parse(fs.readFileSync(new URL("../../config/forward-growth-assumptions.json", import.meta.url), "utf8"));

const SCENARIOS = ["conservative", "neutral", "optimistic"];

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function round(value, digits = 1) {
  return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : null;
}

function dateText(value) {
  const text = String(value || "").replace(/[^0-9]/g, "");
  if (text.length < 8) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function ageDays(value, now = new Date()) {
  const normalized = dateText(value);
  if (!normalized) return null;
  const timestamp = new Date(`${normalized}T00:00:00+08:00`).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.floor((now.getTime() - timestamp) / 86400000);
}

function dataStamp(value, source, maxAgeDays, now) {
  const normalized = dateText(value);
  const age = ageDays(value, now);
  return {
    date: normalized,
    source: source || "未标明",
    maxAgeDays,
    ageDays: age,
    stale: age === null || age > maxAgeDays,
    status: age === null ? "日期缺失" : age > maxAgeDays ? "已过期" : "有效"
  };
}

function confidenceRank(value) {
  return { low: 1, medium: 2, high: 3 }[value] || 0;
}

function lowerConfidence(...values) {
  return values.filter(Boolean).sort((a, b) => confidenceRank(a) - confidenceRank(b))[0] || "low";
}

function detectIndustryFamily(company = {}) {
  const legalIndustry = String(company.legalIndustry || company.industry || "").trim();
  const businessText = String(company.coreBusiness || company.businessDescription || "").trim();
  const text = `${legalIndustry} ${businessText}`.trim();
  const businessRule = businessText ? taxonomyConfig.rules.find(item => item.family !== "generic_industrial" && new RegExp(item.pattern, "i").test(businessText)) : null;
  const legalRule = taxonomyConfig.rules.find(item => new RegExp(item.pattern, "i").test(legalIndustry));
  const rule = businessRule || legalRule || taxonomyConfig.rules.find(item => item.family === "generic_industrial");
  const familyId = rule?.family || "generic_industrial";
  const parameters = valuationConfig.families[familyId] || valuationConfig.families.generic_industrial;
  const generic = familyId === "generic_industrial";
  const specialized = ["ai_infrastructure", "fluorochemicals", "new_energy_core", "semiconductor_advanced", "software_platform", "innovation_pharma"].includes(familyId);
  const businessVerified = Boolean(businessRule);
  return {
    familyId,
    legalIndustry: legalIndustry || "无法识别",
    level1: parameters.level1,
    level2: parameters.level2,
    confidence: !legalIndustry || generic || (specialized && !businessVerified) ? "low" : "medium",
    matchedBy: businessVerified ? "主营业务" : "法定行业",
    matchedPattern: rule?.pattern || null,
    parameters
  };
}

function boundedMetricScore(value, fullScale, weight) {
  const number = numberOrNull(value);
  if (number === null || fullScale <= 0) return 0;
  return clamp(number / fullScale, 0, 1) * weight;
}

function businessTransformationScore(evidence = {}) {
  const weights = businessStageConfig.weights;
  const commercialStagePoints = {
    none: 0,
    concept: 1,
    research: 2,
    validation: 5,
    small_scale: 7,
    ramp_up: 9,
    mature: 10
  };
  const customerQualityPoints = { none: 0, low: 1, medium: 3, high: 5 };
  const parts = {
    revenueShare: boundedMetricScore(evidence.newBusinessRevenueSharePct, 50, weights.revenueShare),
    profitShare: boundedMetricScore(evidence.newBusinessProfitSharePct, 50, weights.profitShare),
    newOrderShare: boundedMetricScore(evidence.newBusinessOrderSharePct, 50, weights.newOrderShare),
    revenueGrowth: boundedMetricScore(evidence.newBusinessRevenueGrowthPct, 80, weights.revenueGrowth),
    profitGrowth: boundedMetricScore(evidence.newBusinessProfitGrowthPct, 100, weights.profitGrowth),
    commercializationEvidence: commercialStagePoints[evidence.commercializationCode] || 0,
    customerQuality: customerQualityPoints[evidence.customerQuality] || 0,
    researchIntensity: boundedMetricScore(evidence.researchIntensityPct, 15, weights.researchIntensity),
    capitalCommitment: boundedMetricScore(evidence.newBusinessCapexSharePct, 40, weights.capitalCommitment)
  };
  const score = round(Object.values(parts).reduce((sum, value) => sum + value, 0), 1);
  const stage = businessStageConfig.stages.find(item => score >= item.min && score <= item.max) || businessStageConfig.stages[0];
  const observedFields = Object.values(evidence).filter(value => value !== null && value !== undefined && value !== "").length;
  return {
    score,
    parts: Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, round(value, 1)])),
    stage: stage.label,
    newBusinessValuationWeight: stage.newBusinessValuationWeight,
    allowPrimaryLogicSwitch: stage.allowPrimaryLogicSwitch,
    confidence: observedFields >= 7 ? "high" : observedFields >= 4 ? "medium" : "low",
    evidenceCount: observedFields,
    nonTriggerPolicy: businessStageConfig.nonTriggers
  };
}

function buildBusinessProfile(company, evidence = {}) {
  const transformation = businessTransformationScore(evidence);
  const newBusiness = evidence.newBusinessName || null;
  const inTransition = transformation.score >= 21 && Boolean(newBusiness);
  return {
    legalIndustry: company.legalIndustry || company.industry || "无法识别",
    originalMainIndustry: evidence.originalMainIndustry || company.legalIndustry || company.industry || "无法识别",
    coreRevenueSource: evidence.coreRevenueSource || company.industry || "待核验",
    coreProfitSource: evidence.coreProfitSource || company.industry || "待核验",
    newGrowthBusiness: newBusiness,
    newBusinessIndustry: evidence.newBusinessIndustry || null,
    marketPricingLogic: evidence.marketPricingLogic || company.industry || "待核验",
    inTransition,
    commercializationStage: transformation.stage,
    transformationScore: transformation.score,
    transformationBreakdown: transformation.parts,
    transformationConfidence: transformation.confidence,
    oldBusinessValuationWeight: round(1 - transformation.newBusinessValuationWeight, 2),
    newBusinessValuationWeight: transformation.newBusinessValuationWeight,
    allowPrimaryLogicSwitch: transformation.allowPrimaryLogicSwitch,
    segments: Array.isArray(evidence.segments) ? evidence.segments : [],
    lastLogicAdjustmentAt: evidence.lastLogicAdjustmentAt || null,
    adjustmentReason: evidence.adjustmentReason || "初始识别",
    nextReviewAt: evidence.nextReviewAt || null
  };
}

function qualityAdjustment(financial = {}, evidence = {}) {
  const revenueGrowth = numberOrNull(financial.latestRevenueGrowth ?? financial.revenueCagr3Y);
  const profitGrowth = numberOrNull(financial.latestProfitGrowth ?? financial.profitCagr3Y);
  const roe = numberOrNull(financial.roe);
  const roeTrend = numberOrNull(financial.roeTrend);
  const cashQuality = numberOrNull(financial.ocfToProfit);
  const debt = numberOrNull(financial.debtToAssets);
  const moat = numberOrNull(evidence.moatLevel);
  const cycle = String(evidence.cyclePosition || "normal");
  const governanceRisk = numberOrNull(evidence.governanceRiskScore);

  const growthFactor = profitGrowth !== null
    ? profitGrowth >= 50 ? 1.18 : profitGrowth >= 25 ? 1.1 : profitGrowth >= 10 ? 1.04 : profitGrowth < 0 ? 0.82 : 1
    : revenueGrowth !== null && revenueGrowth >= 20 ? 1.06 : 1;
  const qualityFactor = roe !== null
    ? roe >= 20 ? 1.1 : roe >= 12 ? 1.04 : roe < 6 ? 0.86 : 1
    : 0.96;
  const trendFactor = roeTrend !== null ? roeTrend >= 3 ? 1.05 : roeTrend < -3 ? 0.9 : 1 : 1;
  const cashFactor = cashQuality !== null ? cashQuality >= 100 ? 1.05 : cashQuality < 50 ? 0.88 : 1 : 0.98;
  const leverageFactor = debt !== null && debt > 75 ? 0.82 : debt !== null && debt > 60 ? 0.92 : 1;
  const moatFactor = moat !== null ? clamp(0.88 + moat * 0.055, 0.88, 1.16) : 1;
  const cycleFactor = cycle === "peak" ? 0.82 : cycle === "bottom" ? 1.08 : 1;
  const governanceFactor = governanceRisk !== null ? clamp(1 - governanceRisk / 200, 0.75, 1) : 1;
  const raw = growthFactor * qualityFactor * trendFactor * cashFactor * leverageFactor * moatFactor * cycleFactor * governanceFactor;
  return {
    combined: round(clamp(raw, 0.65, 1.35), 3),
    factors: {
      growth: round(growthFactor, 3),
      profitability: round(qualityFactor, 3),
      roeTrend: round(trendFactor, 3),
      cashQuality: round(cashFactor, 3),
      leverage: round(leverageFactor, 3),
      moat: round(moatFactor, 3),
      cycle: round(cycleFactor, 3),
      governance: round(governanceFactor, 3)
    }
  };
}

function boundMultiple(value, bounds = []) {
  if (!Array.isArray(bounds) || bounds.length < 2) return value;
  return clamp(value, Number(bounds[0]), Number(bounds[1]));
}

function impliedBases(company, financial = {}) {
  const currentMcapYi = numberOrNull(company.marketCapYi ?? company.currentMcapYi);
  const pe = numberOrNull(company.peTtm ?? company.pe);
  const pb = numberOrNull(company.pb);
  const ps = numberOrNull(company.psTtm ?? company.ps);
  const close = numberOrNull(company.close);
  const rawSharesYi = numberOrNull(company.totalSharesYi);
  const inferredSharesYi = currentMcapYi !== null && close && close > 0 ? currentMcapYi / close : null;
  const shareRatio = rawSharesYi !== null && inferredSharesYi ? rawSharesYi / inferredSharesYi : null;
  const suppliedSharesPlausible = rawSharesYi !== null && rawSharesYi > 0 && (shareRatio === null || (shareRatio >= 0.8 && shareRatio <= 1.2));
  const totalSharesYi = suppliedSharesPlausible ? rawSharesYi : inferredSharesYi;
  const impliedTtmEarningsYi = pe !== null && pe > 0 && currentMcapYi !== null ? currentMcapYi / pe : numberOrNull(financial.normalizedProfitYi);
  const guidanceLowYi = numberOrNull(financial.guidancePeriodProfitLowYi);
  const guidanceHighYi = numberOrNull(financial.guidancePeriodProfitHighYi);
  const guidancePriorYi = numberOrNull(financial.guidancePriorPeriodProfitYi);
  const guidanceGrowthLowPct = numberOrNull(financial.guidanceGrowthLowPct);
  const guidanceGrowthHighPct = numberOrNull(financial.guidanceGrowthHighPct);
  const hasHalfYearGuidance = financial.guidancePeriod === "H1" && guidanceLowYi !== null && guidanceHighYi !== null && guidancePriorYi !== null;
  const priorRemainderYi = hasHalfYearGuidance && impliedTtmEarningsYi !== null ? Math.max(0, impliedTtmEarningsYi - guidancePriorYi) : null;
  const guidanceMidYi = hasHalfYearGuidance ? (guidanceLowYi + guidanceHighYi) / 2 : null;
  const guidanceMidGrowthPct = guidanceGrowthLowPct !== null && guidanceGrowthHighPct !== null ? (guidanceGrowthLowPct + guidanceGrowthHighPct) / 2 : null;
  const guidanceAnnualized = hasHalfYearGuidance ? {
    conservative: guidanceLowYi + priorRemainderYi,
    neutral: guidanceMidYi + priorRemainderYi * (1 + Math.min(Math.max((guidanceMidGrowthPct || 0) * 0.5, 0), 60) / 100),
    optimistic: guidanceHighYi + priorRemainderYi * (1 + Math.min(Math.max((guidanceGrowthHighPct || 0) * 0.75, 0), 100) / 100)
  } : null;
  const forwardEarningsYi = numberOrNull(financial.consensusProfitYi ?? financial.forwardProfitYi ?? financial.guidanceProfitYi)
    ?? guidanceAnnualized?.neutral
    ?? null;
  const forwardRevenueYi = numberOrNull(financial.consensusRevenueYi ?? financial.forwardRevenueYi ?? financial.guidanceRevenueYi);
  return {
    currentMcapYi,
    close,
    totalSharesYi,
    shareSource: suppliedSharesPlausible ? company.shareSource || "行情接口" : totalSharesYi !== null ? "市值/股价反推（原股本字段异常或缺失）" : null,
    rawSharesYi,
    shareRepaired: rawSharesYi !== null && !suppliedSharesPlausible,
    pe,
    pb,
    ps,
    earningsYi: forwardEarningsYi ?? impliedTtmEarningsYi,
    earningsByScenario: guidanceAnnualized,
    earningsSource: guidanceAnnualized ? "业绩预告分期年化" : forwardEarningsYi !== null ? "未来12个月盈利预测" : "当前市值/TTM PE反推",
    guidanceAudit: guidanceAnnualized ? {
      period: "H1",
      currentLowYi: guidanceLowYi,
      currentHighYi: guidanceHighYi,
      priorSamePeriodYi: guidancePriorYi,
      priorRemainderYi: round(priorRemainderYi, 2),
      annualized: Object.fromEntries(Object.entries(guidanceAnnualized).map(([key, value]) => [key, round(value, 2)])),
      rule: "保守：下半年不增长；中性：兑现上半年同比的一半且最高60%；乐观：兑现75%且最高100%。"
    } : null,
    bookValueYi: pb !== null && pb > 0 && currentMcapYi !== null ? currentMcapYi / pb : numberOrNull(financial.bookValueYi),
    revenueYi: forwardRevenueYi ?? (ps !== null && ps > 0 && currentMcapYi !== null ? currentMcapYi / ps : numberOrNull(financial.revenueYi)),
    revenueSource: forwardRevenueYi !== null ? "未来12个月收入预测" : "当前市值/TTM PS反推",
    forecastHorizonYears: forwardEarningsYi !== null || forwardRevenueYi !== null ? 1 : 0,
    embeddedValueYi: numberOrNull(financial.embeddedValueYi),
    pipelineRnpvYi: numberOrNull(financial.pipelineRnpvYi),
    navYi: numberOrNull(financial.navYi)
  };
}

function methodForFamily(familyId, bases) {
  if (familyId === "insurance") return bases.embeddedValueYi ? "P_EV" : bases.bookValueYi ? "PB" : null;
  if (familyId === "bank" || familyId === "securities") return bases.bookValueYi ? "PB" : null;
  if (familyId === "innovation_pharma") return bases.pipelineRnpvYi ? "PIPELINE_RNPV" : null;
  if (familyId === "real_estate") return bases.navYi ? "NAV" : bases.bookValueYi ? "PB" : null;
  if (familyId === "software_platform" && (!bases.earningsYi || bases.earningsYi <= 0)) return bases.revenueYi ? "PS" : null;
  if (bases.earningsYi && bases.earningsYi > 0) return ["cyclical_resources", "fluorochemicals"].includes(familyId) ? "MID_CYCLE_PE" : "FORWARD_PE";
  if (bases.revenueYi && ["semiconductor_advanced", "software_platform"].includes(familyId)) return "PS";
  if (bases.bookValueYi) return "PB";
  return null;
}

function forwardGrowthAssumptions(familyId, financial = {}, evidence = {}) {
  const family = forwardGrowthConfig.families[familyId] || forwardGrowthConfig.families.generic_industrial;
  const profitSignals = [financial.profitCagr3Y, financial.latestProfitGrowth, financial.latestNonGaapGrowth].map(numberOrNull).filter(value => value !== null);
  const revenueSignals = [financial.revenueCagr3Y, financial.latestRevenueGrowth].map(numberOrNull).filter(value => value !== null);
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const profitSignal = average(profitSignals);
  const revenueSignal = average(revenueSignals);
  const marginTrend = numberOrNull(financial.marginTrend) || 0;
  const newBusinessRevenueShare = numberOrNull(evidence.newBusinessRevenueSharePct) || 0;
  const newBusinessProfitShare = numberOrNull(evidence.newBusinessProfitSharePct) || 0;
  const policyStrength = clamp(numberOrNull(evidence.policyStrengthScore) || 0, 0, 5);
  const shareGain = revenueSignal === null ? 0 : clamp((revenueSignal - family.base) * 0.35, -5, 15);
  const marginContribution = clamp(marginTrend * 0.5, -6, 10);
  const profitConversion = profitSignal === null || revenueSignal === null ? 0 : clamp((profitSignal - revenueSignal) * 0.15, -6, 15);
  const newBusinessRevenueContribution = clamp(newBusinessRevenueShare * 0.12, 0, 8);
  const newBusinessProfitContribution = clamp(newBusinessProfitShare * 0.15, 0, 10);
  const policyContribution = policyStrength * 0.6;
  const evidenceCount = profitSignals.length + revenueSignals.length
    + (marginTrend !== 0 ? 1 : 0)
    + (newBusinessRevenueShare > 0 ? 1 : 0)
    + (newBusinessProfitShare > 0 ? 1 : 0)
    + (policyStrength > 0 ? 1 : 0);
  const dynamicProfitCeiling = Math.max(family.max, Math.min(80, Math.max(0, profitSignal || 0) * 0.8));
  const dynamicRevenueCeiling = Math.max(family.max, Math.min(60, Math.max(0, revenueSignal || 0) * 0.8));
  const revenueNeutral = clamp(family.base + shareGain + newBusinessRevenueContribution + policyContribution, family.min, dynamicRevenueCeiling);
  const neutral = clamp(revenueNeutral + marginContribution + profitConversion + newBusinessProfitContribution, family.min, dynamicProfitCeiling);
  const conservative = clamp(family.base * 0.55 + Math.min(shareGain, 0) + Math.min(marginContribution, 0), family.min, neutral);
  const optimistic = clamp(neutral + Math.max(0, family.max - family.base) * 0.65 + Math.max(shareGain, 0) * 0.5, neutral, Math.max(dynamicProfitCeiling, family.max));
  const revenueConservative = clamp(family.base * 0.6 + Math.min(shareGain, 0), family.min, revenueNeutral);
  const revenueOptimistic = clamp(revenueNeutral + Math.max(0, family.max - family.base) * 0.6, revenueNeutral, Math.max(dynamicRevenueCeiling, family.max));
  const rates = {
    conservative: { profitCagrPct: round(conservative, 1), revenueCagrPct: round(revenueConservative, 1) },
    neutral: { profitCagrPct: round(neutral, 1), revenueCagrPct: round(revenueNeutral, 1) },
    optimistic: { profitCagrPct: round(optimistic, 1), revenueCagrPct: round(revenueOptimistic, 1) }
  };
  return {
    version: forwardGrowthConfig.version,
    industryRange: { min: family.min, base: family.base, max: family.max },
    industryDriver: family.driver,
    historicalSignals: { profitCagr3Y: numberOrNull(financial.profitCagr3Y), latestProfitGrowth: numberOrNull(financial.latestProfitGrowth), revenueCagr3Y: numberOrNull(financial.revenueCagr3Y), latestRevenueGrowth: numberOrNull(financial.latestRevenueGrowth) },
    decomposition: {
      industryGrowthPct: family.base,
      companyShareGainPct: round(shareGain, 1),
      marginContributionPct: round(marginContribution, 1),
      profitConversionPct: round(profitConversion, 1),
      newBusinessRevenueContributionPct: round(newBusinessRevenueContribution, 1),
      newBusinessProfitContributionPct: round(newBusinessProfitContribution, 1),
      policyContributionPct: round(policyContribution, 1)
    },
    rates,
    realization: forwardGrowthConfig.scenarioRealization,
    evidenceCount,
    valid: evidenceCount >= 2,
    confidence: evidenceCount >= 4 ? "high" : evidenceCount >= 2 ? "medium" : "low",
    marketShareEvidence: evidence.marketShareGrowthPct ?? null,
    rule: "产业增速决定起点，公司份额、利润率、新业务和政策兑现形成增量；财报增速只用于验证执行力和限制情景，不直接替代产业空间。"
  };
}

function projectedBases(bases, assumptions, scenario, years) {
  const rates = assumptions.rates[scenario];
  if (!rates) return { ...bases };
  const realization = Number(assumptions.realization[scenario] || 1);
  const projectionYears = Math.max(0, years - Number(bases.forecastHorizonYears || 0));
  const grow = (value, rate) => value && value > 0
    ? value * Math.pow(1 + (rate / 100) * realization, projectionYears)
    : value;
  const scenarioEarnings = numberOrNull(bases.earningsByScenario?.[scenario]) ?? bases.earningsYi;
  return {
    ...bases,
    earningsYi: grow(scenarioEarnings, rates.profitCagrPct),
    bookValueYi: grow(bases.bookValueYi, Math.min(rates.profitCagrPct, 18)),
    revenueYi: grow(bases.revenueYi, rates.revenueCagrPct),
    embeddedValueYi: grow(bases.embeddedValueYi, Math.min(rates.profitCagrPct, 15)),
    pipelineRnpvYi: bases.pipelineRnpvYi,
    navYi: grow(bases.navYi, Math.min(rates.revenueCagrPct, 8))
  };
}

function scenarioValue(method, scenario, parameters, bases, adjustment, financial = {}, evidence = {}) {
  const params = parameters.scenarios?.[scenario] || {};
  const bounds = parameters.reasonableBounds || {};
  const scenarioAdjustment = scenario === "conservative" ? Math.min(1, adjustment.combined)
    : scenario === "optimistic" ? Math.max(1, adjustment.combined)
      : adjustment.combined;
  let multiple = null;
  let basis = null;
  if (method === "P_EV") {
    multiple = boundMultiple(Number(params.pEv) * scenarioAdjustment, bounds.pEv);
    basis = bases.embeddedValueYi;
  } else if (method === "PB") {
    multiple = boundMultiple(Number(params.pb) * scenarioAdjustment, bounds.pb);
    basis = bases.bookValueYi;
  } else if (method === "PIPELINE_RNPV") {
    multiple = scenario === "conservative" ? 0.75 : scenario === "optimistic" ? 1.25 : 1;
    basis = bases.pipelineRnpvYi;
  } else if (method === "NAV") {
    multiple = scenario === "conservative" ? 0.65 : scenario === "optimistic" ? 1 : 0.82;
    basis = bases.navYi;
  } else if (method === "PS") {
    multiple = boundMultiple(Number(params.ps) * scenarioAdjustment, bounds.ps);
    basis = bases.revenueYi;
  } else {
    multiple = boundMultiple(Number(params.pe) * scenarioAdjustment, bounds.pe);
    basis = bases.earningsYi;
    if (method === "MID_CYCLE_PE") {
      const profitGrowth = numberOrNull(financial.latestProfitGrowth ?? financial.profitCagr3Y);
      const normalization = evidence.cyclePosition === "peak" ? 0.6 : profitGrowth !== null && profitGrowth > 50 ? 0.72 : 0.88;
      basis *= normalization;
    }
  }
  if (!Number.isFinite(Number(basis)) || Number(basis) <= 0 || !Number.isFinite(Number(multiple)) || Number(multiple) <= 0) return null;
  const marketCapYi = Number(basis) * Number(multiple);
  const roundedMarketCapYi = round(marketCapYi, 0);
  const targetPrice = bases.totalSharesYi && bases.totalSharesYi > 0 ? roundedMarketCapYi / bases.totalSharesYi : null;
  return {
    marketCapYi: roundedMarketCapYi,
    targetPrice: round(targetPrice, 2),
    multiple: round(multiple, 2),
    basisYi: round(basis, 2),
    method
  };
}

function probabilityWeightedScenario(scenarios, bases, confidence = "low") {
  const weightSets = {
    high: { conservative: 0.2, neutral: 0.55, optimistic: 0.25 },
    medium: { conservative: 0.3, neutral: 0.5, optimistic: 0.2 },
    low: { conservative: 0.45, neutral: 0.4, optimistic: 0.15 }
  };
  const weights = weightSets[confidence] || weightSets.low;
  const available = SCENARIOS.filter(name => Number(scenarios?.[name]?.marketCapYi) > 0);
  if (!available.length) return null;
  const totalWeight = available.reduce((sum, name) => sum + weights[name], 0);
  const marketCapYi = available.reduce((sum, name) => sum + Number(scenarios[name].marketCapYi) * weights[name], 0) / totalWeight;
  const roundedMarketCapYi = round(marketCapYi, 0);
  return {
    marketCapYi: roundedMarketCapYi,
    targetPrice: bases.totalSharesYi ? round(roundedMarketCapYi / bases.totalSharesYi, 2) : null,
    method: "PROBABILITY_WEIGHTED_SCENARIOS",
    weights,
    sourceMethods: Object.fromEntries(available.map(name => [name, scenarios[name].method]))
  };
}

function validateValuation({ company, industry, business, financial, bases, method, scenarios, futureScenarios, forwardAssumptions, marketStamp, financialStamp }) {
  const invalidReasons = [];
  const warnings = [];
  if (bases.shareRepaired) warnings.push("原始总股本字段异常，目标价改用当前市值÷当前股价反推股本");
  const parameters = industry.parameters;
  if (!company.code || !company.name) invalidReasons.push("公司代码或名称缺失");
  if (industry.confidence === "low" || industry.familyId === "generic_industrial") invalidReasons.push("行业无法可靠识别");
  if (!method) invalidReasons.push("缺少行业适配估值基础");
  if (method && parameters.forbiddenMethods?.includes(method)) invalidReasons.push(`估值方法${method}被该行业禁止`);
  if (["insurance", "bank", "securities"].includes(industry.familyId) && method === "PS") invalidReasons.push("金融公司禁止使用普通PS估值");
  if (industry.familyId === "innovation_pharma" && method !== "PIPELINE_RNPV") invalidReasons.push("创新药缺少风险调整管线估值");
  if (method?.includes("PE") && (!bases.earningsYi || bases.earningsYi <= 0)) invalidReasons.push("未盈利公司禁止使用PE");
  if (["cyclical_resources", "fluorochemicals"].includes(industry.familyId) && method === "FORWARD_PE") invalidReasons.push("周期公司禁止直接使用利润高点PE");
  if (business.newBusinessValuationWeight > 0.1 && business.transformationConfidence === "low") invalidReasons.push("新业务数据不足但估值权重过高");
  if (marketStamp.stale) invalidReasons.push("行情或市值数据已过期");
  if (financialStamp.stale) invalidReasons.push("财务数据已过期");
  if (!bases.currentMcapYi || bases.currentMcapYi <= 0) invalidReasons.push("当前市值缺失或单位无法确认");
  if (!bases.totalSharesYi || bases.totalSharesYi <= 0) invalidReasons.push("总股本缺失，无法校验目标价");
  if (!forwardAssumptions.valid) invalidReasons.push("缺少至少两项可靠成长数据，不能生成前瞻估值");
  if (!scenarios.neutral?.marketCapYi || !scenarios.neutral?.targetPrice) invalidReasons.push("缺少12个月中性估值情景");
  if (!futureScenarios?.neutral?.marketCapYi || !futureScenarios?.neutral?.targetPrice) invalidReasons.push("缺少三年中性估值情景");
  for (const scenario of SCENARIOS) {
    const result = scenarios[scenario];
    if (!result) continue;
    const calculatedPrice = bases.totalSharesYi ? result.marketCapYi / bases.totalSharesYi : null;
    if (calculatedPrice !== null && Math.abs(calculatedPrice - result.targetPrice) > 0.05) invalidReasons.push(`${scenario}目标市值与目标价不一致`);
  }
  for (const scenario of SCENARIOS) {
    const result = futureScenarios?.[scenario];
    if (!result) continue;
    const calculatedPrice = bases.totalSharesYi ? result.marketCapYi / bases.totalSharesYi : null;
    if (calculatedPrice !== null && Math.abs(calculatedPrice - result.targetPrice) > 0.05) invalidReasons.push(`${scenario}三年目标市值与目标价不一致`);
  }
  if (scenarios.conservative && scenarios.optimistic && scenarios.conservative.marketCapYi > scenarios.optimistic.marketCapYi) invalidReasons.push("保守估值高于乐观估值");
  const twelveMonthRatio = scenarios.neutral?.marketCapYi && bases.currentMcapYi ? scenarios.neutral.marketCapYi / bases.currentMcapYi : null;
  const strategicRatio = futureScenarios?.neutral?.marketCapYi && bases.currentMcapYi ? futureScenarios.neutral.marketCapYi / bases.currentMcapYi : null;
  if (twelveMonthRatio !== null && twelveMonthRatio > 2.5) invalidReasons.push("12个月中性估值超过当前市值2.5倍，重估或盈利假设过于极端");
  if (strategicRatio !== null && strategicRatio > 5) invalidReasons.push("三年中性估值超过当前市值5倍，必须补充市场份额和订单证据");
  if (twelveMonthRatio !== null && twelveMonthRatio < 0.25) invalidReasons.push("12个月中性估值低于当前市值25%，可能存在业务、资产或周期识别缺失");
  if (strategicRatio !== null && strategicRatio < 0.25) invalidReasons.push("三年中性估值低于当前市值25%，禁止用极端低值指导卖出");
  if (industry.familyId === "insurance" && !bases.embeddedValueYi) warnings.push("内含价值缺失：仅输出PB交叉估值，不允许进入空间排名");
  if (industry.familyId === "utilities") warnings.push("股息率和DCF数据未完整接入，当前仅为辅助估值");
  if (business.inTransition && !business.segments.length) warnings.push("处于业务转型期但缺少分部数据，暂不提高新业务估值权重");
  if (bases.shareSource === "市值/股价反推") warnings.push("总股本由市值和股价反推，待独立股本数据复核");
  return { valid: invalidReasons.length === 0, invalidReasons: [...new Set(invalidReasons)], warnings: [...new Set(warnings)] };
}

function buildValuation(company, financial, industry, business, evidence, stamps) {
  const bases = impliedBases(company, financial);
  const adjustment = qualityAdjustment(financial, evidence);
  const method = methodForFamily(industry.familyId, bases);
  const forwardAssumptions = forwardGrowthAssumptions(industry.familyId, financial, evidence);
  let scenarios = Object.fromEntries(SCENARIOS.map(name => [name, scenarioValue(method, name, industry.parameters, projectedBases(bases, forwardAssumptions, name, 1), adjustment, financial, evidence)]));
  let futureScenarios = Object.fromEntries(SCENARIOS.map(name => [name, scenarioValue(method, name, industry.parameters, projectedBases(bases, forwardAssumptions, name, 3), adjustment, financial, evidence)]));

  if (business.segments.length >= 2 && business.transformationScore >= 41) {
    const valuedSegments = business.segments.filter(segment => numberOrNull(segment.valueYi) !== null);
    if (valuedSegments.length === business.segments.length) {
      const segmentTotal = valuedSegments.reduce((sum, segment) => sum + Number(segment.valueYi), 0);
      const netDebtYi = numberOrNull(financial.netDebtYi ?? financial.netDebt) || 0;
      const holdingDiscount = clamp(numberOrNull(evidence.holdingDiscountPct) || 0, 0, 30) / 100;
      const neutral = Math.max(0, (segmentTotal - netDebtYi) * (1 - holdingDiscount));
      const sotpScenario = (value) => {
        const marketCapYi = round(value, 0);
        return { marketCapYi, targetPrice: bases.totalSharesYi ? round(marketCapYi / bases.totalSharesYi, 2) : null, multiple: null, basisYi: round(segmentTotal, 1), method: "SOTP" };
      };
      scenarios = {
        conservative: sotpScenario(neutral * 0.8),
        neutral: sotpScenario(neutral),
        optimistic: sotpScenario(neutral * 1.2)
      };
      futureScenarios = scenarios;
    }
  }

  const forwardEvidenceCount = [
    financial.consensusProfitYi,
    financial.forwardProfitYi,
    financial.guidanceProfitYi,
    financial.guidancePeriodProfitLowYi,
    financial.guidancePeriodProfitHighYi,
    financial.consensusRevenueYi,
    financial.forwardRevenueYi,
    financial.guidanceRevenueYi,
    evidence.forwardProfitYi,
    evidence.forwardRevenueYi
  ].filter(value => numberOrNull(value) !== null).length;
  const validation = validateValuation({ company, industry, business, financial, bases, method, scenarios, futureScenarios, forwardAssumptions, marketStamp: stamps.market, financialStamp: stamps.financial });
  const scenarioConfidence = forwardEvidenceCount >= 2 && forwardAssumptions.confidence === "high"
    ? "high"
    : forwardEvidenceCount >= 1 && forwardAssumptions.confidence !== "low"
      ? "medium"
      : "low";
  const probabilityWeighted = probabilityWeightedScenario(scenarios, bases, scenarioConfidence);
  const strategicProbabilityWeighted = probabilityWeightedScenario(futureScenarios, bases, scenarioConfidence);
  const centralMcap = strategicProbabilityWeighted?.marketCapYi;
  const upsideMultiple = validation.valid && forwardEvidenceCount > 0 && centralMcap && bases.currentMcapYi ? round(centralMcap / bases.currentMcapYi, 2) : null;
  const twelveMonthMcap = probabilityWeighted?.marketCapYi;
  const twelveMonthUpsideMultiple = validation.valid && forwardEvidenceCount > 0 && twelveMonthMcap && bases.currentMcapYi ? round(twelveMonthMcap / bases.currentMcapYi, 2) : null;
  const rankingEligible = validation.valid
    && forwardEvidenceCount > 0
    && !(industry.familyId === "insurance" && !bases.embeddedValueYi)
    && !(industry.familyId === "utilities" && !numberOrNull(financial.dividendYieldPct));
  const actionEligible = validation.valid && forwardEvidenceCount > 0;
  return {
    engineVersion: valuationConfig.parameterVersion,
    method,
    primaryMethods: industry.parameters.primaryMethods,
    auxiliaryMethods: industry.parameters.auxiliaryMethods,
    forbiddenMethods: industry.parameters.forbiddenMethods,
    adjustment,
    bases,
    scenarios,
    futureScenarios,
    probabilityWeighted,
    strategicProbabilityWeighted,
    centralValuationMethod: "概率加权情景估值",
    forwardAssumptions,
    conservative: scenarios.conservative,
    neutral: scenarios.neutral,
    optimistic: scenarios.optimistic,
    upsideMultiple,
    twelveMonthUpsideMultiple,
    valid: validation.valid,
    rankingEligible,
    actionEligible,
    forwardEvidenceCount,
    actionInvalidReason: actionEligible ? null : "缺少业绩预告、机构一致预测或明确订单支撑的未来盈利基数",
    invalidReasons: validation.invalidReasons,
    warnings: validation.warnings,
    confidence: validation.valid ? lowerConfidence(industry.parameters.confidence, industry.confidence, business.transformationConfidence === "low" && business.inTransition ? "low" : "high") : "low",
    explanation: validation.valid
      ? `${industry.level2}按${scenarios.neutral?.method || method}建立保守/中性/乐观情景，中央估值使用概率加权而非直接取中性值。${actionEligible ? "已取得未来盈利基数，可辅助持仓动作。" : "未来盈利基数未独立确认，仅保留成长研究，不输出空间排名和买卖动作。"}`
      : "估值结果异常、关键数据不足或估值逻辑无法验证，暂不参与排名。",
    audit: {
      currentMcapYi: bases.currentMcapYi,
      currentPrice: bases.close,
      totalSharesYi: round(bases.totalSharesYi, 4),
      shareSource: bases.shareSource,
      pe: bases.pe,
      pb: bases.pb,
      ps: bases.ps,
      impliedEarningsYi: round(bases.earningsYi, 2),
      earningsSource: bases.earningsSource,
      guidanceAudit: bases.guidanceAudit,
      impliedBookValueYi: round(bases.bookValueYi, 2),
      impliedRevenueYi: round(bases.revenueYi, 2),
      revenueSource: bases.revenueSource,
      forwardEvidenceCount,
      embeddedValueYi: bases.embeddedValueYi,
      forwardGrowthVersion: forwardAssumptions.version,
      forwardGrowthRates: forwardAssumptions.rates,
      twelveMonthNeutralMcapYi: scenarios.neutral?.marketCapYi,
      strategicNeutralMcapYi: futureScenarios.neutral?.marketCapYi,
      probabilityWeightedMcapYi: probabilityWeighted?.marketCapYi,
      strategicProbabilityWeightedMcapYi: strategicProbabilityWeighted?.marketCapYi,
      scenarioWeights: strategicProbabilityWeighted?.weights,
      unit: "亿元/亿股/元",
      parameterVersion: valuationConfig.parameterVersion
    }
  };
}

function buildCompanyResearchSnapshot(company, financial = {}, evidence = {}, context = {}) {
  const now = context.now instanceof Date ? context.now : new Date();
  const staticIndustry = detectIndustryFamily(company);
  const baseBusiness = buildBusinessProfile(company, evidence);
  const migrationCandidate = baseBusiness.allowPrimaryLogicSwitch
    && baseBusiness.transformationConfidence === "high"
    && baseBusiness.newBusinessIndustry
      ? detectIndustryFamily({ legalIndustry: baseBusiness.newBusinessIndustry, coreBusiness: baseBusiness.newGrowthBusiness })
      : null;
  const migrationApplied = Boolean(migrationCandidate && migrationCandidate.confidence !== "low" && migrationCandidate.familyId !== staticIndustry.familyId);
  const industry = migrationApplied ? migrationCandidate : staticIndustry;
  const business = {
    ...baseBusiness,
    staticValuationFamily: staticIndustry.familyId,
    adoptedValuationFamily: industry.familyId,
    migrationApplied,
    migrationStatus: migrationApplied
      ? `新业务已成为主要利润来源，主估值从${staticIndustry.level2}迁移至${industry.level2}`
      : baseBusiness.transformationScore >= 41
        ? "处于第二增长曲线或快速放量阶段，优先SOTP，不切换全部估值"
        : "沿用原主营估值；概念和早期业务仅给予有限期权价值",
    migrationEvidence: migrationApplied ? {
      transformationScore: baseBusiness.transformationScore,
      confidence: baseBusiness.transformationConfidence,
      newBusinessIndustry: baseBusiness.newBusinessIndustry,
      reason: baseBusiness.adjustmentReason
    } : null
  };
  const marketStamp = dataStamp(company.tradeDate || context.marketDate, context.marketSource || "行情源", context.marketMaxAgeDays || 7, now);
  const financialStamp = dataStamp(financial.reportPeriod, context.financialSource || "财务源", context.financialMaxAgeDays || 550, now);
  const stamps = {
    market: marketStamp,
    financial: financialStamp,
    announcement: context.announcementStamp || { date: null, source: "公告源", status: "待接入", stale: true },
    news: context.newsStamp || { date: null, source: "新闻源", status: "待接入", stale: true },
    industry: { date: valuationConfig.updatedAt, source: industry.parameters.parameterSource, status: "有效", stale: false },
    overseas: context.overseasStamp || { date: null, source: "海外源", status: "待接入", stale: true },
    model: { date: context.calculatedAt || now.toISOString(), source: valuationConfig.parameterVersion, status: "已计算", stale: false }
  };
  const valuation = buildValuation(company, financial, industry, business, evidence, stamps);
  const conclusionInvalid = !valuation.valid || marketStamp.stale || financialStamp.stale;
  return {
    schemaVersion: "company-research-snapshot/1.0.0",
    code: company.code,
    name: company.name,
    exchange: company.exchange || null,
    legalIndustry: industry.legalIndustry,
    industry: {
      familyId: industry.familyId,
      level1: industry.level1,
      level2: industry.level2,
      confidence: industry.confidence,
      matchedPattern: industry.matchedPattern,
      parameterVersion: valuationConfig.parameterVersion,
      keyMetrics: industry.parameters.keyMetrics
    },
    business,
    financial: {
      reportPeriod: financial.reportPeriod || null,
      revenueCagr3Y: numberOrNull(financial.revenueCagr3Y),
      profitCagr3Y: numberOrNull(financial.profitCagr3Y),
      latestRevenueGrowth: numberOrNull(financial.latestRevenueGrowth),
      latestProfitGrowth: numberOrNull(financial.latestProfitGrowth),
      roe: numberOrNull(financial.roe),
      roeTrend: numberOrNull(financial.roeTrend),
      marginTrend: numberOrNull(financial.marginTrend),
      ocfToProfit: numberOrNull(financial.ocfToProfit),
      debtToAssets: numberOrNull(financial.debtToAssets)
    },
    market: {
      tradeDate: company.tradeDate || null,
      close: numberOrNull(company.close),
      marketCapYi: numberOrNull(company.marketCapYi),
      totalSharesYi: valuation.audit.totalSharesYi,
      pe: numberOrNull(company.peTtm ?? company.pe),
      pb: numberOrNull(company.pb),
      ps: numberOrNull(company.psTtm ?? company.ps)
    },
    valuation,
    dataHealth: stamps,
    conclusion: {
      valid: !conclusionInvalid,
      status: conclusionInvalid ? "研究保留/估值待补" : "估值可用",
      generatedAt: context.calculatedAt || now.toISOString(),
      invalidationReasons: conclusionInvalid ? [...valuation.invalidReasons, marketStamp.stale ? "行情过期" : null, financialStamp.stale ? "财务过期" : null].filter(Boolean) : [],
      invalidationTriggers: ["股价变化超过5%", "财报或业绩预告", "重大订单或资本事项", "业务转型评分变化", "行业参数版本变化", "行业景气度变化", "数据源失败或超过有效期"]
    }
  };
}

function buildCompanyResearchUniverse(snapshot = [], financialByCode = new Map(), evidenceByCode = new Map(), context = {}) {
  const list = snapshot.map(company => buildCompanyResearchSnapshot(company, financialByCode.get(company.code) || {}, evidenceByCode.get(company.code) || {}, context));
  return {
    list,
    byCode: new Map(list.map(item => [item.code, item])),
    summary: {
      total: list.length,
      industryRecognized: list.filter(item => item.industry.confidence !== "low").length,
      valuationValid: list.filter(item => item.valuation.valid).length,
      valuationPending: list.filter(item => !item.valuation.valid).length,
      rankingEligible: list.filter(item => item.valuation.rankingEligible).length,
      invalid: list.filter(item => !item.valuation.valid).length,
      growthUniverse: list.length,
      engineVersion: valuationConfig.parameterVersion
    }
  };
}

export {
  buildBusinessProfile,
  buildCompanyResearchSnapshot,
  buildCompanyResearchUniverse,
  businessTransformationScore,
  detectIndustryFamily,
  qualityAdjustment,
  valuationConfig
};
