import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../../config/industry-map.json", import.meta.url), "utf8"));
const RELATION_RANK = { "核心主营": 5, "主要第二增长曲线": 4, "少量业务布局": 3, "参股或间接相关": 2, "纯概念映射": 1 };

const ALIASES = {
  "AI算力与数据中心": ["AI", "算力", "服务器", "数据中心"],
  "国产服务器与计算机设备": ["服务器", "计算机设备", "国产算力"],
  "光通信与高速互联": ["光模块", "光通信", "高速互联", "PCB"],
  "液冷、IDC和数据中心配套": ["液冷", "IDC", "电源", "数据中心"],
  "半导体设备": ["半导体设备", "设备"],
  "半导体材料": ["半导体材料", "靶材", "光刻胶", "电子材料"],
  "先进封装": ["先进封装", "封装"],
  "存储芯片": ["存储", "HBM"],
  "功率半导体": ["功率半导体", "IGBT", "SiC"],
  "第三代半导体": ["碳化硅", "氮化镓", "第三代半导体"],
  "人形机器人": ["人形机器人", "具身智能"],
  "工业机器人": ["工业机器人", "机器人"],
  "工业自动化": ["工业自动化", "伺服", "控制器"],
  "新能源汽车核心零部件": ["新能源汽车", "车载电源", "800V", "快充"],
  "高压快充与车载电源": ["车载电源", "高压", "800V", "快充"],
  "化工新材料": ["化工", "制冷剂", "氟化工"],
  "电子材料": ["电子材料", "半导体材料", "靶材"],
  "保险": ["保险"],
  "银行": ["银行"],
  "券商": ["证券", "券商"],
  "房地产": ["房地产", "地产"]
};

function textFor(company) {
  return [
    company.name,
    company.industry?.level1,
    company.industry?.level2,
    company.business?.legalIndustry,
    company.business?.originalMainIndustry,
    company.business?.coreRevenueSource,
    company.business?.coreProfitSource,
    company.business?.newGrowthBusiness,
    company.business?.marketPricingLogic
  ].filter(Boolean).join(" ");
}

function relationFor(company, track) {
  const text = textFor(company);
  const keys = ALIASES[track] || [track];
  const hits = keys.filter(key => text.includes(key));
  if (!hits.length) return null;
  const score = Number(company.business?.transformationScore || 0);
  const coreText = `${company.business?.coreRevenueSource || ""} ${company.business?.coreProfitSource || ""} ${company.industry?.level2 || ""}`;
  const core = keys.some(key => coreText.includes(key));
  const relation = core ? "核心主营" : score >= 61 ? "主要第二增长曲线" : score >= 21 ? "少量业务布局" : "纯概念映射";
  return {
    name: company.name,
    code: company.code,
    relation,
    revenueShare: company.business?.newBusinessRevenueShare ?? null,
    profitShare: company.business?.newBusinessProfitShare ?? null,
    orderShare: company.business?.newBusinessOrderShare ?? null,
    commercializationStage: company.business?.commercializationStage || "待核验",
    purity: core ? "高" : score >= 41 ? "中" : "低",
    dataSource: company.dataHealth?.business?.source || "统一公司研究快照",
    updatedAt: company.conclusion?.generatedAt || null,
    valuationStatus: company.valuation?.valid ? company.valuation?.status || "估值有效" : "估值无效"
  };
}

function trackStage(category, relations) {
  if (relations.some(item => item.commercializationStage === "快速放量" || item.commercializationStage === "转型基本完成")) return "高速成长期";
  return category.stage;
}

function buildIndustryMap(companies = [], events = [], fundingStructure = {}, generatedAt = null) {
  const categories = config.categories.map(category => ({
    ...category,
    tracks: category.tracks.map(track => {
      const companiesForTrack = companies
        .map(company => relationFor(company, track))
        .filter(Boolean)
        .sort((a, b) => RELATION_RANK[b.relation] - RELATION_RANK[a.relation])
        .slice(0, 20);
      const relatedEvents = events.filter(event => `${event.affectedIndustries || ""} ${event.title || ""}`.includes(track)).slice(0, 5);
      const flow = (fundingStructure.industryFlow || []).find(item => track.includes(item.industry) || item.industry?.includes(track));
      return {
        name: track,
        definition: `${category.definition}中的${track}环节。`,
        stage: trackStage(category, companiesForTrack),
        marketSpace: category.outlook,
        prosperity: flow?.avgPct > 1 ? "景气与价格共振" : flow?.avgPct < -1 ? "短期承压" : "景气待订单/盈利确认",
        policyDriver: category.policy,
        technologyDriver: category.technology,
        commercialization: companiesForTrack.some(item => item.relation === "核心主营") ? "已有A股主营样本" : "待补充主营样本",
        chainStructure: { upstream: "原材料/核心部件", midstream: track, downstream: "终端客户/应用场景" },
        keyLinks: track,
        leaders: companiesForTrack.filter(item => item.relation === "核心主营").slice(0, 5),
        highElasticity: companiesForTrack.filter(item => item.purity !== "低").slice(0, 5),
        potentialPositioning: companiesForTrack.filter(item => item.relation === "主要第二增长曲线" || item.relation === "少量业务布局").slice(0, 5),
        companies: companiesForTrack,
        valuationStatus: category.valuation,
        risks: category.risk,
        relatedEvents,
        updatedAt: generatedAt || config.updatedAt,
        source: "统一公司研究快照+产业配置+事件中心"
      };
    })
  }));
  return {
    schemaVersion: config.schemaVersion,
    generatedAt: generatedAt || config.updatedAt,
    relationshipLevels: config.relationshipLevels,
    stageLabels: config.stageLabels,
    categoryCount: categories.length,
    trackCount: categories.reduce((sum, item) => sum + item.tracks.length, 0),
    categories
  };
}

export { buildIndustryMap };
