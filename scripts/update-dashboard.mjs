import fs from "node:fs/promises";
import { buildCompanyResearchUniverse, detectIndustryFamily } from "./lib/unified-research-engine.mjs";
import { buildIndustryMap } from "./lib/industry-map-engine.mjs";
import {
  buildChiefDecision,
  buildFundingStructure,
  buildGlobalTransmission,
  buildPortfolioAdvice,
  buildSystemDataHealth,
  buildUnifiedEvents
} from "./lib/decision-engine.mjs";
import { earningsGuidanceFromEvents } from "./lib/earnings-guidance.mjs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_DAILY_MODEL = process.env.OPENAI_DAILY_MODEL || "gpt-5.6-sol";
const OPENAI_DEEP_MODEL = process.env.OPENAI_DEEP_MODEL || "gpt-5.6-sol";
const OPENAI_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || "max";
const REQUIRE_MODEL_ANALYSIS = (process.env.REQUIRE_MODEL_ANALYSIS || "true") !== "false";
const TUSHARE_TOKEN = process.env.TUSHARE_TOKEN || "";

const STOCKS = [
  ["sh600160","巨化股份","600160","32.26%","制冷剂/氟化工/周期涨价",47.286],
  ["sz000977","浪潮信息","000977","29.18%","AI服务器/国产算力",72.782],
  ["sz301607","富特科技","301607","22.06%","新能源车高压电源/800V快充",54.997],
  ["sz300666","江丰电子","300666","16.49%","高纯靶材/半导体材料",386.335]
];

const TRADE_TRACKING_BASE = [
  ["sh600160","巨化股份","600160","当前持仓","制冷剂/氟化工/周期涨价"],
  ["sz000977","浪潮信息","000977","当前持仓","AI服务器/国产算力"],
  ["sz301607","富特科技","301607","当前持仓","新能源车高压电源/800V快充"],
  ["sz300666","江丰电子","300666","当前持仓","高纯靶材/半导体材料"],
  ["sz300745","欣锐科技","300745","已清仓","新能源车车载电源/高压快充"],
  ["sz002080","中材科技","002080","已清仓","玻纤/电子布/新能源材料"],
  ["sz300054","鼎龙股份","300054","已清仓","CMP/光刻胶材料"],
  ["sz002617","露笑科技","002617","已清仓","功率半导体/碳化硅"],
  ["sz300395","菲利华","300395","已清仓","石英材料/军工材料"],
  ["sz002409","雅克科技","002409","已清仓","电子材料/前驱体/特气"],
  ["sz000100","TCL科技","000100","已清仓","面板/半导体显示"]
];

const HOLDING_HARD_EVENTS = [
  {
    date: "2026-07-08",
    source: "巨潮资讯",
    name: "浪潮信息",
    code: "000977",
    title: "2026年半年度业绩预告",
    type: "业绩预告",
    priority: "P0持仓",
    importance: "持仓重大利好/AI服务器业绩兑现",
    url: "http://static.cninfo.com.cn/finalpage/2026-07-08/1225414299.PDF",
    facts: [
      "2026H1归母净利润预计26.00亿元至31.00亿元，上年同期7.986亿元，同比增长226%至288%。",
      "2026H1扣非净利润预计20.55亿元至25.55亿元，上年同期6.717亿元，同比增长206%至280%。",
      "基本每股收益预计1.77元至2.11元，上年同期0.5425元。",
      "公司解释为紧抓行业上行机遇、产品技术创新、完善产品线布局、提升产品附加值和供应保障能力，促进经营业绩大幅增长。"
    ],
    analystRead: "这是持仓里最硬的新增信息：浪潮不再只是AI服务器验证仓，而是业绩预告已证明AI服务器/国产算力景气兑现。明天重点看是否一字/高开后承接、AI服务器/PCB/液冷/光模块是否共振，以及高开低走风险。",
    action: "持有并提高关注等级，但不无脑追高加仓；若高开后成交承接强、AI服务器链同步放量，可从验证仓升级为主线仓。若高开低走或板块不跟，先不加仓，只保留原仓验证。",
    trigger: "高开后不回落、成交额放大但不放天量长上影；工业富联/中科曙光/PCB/光模块/液冷同步强；后续半年报验证毛利率、现金流和订单质量。",
    fail: "利好兑现高开低走、放量长上影、AI服务器链不跟、或半年报显示毛利率/现金流/存货质量不支撑利润高增。"
  }
];

const CNINFO_ORG_IDS = {
  "301607": "9900033272",
  "000977": "gssz0000977",
  "300666": "9900024278",
  "600160": "gssh0600160",
  "300745": "9900030720"
};

const TRACKED_EXTRA_CNINFO = {
  "603259": "gssh0603259",
  "002472": "9900003944",
  "002993": "9900032416",
  "603983": "gssh0603983",
  "300768": "9900031919",
  "000680": "gssz0000680",
  "603039": "gssh0603039",
  "600562": "gssh0600562",
  "002605": "9900004010",
  "002768": "9900024677",
  "002701": "9900022758",
  "002803": "9900026239",
  "603444": "gssh0603444"
};

const IMPORTANT_ANNOUNCEMENT_RE = /业绩预告|业绩快报|预增|预盈|预亏|扭亏|中报|半年报|半年度报告|季度报告|年度报告|业绩说明会|减持|增持|回购|重大合同|订单|中标|投资|收购|问询|监管|风险提示|诉讼|仲裁|停牌|复牌|限售|解除限售|分红|利润分配/;

