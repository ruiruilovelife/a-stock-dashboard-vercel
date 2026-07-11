function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function confidenceLabel(...flags) {
  const score = flags.reduce((sum, value) => sum + (value ? 1 : 0), 0);
  return score >= flags.length ? "高" : score >= Math.ceil(flags.length / 2) ? "中" : "低";
}

function sourceStatus(name, source, date, success, usingCache = false, lastSuccessAt = null) {
  return {
    name,
    source: source || "未配置",
    latestDataAt: date || null,
    lastSuccessAt: lastSuccessAt || (success ? date : null),
    success: Boolean(success),
    usingCache: Boolean(usingCache),
    status: success ? "正常" : usingCache ? "接口失败，使用缓存" : "失败且无有效缓存"
  };
}

function buildSystemDataHealth({ meta, marketRows, financialSummary, announcementCoverage, publicNewsCandidates, globalMarkets, modelAnalysis }) {
  const marketDate = marketRows.find(row => row.tradeDate)?.tradeDate || meta.lastUpdated;
  const announcementsOk = (announcementCoverage || []).some(item => /成功|正常|已覆盖|OK/i.test(`${item.status || ""} ${item.source || ""}`));
  const newsOk = (publicNewsCandidates || []).some(item => item.url && !/失败/.test(item.status || ""));
  const globalOk = (globalMarkets || []).some(item => Number.isFinite(Number(item.close)));
  const sources = [
    sourceStatus("行情与市值", meta.marketSource || meta.dataSource, marketDate, marketRows.length > 0, !marketRows.length),
    sourceStatus("财务数据", financialSummary.source, financialSummary.periods?.[0], financialSummary.covered > 0, financialSummary.covered === 0),
    sourceStatus("公司公告", "巨潮资讯/交易所", meta.lastUpdated, announcementsOk, !announcementsOk),
    sourceStatus("新闻与政策", "公开搜索/财联社等", meta.lastUpdated, newsOk, !newsOk),
    sourceStatus("海外市场", "新浪/公开海外行情", meta.lastUpdated, globalOk, !globalOk),
    sourceStatus("模型分析", modelAnalysis?.model || "规则引擎", meta.lastUpdated, !/失败/.test(modelAnalysis?.status || ""), false)
  ];
  return {
    generatedAt: meta.lastUpdated,
    sources,
    degraded: sources.some(item => !item.success),
    failedSources: sources.filter(item => !item.success).map(item => item.name),
    rule: "任一关键数据源失败时，相关结论标记为缓存或失效，不再冒充最新结论。"
  };
}

function valuationDistance(holding, research) {
  const price = numeric(holding.close);
  const actionEligible = Boolean(research?.valuation?.actionEligible);
  const scenarios = research?.valuation?.scenarios || {};
  const strategic = research?.valuation?.futureScenarios || {};
  const conservative = actionEligible ? numeric(scenarios.conservative?.targetPrice) : null;
  const neutral = actionEligible ? numeric(scenarios.neutral?.targetPrice) : null;
  const optimistic = actionEligible ? numeric(scenarios.optimistic?.targetPrice) : null;
  const pctTo = target => price && target ? Number((((target - price) / price) * 100).toFixed(1)) : null;
  return {
    currentPrice: price,
    conservativeTargetPrice: conservative,
    neutralTargetPrice: neutral,
    optimisticTargetPrice: optimistic,
    strategicNeutralTargetPrice: actionEligible ? numeric(strategic.neutral?.targetPrice) : null,
    strategicOptimisticTargetPrice: actionEligible ? numeric(strategic.optimistic?.targetPrice) : null,
    actionEligible,
    note: actionEligible ? "未来盈利基数已确认" : research?.valuation?.actionInvalidReason || "未来盈利基数待确认",
    toConservativePct: pctTo(conservative),
    toNeutralPct: pctTo(neutral),
    toOptimisticPct: pctTo(optimistic)
  };
}

function actionForHolding(holding, research, hardEvents = []) {
  const distance = valuationDistance(holding, research);
  const pct = numeric(holding.pct) || 0;
  const weight = numeric(String(holding.weight || "").replace("%", "")) || 0;
  const event = hardEvents.find(item => item.code === holding.code);
  const valuationValid = Boolean(research?.valuation?.valid);
  const valuationActionEligible = Boolean(research?.valuation?.actionEligible);
  let action = "继续持有";
  let priority = "P3";
  const reasons = [];
  const addTriggers = [];
  const reduceTriggers = [];

  if (!research) {
    action = "等待财报";
    priority = "P1";
    reasons.push("统一公司研究快照缺失");
  } else if (!valuationValid) {
    action = "暂不操作";
    priority = "P1";
    reasons.push(...research.valuation.invalidReasons);
  } else if (!valuationActionEligible) {
    action = weight >= 30 ? "控制集中度" : "等待盈利预测";
    priority = weight >= 30 ? "P1" : "P2";
    reasons.push(research.valuation.actionInvalidReason || "未来盈利基数尚未独立确认，不用情景目标价指导买卖");
  } else if (distance.optimisticTargetPrice && distance.currentPrice >= distance.optimisticTargetPrice) {
    action = "减仓";
    priority = "P0";
    reasons.push("股价进入统一估值引擎的乐观区间");
  } else if (pct <= -5) {
    action = "减仓";
    priority = "P0";
    reasons.push("单日跌幅触发高波动风控");
  } else if (weight >= 30) {
    action = "持有观察";
    priority = "P1";
    reasons.push("单一持仓集中度偏高");
  } else if (distance.neutralTargetPrice && distance.toNeutralPct >= 25) {
    action = "等待技术确认";
    priority = "P2";
    reasons.push("基本面存在空间，但仍需价格和板块趋势确认");
  } else if (distance.neutralTargetPrice && distance.toNeutralPct < -5) {
    action = "减仓";
    priority = "P1";
    reasons.push("股价高于中性合理估值");
  } else {
    reasons.push("当前价格未明显偏离中性估值，等待新信息");
  }

  if (event) {
    reasons.push(`最新硬事件：${event.title}`);
    if (/财报|业绩|预告/.test(event.type || event.title || "") && !event.facts?.length) action = "等待财报";
  }
  addTriggers.push("回踩20日均线或关键支撑且缩量", "板块趋势继续增强", "财报、订单或新业务兑现超预期", "统一估值仍有安全边际");
  reduceTriggers.push("跌破关键支撑并放量", "行业景气或资金趋势转弱", "财报低于预期", "新业务兑现不及预期", "进入乐观估值区间", "持仓集中度继续升高");
  return {
    code: holding.code,
    name: holding.name,
    action,
    priority,
    reasons,
    valuationDistance: distance,
    valuationMethod: research?.valuation?.method || null,
    valuationConfidence: research?.valuation?.confidence || "低",
    technicalTrend: pct > 2 ? "短线增强，仍需周线确认" : pct < -2 ? "短线转弱" : "震荡待确认",
    volumeChange: holding.amount || "待确认",
    sectorTrend: research?.industry?.level2 || holding.theme || "待确认",
    latestEvent: event || null,
    capitalStatus: pct > 0 ? "当日有承接，持续性待确认" : "当日承压，等待资金修复",
    businessRealization: research?.business?.commercializationStage || "待核验",
    portfolioRole: weight >= 25 ? "组合核心仓" : weight >= 10 ? "重要配置仓" : "观察/弹性仓",
    addTriggers,
    reduceTriggers,
    validFor: "1-5个交易日或直至关键数据变化",
    generatedAt: research?.conclusion?.generatedAt || null,
    confidence: confidenceLabel(valuationValid && valuationActionEligible, Boolean(event), Boolean(research?.dataHealth?.market && !research.dataHealth.market.stale))
  };
}

function buildPortfolioAdvice(holdings = [], researchByCode = new Map(), hardEvents = []) {
  const items = holdings.map(holding => actionForHolding(holding, researchByCode.get(holding.code), hardEvents));
  const weightsByFamily = new Map();
  for (const holding of holdings) {
    const family = researchByCode.get(holding.code)?.industry?.level1 || "未分类";
    const weight = numeric(String(holding.weight || "").replace("%", "")) || 0;
    weightsByFamily.set(family, (weightsByFamily.get(family) || 0) + weight);
  }
  const concentration = [...weightsByFamily.entries()].sort((a, b) => b[1] - a[1]);
  const reduce = items.filter(item => item.action === "减仓").sort((a, b) => a.priority.localeCompare(b.priority));
  const add = items.filter(item => /加仓|技术确认/.test(item.action));
  return {
    generatedAt: items[0]?.generatedAt || null,
    items,
    portfolio: {
      industryConcentration: concentration.map(([industry, weight]) => ({ industry, weight: Number(weight.toFixed(2)) })),
      concentrationRisk: concentration[0]?.[1] >= 50 ? "高" : concentration[0]?.[1] >= 35 ? "中" : "低",
      sharedRisk: concentration[0]?.[1] >= 50 ? `组合对${concentration[0][0]}共同风险暴露过高` : "未发现单一一级行业超过50%",
      preferredAdd: add[0]?.name || "暂无，等待技术或财报确认",
      preferredReduce: reduce[0]?.name || "暂无强制减仓项",
      fundingSource: reduce[0]?.name || "现金",
      rule: "动作由最新持仓、统一估值、行情、公告和集中度共同生成。"
    }
  };
}

function normalizedEventKey(event) {
  const title = String(event.title || event.event || "").replace(/[\s，。；：、【】()（）]/g, "").replace(/关于|公告|公司/g, "");
  return `${event.code || event.market || "GLOBAL"}-${String(event.date || event.firstSeenAt || "").slice(0, 10)}-${title.slice(0, 30)}`;
}

function eventCategory(text) {
  if (/业绩|财报|年报|季报|预告|快报/.test(text)) return "公司基本面";
  if (/订单|合同|中标/.test(text)) return "订单";
  if (/减持|问询|处罚|诉讼|监管|风险/.test(text)) return "风险事件";
  if (/政策|规划|意见|办法/.test(text)) return "政策";
  if (/价格|涨价|降价/.test(text)) return "产品价格";
  if (/技术|突破|研发|产品/.test(text)) return "技术突破";
  return "产业趋势";
}

function buildUnifiedEvents(hardEvents = [], publicNews = []) {
  const combined = [
    ...hardEvents.map(item => ({ ...item, source: item.source || "巨潮资讯/交易所", credibility: "高", firstSeenAt: item.date, latestProgress: item.facts?.join("；") || item.analystRead || "待解读" })),
    ...publicNews.map(item => ({ ...item, source: item.source || "公开搜索", credibility: item.url ? "中" : "低", firstSeenAt: item.date || null, latestProgress: item.snippet || "待核验" }))
  ];
  const byKey = new Map();
  for (const item of combined) {
    const key = normalizedEventKey(item);
    const existing = byKey.get(key);
    if (!existing || (item.credibility === "高" && existing.credibility !== "高")) byKey.set(key, item);
  }
  return [...byKey.values()].map(item => {
    const text = `${item.title || ""} ${item.snippet || ""}`;
    const category = eventCategory(text);
    const negative = /减持|处罚|诉讼|亏损|下滑|风险|问询/.test(text);
    return {
      eventId: normalizedEventKey(item),
      code: item.code || null,
      company: item.name || null,
      title: item.title || "待核验事件",
      category,
      firstSeenAt: item.firstSeenAt || null,
      latestProgress: item.latestProgress,
      source: item.source,
      importance: item.importance || (item.priority === "P0" ? "高" : "中"),
      credibility: item.credibility,
      direction: negative ? "利空" : "待验证/可能利好",
      shortTermImpact: negative ? "可能压制风险偏好和股价" : "需要成交与公告硬数据确认",
      mediumTermImpact: "根据收入、利润、订单或估值逻辑是否改变决定",
      affectedIndustries: item.bucket || item.type || "待映射",
      affectedCompanies: item.name || "待映射",
      transmissionPath: "事件→业务/盈利预期→行业估值或风险偏好→股价",
      pricedIn: "待结合事件前后涨幅和成交判断",
      adjustEarnings: /业绩|订单|价格/.test(text),
      adjustValuationLogic: /并购|转型|新业务|资产注入/.test(text),
      adjustModelScore: true,
      validFor: category === "政策" ? "1-3个月" : category === "公司基本面" ? "至下一份财报" : "1-10个交易日",
      invalidationCondition: "事件被澄清、订单取消、财报未兑现或市场已充分定价"
    };
  });
}