const INDICES = [
  ["sh000001", "上证指数"],
  ["sz399006", "创业板指"],
  ["sh000688", "科创50"],
  ["sh000300", "沪深300"],
  ["sh000852", "中证1000"]
];

const GLOBAL_SINA_SYMBOLS = [
  ["gb_ixic", "纳斯达克"],
  ["gb_ndx", "纳斯达克100"],
  ["gb_soxx", "半导体ETF"],
  ["b_NKY", "日经225"],
  ["b_HSI", "恒生指数"]
];

const US_GAINER_THEMES = [
  {
    theme: "AI应用/软件",
    usExamples: "META、APP、PLTR、NOW、CRM",
    trigger: "美股涨幅榜出现AI应用、广告科技、企业软件集体走强",
    aShareMap: "金山办公、科大讯飞、用友网络、润和软件、万兴科技",
    read: "说明资金从硬件扩散到应用层；A股软件若同步放量，可作为补涨线。"
  },
  {
    theme: "AI硬件/半导体",
    usExamples: "NVDA、AMD、AVGO、MU、SMCI",
    trigger: "美股涨幅榜出现芯片、服务器、存储、半导体设备集体走强",
    aShareMap: "工业富联、中科曙光、浪潮信息、通富微电、长电科技、江丰电子、雅克科技",
    read: "这是A股科技最强正反馈；但若A股高开低走，说明国内资金不认。"
  },
  {
    theme: "光模块/通信设备",
    usExamples: "ANET、CIEN、LITE、COHR",
    trigger: "美股涨幅榜出现网络设备、光通信、数据中心连接",
    aShareMap: "中际旭创、新易盛、天孚通信、光迅科技、剑桥科技",
    read: "映射AI数据中心通信链，A股光模块和铜连接优先观察。"
  },
  {
    theme: "电力/能源基础设施",
    usExamples: "CEG、VST、GEV、ETN、PWR",
    trigger: "美股涨幅榜出现公用事业、电力设备、核电、能源基础设施",
    aShareMap: "国电南瑞、许继电气、平高电气、东方电缆、英维克、申菱环境",
    read: "说明AI交易从芯片扩散到电力和数据中心基础设施，A股可看电力设备和液冷。"
  },
  {
    theme: "金融/加密资产",
    usExamples: "COIN、HOOD、IBKR、MSTR",
    trigger: "美股涨幅榜出现金融科技、券商、交易平台、加密资产",
    aShareMap: "东方财富、同花顺、指南针、中信证券、财富趋势",
    read: "偏风险偏好回升信号，A股券商和互联网金融可作为情绪弹性。"
  },
  {
    theme: "医药/减肥药/创新药",
    usExamples: "LLY、NVO、MRNA、REGN、VRTX",
    trigger: "美股涨幅榜出现创新药、减肥药、医疗器械",
    aShareMap: "恒瑞医药、药明康德、迈瑞医疗、百济神州、信达生物",
    read: "说明资金向防御成长或创新药切换，A股医药可作为科技弱时的替代方向。"
  }
];

const JAPAN_KOREA_GAINER_THEMES = [
  {
    market: "日本",
    theme: "半导体设备/电子材料",
    examples: "Tokyo Electron、Advantest、Lasertec、SCREEN",
    trigger: "日股涨幅榜出现半导体设备、测试设备、电子材料集体走强",
    logic: "日本半导体链偏设备和材料上游，涨幅榜走强通常代表全球晶圆厂扩产、先进封装或AI硬件资本开支预期回暖。",
    aShareMap: "华海清科、北方华创、中微公司、安集科技、南大光电、江丰电子",
    use: "若日股设备材料先修复，A股半导体设备/材料可作为第二天重点观察，但要看科创50是否配合。"
  },
  {
    market: "日本",
    theme: "机器人/工业自动化",
    examples: "Fanuc、Yaskawa、Keyence、SMC",
    trigger: "日股涨幅榜出现机器人、传感器、自动化设备",
    logic: "日本机器人链走强通常对应全球制造业资本开支或AI进入工业场景。",
    aShareMap: "绿的谐波、汇川技术、埃斯顿、鸣志电器、机器人",
    use: "若A股科技高位承压，机器人/工业自动化可能成为低位补涨方向。"
  },
  {
    market: "日本",
    theme: "汽车/新能源车零部件",
    examples: "Toyota、Honda、Denso、Murata、TDK",
    trigger: "日股涨幅榜出现整车、电子零部件、电池材料",
    logic: "日本汽车链强，可能对应全球新能源车、混动、车载电子和功率器件需求改善。",
    aShareMap: "富特科技、露笑科技、斯达半导、新洁能、德赛西威、拓普集团",
    use: "富特科技的海外映射主要看这一条；若日本汽车电子强，富特的高压电源逻辑更容易被资金认可。"
  },
  {
    market: "韩国",
    theme: "存储/HBM/半导体",
    examples: "Samsung Electronics、SK hynix、Hanmi Semiconductor",
    trigger: "韩股涨幅榜出现三星、SK海力士、HBM设备、封装设备",
    logic: "韩国半导体链是全球存储和HBM风向标，走强通常代表AI服务器内存需求或存储周期修复。",
    aShareMap: "雅克科技、江丰电子、通富微电、长电科技、华海诚科、深科技",
    use: "若韩国半导体止跌反包，A股材料链和先进封装的反弹可信度提高。"
  },
  {
    market: "韩国",
    theme: "电池/新能源材料",
    examples: "LG Energy Solution、Samsung SDI、EcoPro、POSCO Future M",
    trigger: "韩股涨幅榜出现电池、正负极、隔膜、锂电材料",
    logic: "韩国电池链走强通常对应欧美新能源车需求、储能或材料价格预期改善。",
    aShareMap: "宁德时代、亿纬锂能、恩捷股份、璞泰来、当升科技、中材科技",
    use: "若韩国电池链回流，中材科技的新能源材料属性可获得修复辅助。"
  },
  {
    market: "韩国",
    theme: "互联网/游戏/娱乐",
    examples: "NAVER、Kakao、Krafton、NCSoft",
    trigger: "韩股涨幅榜出现互联网平台、游戏、内容娱乐",
    logic: "韩国互联网娱乐走强通常反映风险偏好修复或AI应用/内容分发预期。",
    aShareMap: "昆仑万维、恺英网络、三七互娱、掌趣科技、中文在线",
    use: "这是风险偏好辅助信号，不是你当前持仓主线，只做候选池补充。"
  }
];