function buildChiefDecision({ marketRegime, indices, internals, portfolioAdvice, events, dataHealth, guidanceTarget, candidates = [], valueIdeas = [], fiveXIdeas = [], modelAnalysis = {} }) {
  const importantEvents = events
    .filter(item => item.importance === "高")
    .filter(item => !/低|待验证/.test(String(item.credibility || "")))
    .filter(item => !/未筛出可靠|抓取失败|查询失败|待核验/.test(String(item.title || "")))
    .slice(0, 2);
  const conclusions = [
    {
      result: marketRegime?.regime || "市场阶段待确认",
      basis: marketRegime?.summary || internals?.read || "数据不足",
      aShareImpact: marketRegime?.positionGuide || "控制仓位，等待确认",
      industries: (internals?.activeIndustries || []).slice(0, 3).map(item => item.industry).join("、") || "待确认",
      portfolioMeaning: portfolioAdvice.portfolio.sharedRisk,
      validFor: guidanceTarget || "下一阶段",
      invalidationCondition: "指数趋势、市场宽度或海外风险信号显著反转",
      confidence: confidenceLabel(Boolean(marketRegime?.regime), Boolean(internals?.sampleSize), !dataHealth.degraded)
    },
    ...importantEvents.map(event => ({
      result: event.title,
      basis: `${event.source}；可信度${event.credibility}`,
      aShareImpact: event.shortTermImpact,
      industries: event.affectedIndustries,
      portfolioMeaning: event.company ? `重点核验${event.company}的动作是否需要调整` : "检查持仓产业映射",
      validFor: event.validFor,
      invalidationCondition: event.invalidationCondition,
      confidence: event.credibility
    }))
  ].slice(0, 5);
  const topIndustries = (internals?.activeIndustries || []).slice(0, 3);
  const topElasticity = candidates.find(item => Number(item.elasticityScore ?? item.score) >= 70 && item.valuationValid !== false);
  const topValue = valueIdeas.find(item => Number(item.compositeScore) >= 70 && item.valuationValid !== false && Number(item.upsideMultiple) > 1);
  const topFiveX = fiveXIdeas.find(item => Number(item.fiveXPotentialIndex) >= 70);
  const recommendations = [
    {
      type: "市场与仓位",
      recommendation: marketRegime?.positionGuide || "数据不足时降低仓位和交易频率",
      why: `${marketRegime?.summary || internals?.read || "市场结构待确认"}；全A宽度：${internals?.read || "待确认"}`,
      trigger: "指数趋势、全A宽度和主线成交至少两项同步改善才提高仓位",
      action: marketRegime?.score >= 3 ? "分批提高主线仓位，不追连续加速" : marketRegime?.score <= -3 ? "优先降低高波动和弱趋势仓位" : "保持均衡，等待主线确认",
      risk: "指数被少数权重拉动、板块宽度不扩散或海外风险反转",
      validFor: guidanceTarget || "下一阶段",
      confidence: confidenceLabel(Boolean(marketRegime?.regime), Boolean(internals?.sampleSize), !dataHealth.degraded)
    },
    ...(topIndustries.length ? [{
      type: "行业优先级",
      recommendation: `优先研究${topIndustries.map(item => item.industry).join("、")}`,
      why: topIndustries.map(item => `${item.industry}：平均涨跌${item.avgPct ?? "-"}%、上涨占比${item.upRatio ?? "-"}%、成交占比${item.amountShare ?? "-"}%`).join("；"),
      trigger: "行业连续两日强于全A、成交占比抬升且龙头不冲高回落",
      action: "先研究产业和财报兑现，再从爬坡/主升初期公司中选择",
      risk: "可能只是一日脉冲；若成交占比和上涨家数次日回落则降级",
      validFor: "1-5个交易日",
      confidence: "中"
    }] : []),
    {
      type: "持仓处理",
      recommendation: `优先加仓：${portfolioAdvice.portfolio.preferredAdd}；优先减仓：${portfolioAdvice.portfolio.preferredReduce}`,
      why: `${portfolioAdvice.portfolio.sharedRisk}；组合集中度风险${portfolioAdvice.portfolio.concentrationRisk}`,
      trigger: "只按每只持仓页面列出的财报、估值和技术触发条件执行",
      action: `需要资金时优先从${portfolioAdvice.portfolio.fundingSource}调配`,
      risk: "同产业集中暴露、财报不及预期或股价进入乐观估值区",
      validFor: "1-5个交易日或直至持仓变化",
      confidence: portfolioAdvice.items.every(item => item.confidence !== "低") ? "中" : "低"
    },
    ...(topElasticity ? [{
      type: "主升启动观察",
      recommendation: `${topElasticity.name}（${topElasticity.code}）仅在触发后进入验证`,
      why: `强弹性${topElasticity.elasticityScore ?? topElasticity.score}分；${topElasticity.selectionReason || topElasticity.industryCatalyst || "趋势、资金和产业共同评分"}`,
      trigger: topElasticity.buyPoint || "平台突破或首次缩量回踩不破",
      action: "触发前只观察，触发后小仓验证，不追连续大阳",
      risk: topElasticity.risk || "资金短炒或业绩无法兑现",
      validFor: "1-3个月模型，买点按1-5日验证",
      confidence: "中"
    }] : []),
    ...(topValue ? [{
      type: "成长价值观察",
      recommendation: `${topValue.name}（${topValue.code}）进入基本面复核`,
      why: `综合${topValue.compositeScore}分；产业${topValue.industryScore ?? "-"}、成长${topValue.growthScore ?? "-"}、统一成长空间${topValue.upsideMultiple ?? "-"}倍`,
      trigger: topValue.catalyst || topValue.keyCheck || "下一份财报确认增长和现金流",
      action: "财报、行业景气和估值三项确认后再决定买点",
      risk: topValue.maximumRisk || topValue.risk || "价值陷阱或成长不及预期",
      validFor: "1个季度",
      confidence: "中"
    }] : []),
    ...(topFiveX ? [{
      type: "长期成长研究",
      recommendation: `${topFiveX.name}（${topFiveX.code}）作为五倍股长期研究样本`,
      why: topFiveX.coreLogic,
      trigger: topFiveX.futureCatalysts,
      action: "不以长期空间替代短期买点，按财报逐季验证",
      risk: topFiveX.risk,
      validFor: "1-3年，季度复核",
      confidence: "中"
    }] : []),
    ...(modelAnalysis?.finalCommand ? [{
      type: "深度模型复核",
      recommendation: modelAnalysis.finalCommand,
      why: modelAnalysis.summary || "深度模型结合行情、事件和组合约束复核",
      trigger: "硬数据与规则引擎结论一致",
      action: "仅作为交叉验证，不覆盖公告和财务硬事实",
      risk: "模型结论可能受新闻覆盖和数据时效限制",
      validFor: guidanceTarget || "下一阶段",
      confidence: /失败|降级/.test(modelAnalysis.status || "") ? "低" : "中"
    }] : [])
  ].slice(0, 6);
  return {
    generatedAt: dataHealth.generatedAt,
    marketStage: {
      regime: marketRegime?.regime || "待确认",
      phase: marketRegime?.regime?.includes("牛") ? "启动/结构分化" : marketRegime?.regime?.includes("熊") ? "退潮/风险期" : "震荡分化期",
      indices: indices.map(item => ({ name: item.name, close: item.close, pct: item.pct, trend: item.trend })),
      riskPreference: marketRegime?.score >= 3 ? "进攻" : marketRegime?.score <= -3 ? "防守" : "均衡",
      positionRange: marketRegime?.score >= 3 ? "60%-85%" : marketRegime?.score <= -3 ? "20%-50%" : "40%-70%",
      basis: marketRegime?.summary || "等待数据"
    },
    coreConclusions: conclusions,
    recommendations,
    holdingActionSummary: portfolioAdvice.items.map(item => ({ name: item.name, action: item.action, priority: item.priority, reason: item.reasons[0], confidence: item.confidence })),
    watchList: [
      "上证、创业板、科创50、沪深300和中证1000趋势是否共振",
      "持仓财报、业绩预告、重大合同、减持和监管公告",
      "行业资金是持续迁移还是一日脉冲",
      "海外科技、利率、汇率和大宗商品的A股传导",
      "统一估值、业务转型评分或行业参数是否触发重算"
    ],
    dataHealth
  };
}

function buildFundingStructure(internals = {}, indices = []) {
  const available = Boolean(internals.sampleSize);
  return {
    generatedAt: null,
    marketBreadth: {
      upCount: internals.upCount ?? null,
      downCount: internals.downCount ?? null,
      limitUp: internals.limitUp ?? null,
      limitDown: internals.limitDown ?? null,
      medianPct: internals.medianPct ?? null,
      strongCount: internals.strongCount ?? null,
      weakCount: internals.weakCount ?? null,
      read: internals.read || "待确认"
    },
    industryFlow: internals.activeIndustries || [],
    indexStyle: indices.map(item => ({ name: item.name, pct: item.pct, trend: item.trend?.status || "待确认" })),
    emotionCycle: !available ? "数据不足" : internals.emotion === "赚钱效应扩散" ? "发酵" : internals.emotion === "弱势防守" ? "退潮" : "分化",
    emotionBasis: internals.read || "缺少全A数据",
    unavailableMetrics: ["主动买入/卖出强度", "ETF申购赎回", "融资余额变化", "大单净流入", "涨停晋级率", "炸板率", "连板高度"],
    unavailableReason: "现有公开行情接口未稳定提供，页面必须显示待接入，不使用推测值。",
    migrationMatrix: (internals.activeIndustries || []).slice(0, 12).map(item => ({
      industry: item.industry,
      capitalStrength: item.amountShare ?? null,
      priceTrend: item.avgPct > 0 ? "增强" : "承压",
      earningsExpectation: "待财报和一致预期数据",
      valuationPosition: "读取统一估值引擎行业分布",
      crowding: item.amountShare >= 8 ? "偏拥挤" : "正常",
      catalystStrength: "待事件层确认",
      migrationType: item.upRatio >= 60 && item.avgPct > 0 ? "中期资金迁移候选" : item.avgPct > 0 ? "短期事件驱动/反弹" : "资金流出或防御切换"
    }))
  };
}

function buildGlobalTransmission(globalMarkets = [], signals = []) {
  const quoteFor = source => {
    const names = source.includes("美股") || source.includes("费半")
      ? ["半导体ETF", "纳斯达克100", "纳斯达克"]
      : source.includes("韩国")
        ? ["韩国KOSPI"]
        : source.includes("日经")
          ? ["日经225"]
          : source.includes("港股")
            ? ["恒生指数"]
            : [];
    return names.map(name => globalMarkets.find(item => item.name === name)).filter(Boolean);
  };
  return signals.map(signal => ({
    event: (() => {
      const quotes = quoteFor(signal.source);
      return quotes.length
        ? `${signal.source}日度信号：${quotes.map(item => `${item.name}${Number.isFinite(Number(item.pct)) ? `${Number(item.pct).toFixed(2)}%` : "涨跌待确认"}`).join("，")}`
        : `${signal.source}日度数据未接入，固定观察项不作为当天结论`;
    })(),
    market: signal.source,
    affectedGlobalChain: signal.watch,
    productOrderCapexPath: "海外价格/订单/资本开支变化→A股相关产业盈利预期",
    affectedAIndustry: signal.aShareMap,
    directBeneficiaries: "需按真实业务收入和客户敞口筛选",
    indirectBeneficiaries: signal.aShareMap,
    potentialLosers: "与海外信号反向暴露或估值过高的公司",
    realExposure: "读取统一业务结构；纯概念映射不计入基本面评分",
    impactStrength: (() => {
      const moves = quoteFor(signal.source).map(item => Math.abs(Number(item.pct))).filter(Number.isFinite);
      const maxMove = moves.length ? Math.max(...moves) : null;
      return maxMove === null ? "待确认" : maxMove >= 3 ? "高" : maxMove >= 1 ? "中" : "低";
    })(),
    impactCycle: "1周至1季度",
    pricedIn: "当日海外变化只作为先验，需结合A股同产业相对强弱和成交验证",
    source: globalMarkets.find(item => signal.source.includes(item.name))?.name || signal.source,
    updatedAt: quoteFor(signal.source).map(item => item.time).filter(Boolean)[0] || null,
    confidence: quoteFor(signal.source).length ? "中" : "低",
    dailyVerified: quoteFor(signal.source).length > 0,
    dailyQuotes: quoteFor(signal.source).map(item => ({ name: item.name, close: item.close, pct: item.pct, time: item.time })),
    action: signal.action
  }));
}