const CANDIDATE_POOL = [
  ["sz002156", "通富微电", "002156", "先进封装/HBM", "AI服务器、国产算力、HBM和先进封装催化", "封测产能和HBM订单验证"],
  ["sh600584", "长电科技", "600584", "封测/先进封装", "AI硬件、国产封测、先进封装扩产预期", "先进封装产能和盈利修复"],
  ["sh688019", "安集科技", "688019", "CMP抛光液/半导体材料", "国产替代、晶圆厂扩产、CMP材料验证", "晶圆厂验证和毛利率改善"],
  ["sz300346", "南大光电", "300346", "光刻胶/电子特气", "光刻胶、电子特气、半导体材料国产化", "光刻胶验证和电子特气订单"],
  ["sh688106", "金宏气体", "688106", "电子特气", "电子气体国产替代、晶圆厂供应链安全", "大客户供应和产品结构改善"],
  ["sz002463", "沪电股份", "002463", "AI服务器PCB", "AI服务器、高速PCB、英伟达链和国产算力", "AI服务器订单和高端板毛利"],
  ["sz300476", "胜宏科技", "300476", "AI服务器PCB", "AI服务器、高多层PCB、海外算力链", "AI PCB订单和产能释放"],
  ["sh605111", "新洁能", "605111", "功率半导体", "新能源车功率器件、国产替代", "功率器件需求和库存周期改善"],
  ["sh603290", "斯达半导", "603290", "IGBT/功率半导体", "新能源车、工控、功率器件国产化", "车规IGBT和工业需求改善"],
  ["sh603019", "中科曙光", "603019", "国产算力", "国产算力、AI服务器、超聚变IPO估值映射", "国产算力订单和政策采购"],
  ["sz000977", "浪潮信息", "000977", "AI服务器", "国产算力、AI服务器需求和超聚变估值锚", "AI服务器订单和交付节奏"],
  ["sz002916", "深南电路", "002916", "AI服务器PCB/封装基板", "AI服务器、封装基板、国产算力链", "封装基板和高端PCB订单"],
  ["sz300604", "长川科技", "300604", "半导体设备/测试", "国产设备、先进封装测试", "测试设备订单和国产替代"],
  ["sh688120", "华海清科", "688120", "CMP设备", "CMP设备国产替代、材料设备共振", "设备订单和晶圆厂扩产"],
  ["sz300394", "天孚通信", "300394", "光模块/CPO", "AI算力、光模块、海外科技链", "CPO/高速光器件订单"],
  ["sz300308", "中际旭创", "300308", "光模块", "AI算力、海外云厂商资本开支", "海外云厂商订单和高速产品占比"],
  ["sz300502", "新易盛", "300502", "光模块", "高速光模块、AI数据中心", "高速光模块订单和盈利弹性"],
  ["sh688041", "海光信息", "688041", "国产CPU/GPU", "国产算力、安全可控", "国产芯片订单和生态验证"],
  ["sh688981", "中芯国际", "688981", "晶圆代工", "半导体国产替代、先进制程情绪锚", "稼动率和先进制程预期"],
  ["sz300661", "圣邦股份", "300661", "模拟芯片", "国产模拟芯片、消费/工控修复", "模拟芯片库存和毛利率修复"],
  ["sh688800", "瑞可达", "688800", "连接器/液冷", "AI服务器连接器、液冷快接、新能源车连接", "高速连接器和液冷订单验证"],
  ["sz002837", "英维克", "002837", "液冷/数据中心温控", "AI数据中心液冷、储能温控、服务器散热", "液冷订单和温控盈利改善"],
  ["sz301018", "申菱环境", "301018", "液冷/数据中心温控", "数据中心温控、液冷、工业空调", "数据中心液冷项目和订单释放"],
  ["sh603728", "鸣志电器", "603728", "机器人电机/控制", "机器人空心杯电机、运动控制、工业自动化", "机器人电机订单和新品放量"],
  ["sh688017", "绿的谐波", "688017", "机器人减速器", "机器人谐波减速器、工业自动化", "减速器订单和毛利修复"],
  ["sz300580", "贝斯特", "300580", "机器人丝杠/汽零", "机器人滚珠丝杠、汽车零部件、智能装备", "丝杠进展和汽零订单改善"],
  ["sh603667", "五洲新春", "603667", "机器人轴承/丝杠", "机器人轴承、丝杠、汽车零部件", "机器人部件订单和产能验证"],
  ["sz300745", "欣锐科技", "300745", "车载电源/高压快充", "新能源车车载电源、800V高压平台", "高压电源订单和客户拓展"],
  ["sh688612", "威迈斯", "688612", "车载电源/充电模块", "新能源车车载电源、充电模块、800V平台", "车载电源订单和毛利率变化"],
  ["sh603786", "科博达", "603786", "汽车电子/智能底盘", "汽车电子、灯控、底盘控制、海外客户", "新项目定点和海外客户放量"],
  ["sz002993", "奥海科技", "002993", "电源/充电器/车载电源", "消费电源、新能源车电源、服务器电源映射", "车载和服务器电源订单验证"],
  ["sh688535", "华海诚科", "688535", "先进封装材料", "先进封装、环氧塑封料、国产替代", "先进封装材料验证和放量"],
  ["sh688409", "富创精密", "688409", "半导体设备零部件", "半导体设备零部件、国产替代", "设备零部件订单和产能释放"],
  ["sz300699", "光威复材", "300699", "碳纤维/军工新材料", "军工碳纤维、复合材料、低空经济材料", "军工订单和民品复材改善"],
  ["sh688295", "中复神鹰", "688295", "碳纤维/复材", "碳纤维、复合材料、低空经济材料", "碳纤维价格和产能利用率改善"],
  ["sh688631", "莱斯信息", "688631", "低空经济/空管", "低空经济、空管系统、民航空管数字化", "低空空管订单和政策落地"],
  ["sz001696", "宗申动力", "001696", "低空经济/发动机", "低空经济、航空发动机、通机动力", "航空动力订单和低空政策催化"],
  ["sh601398", "工商银行", "601398", "红利银行", "高股息、防守资金、中特估", "息差、分红率和资产质量"],
  ["sh601088", "中国神华", "601088", "煤炭红利", "高股息、能源安全、现金流稳定", "煤价、分红率和长协煤稳定性"],
  ["sh600900", "长江电力", "600900", "电力红利", "高股息、电力资产、水电现金流", "来水、分红和电价稳定性"],
  ["sh600941", "中国移动", "600941", "运营商红利/算力", "高股息、云网算力、央企重估", "分红、云业务和算力资本开支"],
  ["sh601899", "紫金矿业", "601899", "有色铜金", "铜金价格、资源周期、全球矿产", "铜金价格、产量和成本控制"],
  ["sh603993", "洛阳钼业", "603993", "有色钴铜", "铜钴资源、能源金属、全球矿山", "铜钴价格和矿山放量"],
  ["sh600309", "万华化学", "600309", "化工龙头", "MDI、化工周期、全球制造需求", "MDI价格、价差和新材料放量"],
  ["sh600519", "贵州茅台", "600519", "白酒龙头", "消费修复、机构底仓、品牌定价权", "批价、渠道库存和分红"],
  ["sz000333", "美的集团", "000333", "家电/出口链", "家电出海、机器人、稳健现金流", "海外收入、毛利率和分红"],
  ["sh600276", "恒瑞医药", "600276", "创新药", "创新药出海、医保政策、管线兑现", "BD授权、临床进展和利润修复"],
  ["sz300760", "迈瑞医疗", "300760", "医疗器械", "医疗设备、出海、国产替代", "海外增长、设备招标和毛利率"],
  ["sz300059", "东方财富", "300059", "互联网券商", "市场风险偏好、成交额、财富管理", "两市成交额、基金销售和券商弹性"],
  ["sh600030", "中信证券", "600030", "券商龙头", "指数行情、并购重组、资本市场改革", "成交额、投行业务和政策催化"],
  ["sh601318", "中国平安", "601318", "保险金融", "保险资产端修复、权益市场回暖", "新业务价值、投资收益和分红"],
  ["sz002352", "顺丰控股", "002352", "快递物流", "消费复苏、跨境物流、成本改善", "件量、单票收入和成本控制"],
  ["sh600150", "中国船舶", "600150", "船舶出口", "造船周期、出口订单、军民融合", "新船价格、订单排期和交付节奏"],
  ["sh601100", "恒立液压", "601100", "工程机械/出口", "工程机械周期、出口链、高端液压", "海外需求、挖机周期和毛利率"],
  ["sz002594", "比亚迪", "002594", "新能源车整车", "新能源车销量、出口、智能化", "销量、价格战、出口和单车利润"],
  ["sh601689", "拓普集团", "601689", "汽零/机器人", "汽车零部件、智能底盘、机器人执行器", "客户放量、新项目和机器人进展"],
  ["sz002050", "三花智控", "002050", "热管理/机器人", "新能源车热管理、机器人执行器、全球客户", "热管理订单和机器人业务进展"],
  ["sz002126", "银轮股份", "002126", "热管理/商用车", "新能源热管理、数据中心液冷、出口链", "热管理订单和液冷业务"],
  ["sz002472", "双环传动", "002472", "机器人减速器/汽零", "机器人、汽车齿轮、减速器国产化", "机器人减速器订单和汽零放量"],
  ["sz0028…72750 tokens truncated…ached = previousCompanyResearch.companies.map(item => ({
      ...item,
      conclusion: {
        ...(item.conclusion || {}),
        invalid: true,
        invalidReasons: [...new Set([...(item.conclusion?.invalidReasons || []), "本次全A行情源失败，使用上一次公司研究缓存"])]
      },
      cacheStatus: {
        usingCache: true,
        cachedGeneratedAt: previousCompanyResearch.generatedAt || null,
        reason: "本次全A行情源失败"
      }
    }));
    companyResearchResult = {
      list: cached,
      byCode: new Map(cached.map(item => [item.code, item])),
      summary: {
        ...(previousCompanyResearch.summary || {}),
        total: cached.length,
        usingCache: true,
        cachedGeneratedAt: previousCompanyResearch.generatedAt || null
      }
    };
  }
  const oversoldQuotes = await fetchSina(OVERSOLD_VALUE_POOL.map(x => x[0])).catch(error => {
    console.warn(`oversold quote fallback: ${error.message}`);
    return [];
  });
  const oversoldWeeklyProfiles = await fetchWeeklyProfiles(OVERSOLD_VALUE_POOL).catch(error => {
    console.warn(`oversold weekly fallback: ${error.message}`);
    return new Map();
  });
  const oversoldMarketCaps = await fetchEastmoneyMarketCaps(OVERSOLD_VALUE_POOL).catch(error => {
    console.warn(`oversold market cap fallback: ${error.message}`);
    return new Map();
  });
  const globalSinaQuotes = await fetchGlobalSina().catch(() => []);
  const kospiQuote = await fetchKospiQuote(previous).catch(() => ({
    name: "韩国KOSPI",
    close: null,
    pct: NaN,
    time: "韩国行情源暂不可用；等待下次更新"
  }));
  const globalMarkets = [...globalSinaQuotes, kospiQuote];
  const stockMeta = new Map(STOCKS.map(x => [x[1], x]));

  const holdings = stockQuotes.map(q => {
    const meta = stockMeta.get(q.name) || [];
    const stock = {
      name: q.name,
      code: meta[2] || "",
      weight: meta[3] || "",
      accountReturnPct: Number.isFinite(Number(meta[5])) ? pct(q.close, Number(meta[5])) : null,
      close: Number(q.close.toFixed(2)),
      pct: pct(q.close, q.prevClose),
      amount: amountText(q.amountRaw),
      high: Number(q.high.toFixed(2)),
      low: Number(q.low.toFixed(2)),
      theme: meta[4] || ""
    };
    const [risk, action] = riskFor(stock);
    stock.risk = risk;
    stock.action = action;
    return stock;
  });
  const quoteMap = new Map(trackingQuotes.map(q => [q.name, q]));

  const indices = indexQuotes.map((q, idx) => {
    const dayPct = pct(q.close, q.prevClose);
    const trend = buildIndexTrendProfile(indexWeeklyProfiles.get(INDICES[idx][0].replace(/^(sh|sz)/, "")), dayPct);
    return {
      name: INDICES[idx][1],
      close: Number(q.close.toFixed(2)),
      pct: dayPct,
      trend
    };
  });

  const hasPreviousFullMarketCandidates = /全A快照/.test(previous.meta?.candidateScanScope || "")
    && Array.isArray(previous.candidates)
    && previous.candidates.length;
  const hasPreviousFullMarketValue = /全A快照/.test(previous.meta?.scanScope || "")
    && Array.isArray(previous.oversoldValueIdeas)
    && previous.oversoldValueIdeas.length;
  const dailyCandidates = marketWideSnapshot.length
    ? await buildMarketWideCandidates(marketWideSnapshot, valueFinancialResult.byCode)
    : hasPreviousFullMarketCandidates
      ? previous.candidates
      : buildCandidates(candidateQuotes, previous, candidateWeeklyProfiles, candidateMarketCaps);
  const candidateTrackingQuotes = marketWideSnapshot.length
    ? marketWideSnapshot.map(row => {
        const close = Number(row.close);
        const dayPct = Number(row.dayPct);
        const prevClose = Number.isFinite(close) && Number.isFinite(dayPct)
          ? close / (1 + dayPct / 100)
          : close;
        return {
          name: row.name,
          code: row.code,
          close,
          prevClose
        };
      })
    : candidateQuotes;
  const valueResearch = marketWideSnapshot.length
    ? buildMarketWideValueResearch(marketWideSnapshot, previous, valueFinancialResult.byCode, companyResearchResult.byCode)
    : {
        ideas: hasPreviousFullMarketValue
          ? previous.oversoldValueIdeas
          : buildOversoldValueIdeas(oversoldQuotes, previous, oversoldWeeklyProfiles, oversoldMarketCaps),
        traps: previous.valueTrapCandidates || []
      };
  const oversoldValueIdeas = valueResearch.ideas;
  const valueTrapCandidates = valueResearch.traps;
  const valueTrackingQuotes = marketWideSnapshot.length
    ? quoteRowsFromItems(marketWideSnapshot)
    : quoteRowsFromItems(oversoldValueIdeas);
  const institutionalGrowth = await buildInstitutionalGrowthResearch(marketWideSnapshot, dailyCandidates, companyResearchResult.byCode);
  const futureFiveXCandidates = institutionalGrowth.futureFiveXCandidates;
  const davisDoubleCandidates = institutionalGrowth.davisDoubleCandidates;
  const industryChainMap = institutionalGrowth.industryChainMap;
  const fiveXIdeas = futureFiveXCandidates
    .filter(isFiveXPoolEligible)
    .sort((a, b) => Number(b.fiveXPotentialIndex ?? -999) - Number(a.fiveXPotentialIndex ?? -999))
    .slice(0, 20);
  const focusCodes = [
    ...STOCKS.map(item => item[2]),
    ...TRADE_TRACKING_BASE.map(item => item[2]),
    ...dailyCandidates.slice(0, 30).map(item => item.code),
    ...fiveXIdeas.slice(0, 30).map(item => item.code),
    ...oversoldValueIdeas.slice(0, 20).map(item => item.code)
  ];
  const focusIntelligence = await fetchTushareFocusIntelligence(focusCodes).catch(error => {
    console.warn(`Tushare focus intelligence fallback: ${error.message}`);
    return { byCode: new Map(), covered: 0, source: `Tushare特色数据失败：${error.message}` };
  });
  const enrichFocus = items => (items || []).map(item => ({
    ...item,
    fundFlow: fundFlowResult.byCode.get(item.code) || item.fundFlow || null,
    sellerConsensus: sellerConsensusResult.byCode.get(item.code) || null,
    ...(focusIntelligence.byCode.get(item.code) || {})
  }));
  for (const key of ["futureFiveXCandidates", "davisDoubleCandidates", "all"]) {
    institutionalGrowth[key] = enrichFocus(institutionalGrowth[key]);
  }
  const trackedValueIdeas = buildRollingResearchPool(previous, "trackedValueIdeas", oversoldValueIdeas, valueTrackingQuotes, {
    minScore: 70,
    scoreField: "compositeScore",
    statusPrefix: "成长价值",
    dropBelowMin: false
  });
  const trackedFiveXIdeas = buildRollingResearchPool(previous, "trackedFiveXIdeas", fiveXIdeas, candidateTrackingQuotes, {
    minScore: 70,
    scoreField: "fiveXPotentialIndex",
    statusPrefix: "5倍模型",
    dropBelowMin: false,
    excludeCodes: ["002463", "688019", "688106", "688120", "688041", "688981", "688800", "688017", "688535", "688409", "688295", "688631", "688596", "688072", "688361", "688506", "688266"]
  });
  const holdingHardEventResult = await fetchHoldingHardEvents(previous, dailyCandidates, fiveXIdeas, oversoldValueIdeas).catch(error => {
    console.warn(`holding hard events fallback: ${error.message}`);
    return {
      events: HOLDING_HARD_EVENTS,
      coverage: STOCKS.map(([symbol, name, code]) => ({
        name,
        code,
        priority: "P0持仓",
        status: "查询失败/手工兜底",
        source: "巨潮资讯",
        checkedRange: "最近10天",
        rawCount: null,
        importantCount: null,
        latestTitles: HOLDING_HARD_EVENTS.filter(item => item.code === code).map(item => `${item.date} ${item.title}`),
        risk: `公告源整体查询失败：${error.message}。不能当作没有公告，必须人工复核。`
      }))
    };
  });
  const focusCodeSet = new Set(focusCodes.map(tushareCodeToAShareCode).filter(Boolean));
  const nameByCode = new Map(marketWideSnapshot.map(row => [row.code, row.name]));
  for (const [, name, code] of TRADE_TRACKING_BASE) nameByCode.set(code, name);
  const focusedTushareEarningsEvents = tushareEarningsResult.events
    .filter(item => focusCodeSet.has(item.code))
    .map(item => ({ ...item, name: nameByCode.get(item.code) || item.name || item.code }));
  const holdingHardEvents = [...new Map([
    ...preValuationEvents,
    ...(holdingHardEventResult.events || []),
    ...focusedTushareEarningsEvents
  ].map(item => [`${item.code}|${item.date}|${item.title}`, item])).values()];
  const announcementCoverage = (holdingHardEventResult.coverage || preValuationEventResult.coverage || []).map(item => {
    const earnings = tushareEarningsResult.byCode.get(item.code);
    if (!earnings) return item;
    const labels = [earnings.forecastDate ? `业绩预告 ${earnings.forecastDate}` : null, earnings.expressDate ? `业绩快报 ${earnings.expressDate}` : null].filter(Boolean);
    return {
      ...item,
      status: `${item.status || "已查询"}/Tushare财报已覆盖`,
      source: `${item.source || "公告源"} / Tushare业绩预告快报`,
      latestTitles: [...labels, ...(item.latestTitles || [])].slice(0, 5),
      risk: `${item.risk || ""}；Tushare结构化财报事件已覆盖，仍须以交易所/巨潮原文核验。`
    };
  });
  const publicNewsCandidates = await fetchPublicNewsCandidates(previous, dailyCandidates, fiveXIdeas, oversoldValueIdeas).catch(error => {
    console.warn(`public news search fallback: ${error.message}`);
    return stockSearchUniverse(previous, dailyCandidates, fiveXIdeas, oversoldValueIdeas)
      .slice(0, 60)
      .map(stock => ({
        name: stock.name,
        code: stock.code,
        priority: stock.priority,
        bucket: stock.bucket,
        source: "公开搜索",
        query: `${stock.name} ${stock.code} 公告 业绩 预告 财联社 同花顺`,
        title: "搜索层整体失败",
        url: "",
        snippet: error.message,
        status: "搜索源未完整覆盖，不能当作无新闻"
      }));
  });
  const scanScopeText = marketWideSnapshot.length
    ? `成长价值扫描：${marketWideSource}${marketWideSnapshot.length}只；${valueFinancialResult.source}覆盖${valueFinancialResult.covered}只；可操作池排除科创/北证`
    : hasPreviousFullMarketValue
      ? `估值质量扫描：本次全A行情源失败，暂沿用上一版全A结果；不把样本池冒充全市场`
      : "估值质量扫描：全A快照失败，本次仅有样本池，占位不作为强结论";
  const candidateScanScopeText = marketWideSnapshot.length
    ? `强弹性候选：${marketWideSource}${marketWideSnapshot.length}只全市场预筛；总市值30亿-800亿元，补取前72只周线历史，按趋势启动30、资金进入30、产业催化30、竞争壁垒10评分；不使用未来估值，只保留爬坡期/主升初期且总分不低于65的标的`
    : hasPreviousFullMarketCandidates
      ? `强弹性候选：本次全A行情源失败，暂沿用上一版全A候选；等待下一次云端刷新`
      : "强弹性候选：全A快照失败，本次仅有手工池占位，不作为正式全市场选股";
  const marketInternals = buildMarketInternals(marketWideSnapshot);
  const macro = buildMacroMap(indices, globalMarkets, marketInternals);
  const unifiedEvents = buildUnifiedEvents(holdingHardEvents, publicNewsCandidates);
  const portfolioAdvice = buildPortfolioAdvice(holdings, companyResearchResult.byCode, holdingHardEvents);
  const fundingStructure = buildFundingStructure(marketInternals, indices);
  fundingStructure.generatedAt = calculatedAt;
  const globalTransmission = buildGlobalTransmission(globalMarkets, macro.signals || []);
  const independentIndustryMap = buildIndustryMap(companyResearchResult.list, unifiedEvents, fundingStructure, calculatedAt);
  const dashboard = {
    meta: {
      version: "云端自动更新版",
      lastUpdated: chinaTimeString(),
      session: session.name,
      guidanceTarget: session.target,
      guidanceInstruction: session.instruction,
      scanScope: scanScopeText,
      candidateScanScope: candidateScanScopeText,
      valueQualityDataCoverage: `${valueFinancialResult.source}；报告期${valueFinancialResult.periods.join("/") || "待取数"}；覆盖${valueFinancialResult.covered}只`,
      researchEngineVersion: companyResearchResult.summary.engineVersion,
      researchEngineCoverage: `公司研究快照${companyResearchResult.summary.total}只；估值有效${companyResearchResult.summary.valuationValid}只；可参与排名${companyResearchResult.summary.rankingEligible}只`,
      marketSource: marketWideSource,
      dataSource: "GitHub Actions + 新浪行情接口 + 规则化投研",
      note: "自动化基础版会更新行情和规则化判断；深度新闻研判可后续接入分析模型。"
    },
    market: {
      indices,
      conclusion: `${session.name}：${marketConclusion(indices, holdings, marketInternals)} 本版用于指导${session.target}。`,
      breadth: marketInternals.read,
      internals: marketInternals
    },
    macro: {
      ...macro,
      session,
      holdingHardEvents,
      announcementCoverage,
      publicNewsCandidates,
      tushareEarnings: {
        source: tushareEarningsResult.source,
        forecastCount: tushareEarningsResult.forecastCount,
        expressCount: tushareEarningsResult.expressCount,
        datesChecked: tushareEarningsResult.datesChecked,
        coveredStocks: tushareEarningsResult.byCode.size,
        focusEvents: focusedTushareEarningsEvents.slice(0, 80),
        errors: tushareEarningsResult.errors || []
      }
    },
    portfolio: {
      totalValue: "",
      positionRatio: "99.41%",
      profit: "",
      stance: indices.some(x => x.pct < -3) ? "防守" : "观察",
      privacyNote: "按用户要求，网页不展示账户金额，只展示仓位比例、收益百分比和交易状态。",
      holdings
    },
    companyResearchSummary: companyResearchResult.summary,
    unifiedEvents,
    portfolioAdvice,
    fundingStructure,
    globalTransmission,
    independentIndustryMap,
    valuationAuditHighlights: companyResearchResult.list
      .filter(item => item.code === "601336" || !item.valuation.valid)
      .slice(0, 20)
      .map(item => ({
        name: item.name,
        code: item.code,
        industry: item.industry,
        method: item.valuation.method,
        valid: item.valuation.valid,
        rankingEligible: item.valuation.rankingEligible,
        conservative: item.valuation.conservative,
        neutral: item.valuation.neutral,
        optimistic: item.valuation.optimistic,
        futureScenarios: item.valuation.futureScenarios,
        forwardAssumptions: item.valuation.forwardAssumptions,
        invalidReasons: item.valuation.invalidReasons,
        warnings: item.valuation.warnings,
        audit: item.valuation.audit
      })),
    candidates: enrichFocus(dailyCandidates),
    elasticityModel: {
      name: "AI主升启动雷达",
      horizon: "未来1-3个月",
      weights: { trendStartup: 30, capitalEntry: 30, industryCatalyst: 30, moat: 10 },
      marketCapGateYi: { min: 30, max: 800 },
      preferredPhases: ["爬坡期", "主升初期"],
      excludedPhases: ["加速期", "高位风险"],
      minimumScore: 65,
      typePriority: ["产业趋势型", "周期反转型", "资金驱动型"]
    },
    fiveXCandidates: enrichFocus(fiveXIdeas),
    futureGrowthUniverse: institutionalGrowth.all,
    futureGrowthScanStats: institutionalGrowth.scanStats,
    futureFiveXCandidates,
    industryChainMap,
    davisDoubleCandidates,
    oversoldValueIdeas,
    valueTrapCandidates,
    valueQualityModel: {
      name: "AI产业时代的成长价值发现系统",
      weights: { valuationSafety: 25, growthPotential: 30, industryValue: 25, moat: 15, technicalEntry: 5 },
      financialCoverage: valueFinancialResult.covered,
      financialPeriods: valueFinancialResult.periods,
      financialSource: valueFinancialResult.source
    },
    tushareIntelligence: {
      sellerConsensus: {
        source: sellerConsensusResult.source,
        coveredStocks: sellerConsensusResult.covered,
        reportRows: sellerConsensusResult.reportRows || 0
      },
      fundFlow: {
        source: fundFlowResult.source,
        tradeDate: fundFlowResult.tradeDate,
        coveredStocks: fundFlowResult.covered
      },
      focusResearch: {
        source: focusIntelligence.source,
        coveredStocks: focusIntelligence.covered,
        scope: "持仓、强弹性、五倍股和估值质量重点样本"
      },
      earningsEvents: {
        source: tushareEarningsResult.source,
        forecastCount: tushareEarningsResult.forecastCount,
        expressCount: tushareEarningsResult.expressCount,
        coveredStocks: tushareEarningsResult.byCode.size
      },
      researchReport: {
        status: "需单独开通",
        note: "research_report研报全文/摘要接口不随10000积分自动开放；report_rc盈利预测已经接入。"
      }
    },
    trackedValueIdeas,
    trackedFiveXIdeas,
    trackedCandidates: buildTrackedCandidates(previous, dailyCandidates, candidateTrackingQuotes),
    tradeTracking: buildTradeTracking(previous, quoteMap, macro.riskLevel)
  };

  dashboard.macro.modelAnalysis = await buildModelAnalysis(dashboard, session);
  if (dashboard.macro.modelAnalysis.finalCommand) {
    dashboard.macro.finalCommand = dashboard.macro.modelAnalysis.finalCommand;
  }
  if (dashboard.macro.modelAnalysis.summary) {
    dashboard.macro.modelSummary = dashboard.macro.modelAnalysis.summary;
  }

  dashboard.dataHealth = buildSystemDataHealth({
    meta: dashboard.meta,
    marketRows: marketWideSnapshot,
    financialSummary: valueFinancialResult,
    announcementCoverage,
    publicNewsCandidates,
    globalMarkets,
    modelAnalysis: dashboard.macro.modelAnalysis
  });
  dashboard.chiefDecision = buildChiefDecision({
    marketRegime: macro.marketRegime,
    indices,
    internals: marketInternals,
    portfolioAdvice,
    events: unifiedEvents,
    dataHealth: dashboard.dataHealth,
    guidanceTarget: session.target,
    candidates: dailyCandidates,
    valueIdeas: oversoldValueIdeas,
    fiveXIdeas,
    modelAnalysis: dashboard.macro.modelAnalysis
  });
  const previousHistory = Array.isArray(previous.conclusionHistory) ? previous.conclusionHistory : [];
  const previousDecision = previous.chiefDecision?.marketStage?.regime || null;
  const currentDecision = dashboard.chiefDecision.marketStage.regime;
  dashboard.conclusionHistory = [
    ...previousHistory,
    ...(previousDecision !== currentDecision || !previousHistory.length ? [{
      changedAt: calculatedAt,
      from: previousDecision,
      to: currentDecision,
      basis: dashboard.chiefDecision.marketStage.basis,
      dataHealth: dashboard.dataHealth.degraded ? "降级" : "完整"
    }] : [])
  ].slice(-30);

  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/company-research.json", `${JSON.stringify({
    schemaVersion: "company-research-universe/1.0.0",
    generatedAt: calculatedAt,
    summary: companyResearchResult.summary,
    companies: companyResearchResult.list
  }, null, 2)}\n`, "utf8");
  await fs.writeFile("data/industry-map.json", `${JSON.stringify(independentIndustryMap, null, 2)}\n`, "utf8");
  await fs.writeFile("data/dashboard.json", `${JSON.stringify(dashboard, null, 2)}\n`, "utf8");
}

if (process.env.SKIP_DASHBOARD_MAIN !== "true") {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

export {
  elasticityCandidateType,
  elasticityFailureReasons,
  elasticityFundsScore,
  elasticityIndustryScore,
  elasticityMoatScore,
  elasticityProbabilityStars,
  elasticityStartupPhase,
  elasticityTrendScore,
  buildInstitutionalGrowthResearch,
  aggregateSellerConsensus,
  buildMarketWideValueResearch,
  buildRollingResearchPool,
  fetchEastmoneyAStockSnapshot,
  fetchEastmoneyValueFinancials,
  futureMarketCapSpace,
  growthPotentialScore,
  valuationSafetyScore
};