export {
  buildChiefDecision,
  buildFundingStructure,
  buildGlobalTransmission,
  buildPortfolioAdvice,
  buildSystemDataHealth,
  buildUnifiedEvents
};
function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function confidenceLabel(...flags) {
  const score = flags.reduce((sum, value) => sum + (value ? 1 : 0), 0);
  return score >= flags.length ? "高" : score >= Math.ceil(flags.length / 2) ? "中" : "低";
}

function sourceStatus(name, source, date, success, usingCache = false, lastSuccessAt = null) {
  return {
    name,
    source: source || "未配置",
    latestDataAt: date || null,
    lastSuccessAt: lastSuccessAt || (success ? date : null),
    success: Boolean(success),
    usingCache: Boolean(usingCache),
    status: success ? "正常" : usingCache ? "接口失败，使用缓存" : "失败且无有效缓存"
  };
}

function buildSystemDataHealth({ meta, marketRows, financialSummary, announcementCoverage, publicNewsCandidates, globalMarkets, modelAnalysis }) {
  const marketDate = marketRows.find(row => row.tradeDate)?.tradeDate || meta.lastUpdated;
  const announcementsOk = (announcementCoverage || []).some(item => /成功|正常|已覆盖|OK/i.test(`${item.status || ""} ${item.source || ""}`));
  const newsOk = (publicNewsCandidates || []).some(item => item.url && !/失败/.test(item.status || ""));
  const globalOk = (globalMarkets || []).some(item => Number.isFinite(Number(item.close)));
  const sources = [
    sourceStatus("行情与市值", meta.marketSource || meta.dataSource, marketDate, marketRows.length > 0, !marketRows.length),
    sourceStatus("财务数据", financialSummary.source, financialSummary.periods?.[0], financialSummary.covered > 0, financialSummary.covered === 0),
    sourceStatus("公司公告", "巨潮资讯/交易所", meta.lastUpdated, announcementsOk, !announcementsOk),
    sourceStatus("新闻与政策", "公开搜索/财联社等", meta.lastUpdated, newsOk, !newsOk),
    sourceStatus("海外市场", "新浪/公开海外行情", meta.lastUpdated, globalOk, !globalOk),
    sourceStatus("模型分析", modelAnalysis?.model || "规则引擎", meta.lastUpdated, !/失败/.test(modelAnalysis?.status || ""), false)
  ];
  return {
    generatedAt: meta.lastUpdated,
    sources,
    degraded: sources.some(item => !item.success),
    failedSources: sources.filter(item => !item.success).map(item => item.name),
    rule: "任一关键数据源失败时，相关结论标记为缓存或失效，不再冒充最新结论。"
  };
}

function valuationDistance(holding, research) {
  const price = numeric(holding.close);
  const actionEligible = Boolean(research?.valuation?.actionEligible);
  const scenarios = research?.valuation?.scenarios || {};
  const strategic = research?.valuation?.futureScenarios || {};
  const conservative = actionEligible ? numeric(scenarios.conservative?.targetPrice) : null;
  const neutral = actionEligible ? numeric(scenarios.neutral?.targetPrice) : null;
  const optimistic = actionEligible ? numeric(scenarios.optimistic?.targetPrice) : null;
  const pctTo = target => price && target ? Number((((target - price) / price) * 100).toFixed(1)) : null;
  return {
    currentPrice: price,
    conservativeTargetPrice: conservative,
    neutralTargetPrice: neutral,
    optimisticTargetPrice: optimistic,
    strategicNeutralTargetPrice: actionEligible ? numeric(strategic.neutral?.targetPrice) : null,
    strategicOptimisticTargetPrice: actionEligible ? numeric(strategic.optimistic?.targetPrice) : null,
    actionEligible,
    note: actionEligible ? "未来盈利基数已确认" : research?.valuation?.actionInvalidReason || "未来盈利基数待确认",
    toConservativePct: pctTo(conservative),
    toNeutralPct: pctTo(neutral),
    toOptimisticPct: pctTo(optimistic)
  };
}

function actionForHolding(holding, research, hardEvents = []) {
  const distance = valuationDistance(holding, research);
  const pct = numeric(holding.pct) || 0;
  const weight = numeric(String(holding.weight || "").replace("%", "")) || 0;
  const event = hardEvents.find(item => item.code === holding.code);
  const valuationValid = Boolean(research?.valuation?.valid);
  const valuationActionEligible = Boolean(research?.valuation?.actionEligible);
  let action = "继续持有";
  let priority = "P3";
  const reasons = [];
  const addTriggers = [];
  const reduceTriggers = [];

  if (!research) {
    action = "等待财报";
    priority = "P1";
    reasons.push("统一公司研究快照缺失");
  } else if (!valuationValid) {
    action = "暂不操作";
    priority = "P1";
    reasons.push(...research.valuation.invalidReasons);
  } else if (!valuationActionEligible) {
    action = weight >= 30 ? "控制集中度" : "等待盈利预测";
    priority = weight >= 30 ? "P1" : "P2";
    reasons.push(research.valuation.actionInvalidReason || "未来盈利基数尚未独立确认，不用情景目标价指导买卖");
  } else if (distance.optimisticTargetPrice && distance.currentPrice >= distance.optimisticTargetPrice) {
    action = "减仓";
    priority = "P0";
    reasons.push("股价进入统一估值引擎的乐观区间");
  } else if (pct <= -5) {
    action = "减仓";
    priority = "P0";
    reasons.push("单日跌幅触发高波动风控");
  } else if (weight >= 30) {
    action = "持有观察";
    priority = "P1";
    reasons.push("单一持仓集中度偏高");
  } else if (distance.neutralTargetPrice && distance.toNeutralPct >= 25) {
    action = "等待技术确认";
    priority = "P2";
    reasons.push("基本面存在空间，但仍需价格和板块趋势确认");
  } else if (distance.neutralTargetPrice && distance.toNeutralPct < -5) {
    action = "减仓";
    priority = "P1";
    reasons.push("股价高于中性合理估值");
  } else {
    reasons.push("当前价格未明显偏离中性估值，等待新信息");
  }

  if (event) {
    reasons.push(`最新硬事件：${event.title}`);
    if (/财报|业绩|预告/.test(event.type || event.title || "") && !event.facts?.length) action = "等待财报";
  }
  addTriggers.push("回踩20日均线或关键支撑且缩量", "板块趋势继续增强", "财报、订单或新业务兑现超预期", "统一估值仍有安全边际");
  reduceTriggers.push("跌破关键支撑并放量", "行业景气或资金趋势转弱", "财报低于预期", "新业务兑现不及预期", "进入乐观估值区间", "持仓集中度继续升高");
  return {
    code: holding.code,
    name: holding.name,
    action,
    priority,
    reasons,
    valuationDistance: distance,
    valuationMethod: research?.valuation?.method || null,
    valuationConfidence: research?.valuation?.confidence || "低",
    technicalTrend: pct > 2 ? "短线增强，仍需周线确认" : pct < -2 ? "短线转弱" : "震荡待确认",
    volumeChange: holding.amount || "待确认",
    sectorTrend: research?.industry?.level2 || holding.theme || "待确认",
    latestEvent: event || null,
    capitalStatus: pct > 0 ? "当日有承接，持续性待确认" : "当日承压，等待资金修复",
    businessRealization: research?.business?.commercializationStage || "待核验",
    portfolioRole: weight >= 25 ? "组合核心仓" : weight >= 10 ? "重要配置仓" : "观察/弹性仓",
    addTriggers,
    reduceTriggers,
    validFor: "1-5个交易日或直至关键数据变化",
    generatedAt: research?.conclusion?.generatedAt || null,
    confidence: confidenceLabel(valuationValid && valuationActionEligible, Boolean(event), Boolean(research?.dataHealth?.market && !research.dataHealth.market.stale))
  };
}

function buildPortfolioAdvice(holdings = [], researchByCode = new Map(), hardEvents = []) {
  const items = holdings.map(holding => actionForHolding(holding, researchByCode.get(holding.code), hardEvents));
  const weightsByFamily = new Map();
  for (const holding of holdings) {
    const family = researchByCode.get(holding.code)?.industry?.level1 || "未分类";
    const weight = numeric(String(holding.weight || "").replace("%", "")) || 0;
    weightsByFamily.set(family, (weightsByFamily.get(family) || 0) + weight);
  }
  const concentration = [...weightsByFamily.entries()].sort((a, b) => b[1] - a[1]);
  const reduce = items.filter(item => item.action === "减仓").sort((a, b) => a.priority.localeCompare(b.priority));
  const add = items.filter(item => /加仓|技术确认/.test(item.action));
  return {
    generatedAt: items[0]?.generatedAt || null,
    items,
    portfolio: {
      industryConcentration: concentration.map(([industry, weight]) => ({ industry, weight: Number(weight.toFixed(2)) })),
      concentrationRisk: concentration[0]?.[1] >= 50 ? "高" : concentration[0]?.[1] >= 35 ? "中" : "低",
      sharedRisk: concentration[0]?.[1] >= 50 ? `组合对${concentration[0][0]}共同风险暴露过高` : "未发现单一一级行业超过50%",
      preferredAdd: add[0]?.name || "暂无，等待技术或财报确认",
      preferredReduce: reduce[0]?.name || "暂无强制减仓项",
      fundingSource: reduce[0]?.name || "现金",
      rule: "动作由最新持仓、统一估值、行情、公告和集中度共同生成。"
    }
  };
}

function normalizedEventKey(event) {
  const title = String(event.title || event.event || "").replace(/[\s，。；：、【】()（）]/g, "").replace(/关于|公告|公司/g, "");
  return `${event.code || event.market || "GLOBAL"}-${String(event.date || event.firstSeenAt || "").slice(0, 10)}-${title.slice(0, 30)}`;
}

function eventCategory(text) {
  if (/业绩|财报|年报|季报|预告|快报/.test(text)) return "公司基本面";
  if (/订单|合同|中标/.test(text)) return "订单";
  if (/减持|问询|处罚|诉讼|监管|风险/.test(text)) return "风险事件";
  if (/政策|规划|意见|办法/.test(text)) return "政策";
  if (/价格|涨价|降价/.test(text)) return "产品价格";
  if (/技术|突破|研发|产品/.test(text)) return "技术突破";
  return "产业趋势";
}

function buildUnifiedEvents(hardEvents = [], publicNews = []) {
  const combined = [
    ...hardEvents.map(item => ({ ...item, source: item.source || "巨潮资讯/交易所", credibility: "高", firstSeenAt: item.date, latestProgress: item.facts?.join("；") || item.analystRead || "待解读" })),
    ...publicNews.map(item => ({ ...item, source: item.source || "公开搜索", credibility: item.url ? "中" : "低", firstSeenAt: item.date || null, latestProgress: item.snippet || "待核验" }))
  ];
  const byKey = new Map();
  for (const item of combined) {
    const key = normalizedEventKey(item);
    const existing = byKey.get(key);
    if (!existing || (item.credibility === "高" && existing.credibility !== "高")) byKey.set(key, item);
  }
  return [...byKey.values()].map(item => {
    const text = `${item.title || ""} ${item.snippet || ""}`;
    const category = eventCategory(text);
    const negative = /减持|处罚|诉讼|亏损|下滑|风险|问询/.test(text);
    return {
      eventId: normalizedEventKey(item),
      code: item.code || null,
      company: item.name || null,
      title: item.title || "待核验事件",
      category,
      firstSeenAt: item.firstSeenAt || null,
      latestProgress: item.latestProgress,
      source: item.source,
      importance: item.importance || (item.priority === "P0" ? "高" : "中"),
      credibility: item.credibility,
      direction: negative ? "利空" : "待验证/可能利好",
      shortTermImpact: negative ? "可能压制风险偏好和股价" : "需要成交与公告硬数据确认",
      mediumTermImpact: "根据收入、利润、订单或估值逻辑是否改变决定",
      affectedIndustries: item.bucket || item.type || "待映射",
      affectedCompanies: item.name || "待映射",
      transmissionPath: "事件→业务/盈利预期→行业估值或风险偏好→股价",
      pricedIn: "待结合事件前后涨幅和成交判断",
      adjustEarnings: /业绩|订单|价格/.test(text),
      adjustValuationLogic: /并购|转型|新业务|资产注入/.test(text),
      adjustModelScore: true,
      validFor: category === "政策" ? "1-3个月" : category === "公司基本面" ? "至下一份财报" : "1-10个交易日",
      invalidationCondition: "事件被澄清、订单取消、财报未兑现或市场已充分定价"
    };
  });
}

function buildChiefDecision({ marketRegime, indices, internals, portfolioAdvice, events, dataHealth, guidanceTarget, candidates = [], valueIdeas = [], fiveXIdeas = [], modelAnalysis = {} }) {
  const importantEvents = events.filter(item => item.importance === "高").slice(0, 2);
  const conclusions = [
    {
      result: marketRegime?.regime || "市场阶段待确认",
      basis: marketRegime?.summary || internals?.read || "数据不足",
      aShareImpact: marketRegime?.positionGuide || "控制仓位，等待确认",
      industries: (internals?.activeIndustries || []).slice(0, 3).map(item => item.industry).join("、") || "待确认",
      portfolioMeaning: portfolioAdvice.portfolio.sharedRisk,
      validFor: guidanceTarget || "下一阶段",
      invalidationCondition: "指数趋势、市场宽度或海外风险信号显著反转",
      confidence: confidenceLabel(Boolean(marketRegime?.regime), Boolean(internals?.sampleSize), !dataHealth.degraded)
    },
    ...importantEvents.map(event => ({
      result: event.title,
      basis: `${event.source}；可信度${event.credibility}`,
      aShareImpact: event.shortTermImpact,
      industries: event.affectedIndustries,
      portfolioMeaning: event.company ? `重点核验${event.company}的动作是否需要调整` : "检查持仓产业映射",
      validFor: event.validFor,
      invalidationCondition: event.invalidationCondition,
      confidence: event.credibility
    }))
  ].slice(0, 5);
  const topIndustries = (internals?.activeIndustries || []).slice(0, 3);
  const topElasticity = candidates.find(item => Number(item.elasticityScore ?? item.score) >= 70 && item.valuationValid !== false);
  const topValue = valueIdeas.find(item => Number(item.compositeScore) >= 70 && item.valuationValid !== false && Number(item.upsideMultiple) > 1);
  const topFiveX = fiveXIdeas.find(item => Number(item.fiveXPotentialIndex) >= 85);
  const recommendations = [
    {
      type: "市场与仓位",
      recommendation: marketRegime?.positionGuide || "数据不足时降低仓位和交易频率",
      why: `${marketRegime?.summary || internals?.read || "市场结构待确认"}；全A宽度：${internals?.read || "待确认"}`,
      trigger: "指数趋势、全A宽度和主线成交至少两项同步改善才提高仓位",
      action: marketRegime?.score >= 3 ? "分批提高主线仓位，不追连续加速" : marketRegime?.score <= -3 ? "优先降低高波动和弱趋势仓位" : "保持均衡，等待主线确认",
      risk: "指数被少数权重拉动、板块宽度不扩散或海外风险反转",
      validFor: guidanceTarget || "下一阶段",
      confidence: confidenceLabel(Boolean(marketRegime?.regime), Boolean(internals?.sampleSize), !dataHealth.degraded)
    },
    ...(topIndustries.length ? [{
      type: "行业优先级",
      recommendation: `优先研究${topIndustries.map(item => item.industry).join("、")}`,
      why: topIndustries.map(item => `${item.industry}：平均涨跌${item.avgPct ?? "-"}%、上涨占比${item.upRatio ?? "-"}%、成交占比${item.amountShare ?? "-"}%`).join("；"),
      trigger: "行业连续两日强于全A、成交占比抬升且龙头不冲高回落",
      action: "先研究产业和财报兑现，再从爬坡/主升初期公司中选择",
      risk: "可能只是一日脉冲；若成交占比和上涨家数次日回落则降级",
      validFor: "1-5个交易日",
      confidence: "中"
    }] : []),
    {
      type: "持仓处理",
      recommendation: `优先加仓：${portfolioAdvice.portfolio.preferredAdd}；优先减仓：${portfolioAdvice.portfolio.preferredReduce}`,
      why: `${portfolioAdvice.portfolio.sharedRisk}；组合集中度风险${portfolioAdvice.portfolio.concentrationRisk}`,
      trigger: "只按每只持仓页面列出的财报、估值和技术触发条件执行",
      action: `需要资金时优先从${portfolioAdvice.portfolio.fundingSource}调配`,
      risk: "同产业集中暴露、财报不及预期或股价进入乐观估值区",
      validFor: "1-5个交易日或直至持仓变化",
      confidence: portfolioAdvice.items.every(item => item.confidence !== "低") ? "中" : "低"
    },
    ...(topElasticity ? [{
      type: "主升启动观察",
      recommendation: `${topElasticity.name}（${topElasticity.code}）仅在触发后进入验证`,
      why: `强弹性${topElasticity.elasticityScore ?? topElasticity.score}分；${topElasticity.selectionReason || topElasticity.industryCatalyst || "趋势、资金和产业共同评分"}`,
      trigger: topElasticity.buyPoint || "平台突破或首次缩量回踩不破",
      action: "触发前只观察，触发后小仓验证，不追连续大阳",
      risk: topElasticity.risk || "资金短炒或业绩无法兑现",
      validFor: "1-3个月模型，买点按1-5日验证",
      confidence: "中"
    }] : []),
    ...(topValue ? [{
      type: "成长价值观察",
      recommendation: `${topValue.name}（${topValue.code}）进入基本面复核`,
      why: `综合${topValue.compositeScore}分；产业${topValue.industryScore ?? "-"}、成长${topValue.growthScore ?? "-"}、统一成长空间${topValue.upsideMultiple ?? "-"}倍`,
      trigger: topValue.catalyst || topValue.keyCheck || "下一份财报确认增长和现金流",
      action: "财报、行业景气和估值三项确认后再决定买点",
      risk: topValue.maximumRisk || topValue.risk || "价值陷阱或成长不及预期",
      validFor: "1个季度",
      confidence: "中"
    }] : []),
    ...(topFiveX ? [{
      type: "长期成长研究",
      recommendation: `${topFiveX.name}（${topFiveX.code}）作为五倍股长期研究样本`,
      why: topFiveX.coreLogic,
      trigger: topFiveX.futureCatalysts,
      action: "不以长期空间替代短期买点，按财报逐季验证",
      risk: topFiveX.risk,
      validFor: "1-3年，季度复核",
      confidence: "中"
    }] : []),
    ...(modelAnalysis?.finalCommand ? [{
      type: "深度模型复核",
      recommendation: modelAnalysis.finalCommand,
      why: modelAnalysis.summary || "深度模型结合行情、事件和组合约束复核",
      trigger: "硬数据与规则引擎结论一致",
      action: "仅作为交叉验证，不覆盖公告和财务硬事实",
      risk: "模型结论可能受新闻覆盖和数据时效限制",
      validFor: guidanceTarget || "下一阶段",
      confidence: /失败|降级/.test(modelAnalysis.status || "") ? "低" : "中"
    }] : [])
  ].slice(0, 6);
  return {
    generatedAt: dataHealth.generatedAt,
    marketStage: {
      regime: marketRegime?.regime || "待确认",
      phase: marketRegime?.regime?.includes("牛") ? "启动/结构分化" : marketRegime?.regime?.includes("熊") ? "退潮/风险期" : "震荡分化期",
      indices: indices.map(item => ({ name: item.name, close: item.close, pct: item.pct, trend: item.trend })),
      riskPreference: marketRegime?.score >= 3 ? "进攻" : marketRegime?.score <= -3 ? "防守" : "均衡",
      positionRange: marketRegime?.score >= 3 ? "60%-85%" : marketRegime?.score <= -3 ? "20%-50%" : "40%-70%",
      basis: marketRegime?.summary || "等待数据"
    },
    coreConclusions: conclusions,
    recommendations,
    holdingActionSummary: portfolioAdvice.items.map(item => ({ name: item.name, action: item.action, priority: item.priority, reason: item.reasons[0], confidence: item.confidence })),
    watchList: [
      "上证、创业板、科创50、沪深300和中证1000趋势是否共振",
      "持仓财报、业绩预告、重大合同、减持和监管公告",
      "行业资金是持续迁移还是一日脉冲",
      "海外科技、利率、汇率和大宗商品的A股传导",
      "统一估值、业务转型评分或行业参数是否触发重算"
    ],
    dataHealth
  };
}

function buildFundingStructure(internals = {}, indices = []) {
  const available = Boolean(internals.sampleSize);
  return {
    generatedAt: null,
    marketBreadth: {
      upCount: internals.upCount ?? null,
      downCount: internals.downCount ?? null,
      limitUp: internals.limitUp ?? null,
      limitDown: internals.limitDown ?? null,
      medianPct: internals.medianPct ?? null,
      strongCount: internals.strongCount ?? null,
      weakCount: internals.weakCount ?? null,
      read: internals.read || "待确认"
    },
    industryFlow: internals.activeIndustries || [],
    indexStyle: indices.map(item => ({ name: item.name, pct: item.pct, trend: item.trend?.status || "待确认" })),
    emotionCycle: !available ? "数据不足" : internals.emotion === "赚钱效应扩散" ? "发酵" : internals.emotion === "弱势防守" ? "退潮" : "分化",
    emotionBasis: internals.read || "缺少全A数据",
    unavailableMetrics: ["主动买入/卖出强度", "ETF申购赎回", "融资余额变化", "大单净流入", "涨停晋级率", "炸板率", "连板高度"],
    unavailableReason: "现有公开行情接口未稳定提供，页面必须显示待接入，不使用推测值。",
    migrationMatrix: (internals.activeIndustries || []).slice(0, 12).map(item => ({
      industry: item.industry,
      capitalStrength: item.amountShare ?? null,
      priceTrend: item.avgPct > 0 ? "增强" : "承压",
      earningsExpectation: "待财报和一致预期数据",
      valuationPosition: "读取统一估值引擎行业分布",
      crowding: item.amountShare >= 8 ? "偏拥挤" : "正常",
      catalystStrength: "待事件层确认",
      migrationType: item.upRatio >= 60 && item.avgPct > 0 ? "中期资金迁移候选" : item.avgPct > 0 ? "短期事件驱动/反弹" : "资金流出或防御切换"
    }))
  };
}

function buildGlobalTransmission(globalMarkets = [], signals = []) {
  const quoteFor = source => {
    const names = source.includes("美股") || source.includes("费半")
      ? ["半导体ETF", "纳斯达克100", "纳斯达克"]
      : source.includes("韩国")
        ? ["韩国KOSPI"]
        : source.includes("日经")
          ? ["日经225"]
          : source.includes("港股")
            ? ["恒生指数"]
            : [];
    return names.map(name => globalMarkets.find(item => item.name === name)).filter(Boolean);
  };
  return signals.map(signal => ({
    event: (() => {
      const quotes = quoteFor(signal.source);
      return quotes.length
        ? `${signal.source}日度信号：${quotes.map(item => `${item.name}${Number.isFinite(Number(item.pct)) ? `${Number(item.pct).toFixed(2)}%` : "涨跌待确认"}`).join("，")}`
        : `${signal.source}日度数据未接入，固定观察项不作为当天结论`;
    })(),
    market: signal.source,
    affectedGlobalChain: signal.watch,
    productOrderCapexPath: "海外价格/订单/资本开支变化→A股相关产业盈利预期",
    affectedAIndustry: signal.aShareMap,
    directBeneficiaries: "需按真实业务收入和客户敞口筛选",
    indirectBeneficiaries: signal.aShareMap,
    potentialLosers: "与海外信号反向暴露或估值过高的公司",
    realExposure: "读取统一业务结构；纯概念映射不计入基本面评分",
    impactStrength: (() => {
      const moves = quoteFor(signal.source).map(item => Math.abs(Number(item.pct))).filter(Number.isFinite);
      const maxMove = moves.length ? Math.max(...moves) : null;
      return maxMove === null ? "待确认" : maxMove >= 3 ? "高" : maxMove >= 1 ? "中" : "低";
    })(),
    impactCycle: "1周至1季度",
    pricedIn: "当日海外变化只作为先验，需结合A股同产业相对强弱和成交验证",
    source: globalMarkets.find(item => signal.source.includes(item.name))?.name || signal.source,
    updatedAt: quoteFor(signal.source).map(item => item.time).filter(Boolean)[0] || null,
    confidence: quoteFor(signal.source).length ? "中" : "低",
    dailyVerified: quoteFor(signal.source).length > 0,
    dailyQuotes: quoteFor(signal.source).map(item => ({ name: item.name, close: item.close, pct: item.pct, time: item.time })),
    action: signal.action
  }));
}

export {
  buildChiefDecision,
  buildFundingStructure,
  buildGlobalTransmission,
  buildPortfolioAdvice,
  buildSystemDataHealth,
  buildUnifiedEvents
};
