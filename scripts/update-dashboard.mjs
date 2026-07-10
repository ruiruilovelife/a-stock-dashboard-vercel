import fs from "node:fs/promises";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_DAILY_MODEL = process.env.OPENAI_DAILY_MODEL || "gpt-5.4-mini";
const OPENAI_DEEP_MODEL = process.env.OPENAI_DEEP_MODEL || "gpt-5.6";
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

const IMPORTANT_ANNOUNCEMENT_RE = /业绩预告|业绩快报|半年度报告|季度报告|年度报告|减持|增持|回购|重大合同|订单|中标|投资|收购|问询|监管|风险提示|诉讼|仲裁|停牌|复牌|限售|解除限售|分红|利润分配/;

const INDICES = [
  ["sh000001", "上证指数"],
  ["sz399006", "创业板指"],
  ["sh000688", "科创50"]
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
  ["sz002851", "麦格米特", "002851", "电源/工控/新能源", "服务器电源、工控电源、新能源车电控", "服务器电源订单和工控恢复"],
  ["sh603688", "石英股份", "603688", "石英材料/半导体", "半导体石英材料、光伏石英砂", "半导体石英材料放量和价格变化"],
  ["sh688596", "正帆科技", "688596", "电子工艺设备", "半导体工艺设备、特气系统、洁净工程", "半导体客户订单和毛利率"],
  ["sz300567", "精测电子", "300567", "半导体/面板检测", "半导体检测、面板检测、先进封装", "检测设备订单和新客户验证"],
  ["sh688072", "拓荆科技", "688072", "半导体薄膜设备", "国产半导体设备、CVD/ALD", "设备订单和先进制程验证"],
  ["sh688361", "中科飞测", "688361", "半导体检测设备", "量检测设备国产替代、先进制程", "量检测设备订单和客户拓展"],
  ["sz300260", "新莱应材", "300260", "半导体洁净材料", "半导体洁净管阀、医药食品设备", "半导体客户放量和毛利率"],
  ["sz300395", "菲利华", "300395", "石英/军工材料", "半导体石英、航空航天材料、军工新材料", "半导体石英和军工订单"],
  ["sz000733", "振华科技", "000733", "军工电子", "军工电子元器件、国产替代", "军工订单和毛利率修复"],
  ["sh600760", "中航沈飞", "600760", "航空装备", "军机主机厂、航空装备景气", "军品订单和交付节奏"],
  ["sh600862", "中航高科", "600862", "航空复材", "航空复合材料、军工新材料", "复材订单和产能利用率"],
  ["sz300593", "新雷能", "300593", "军工电源", "军工电源、通信电源、航空航天", "军工电源订单和毛利率"],
  ["sz300413", "芒果超媒", "300413", "传媒/AI应用", "内容平台、AI应用、广告修复", "会员广告和内容成本"],
  ["sz300058", "蓝色光标", "300058", "AI营销", "AI应用、营销科技、出海广告", "AI营销收入和毛利改善"],
  ["sz300133", "华策影视", "300133", "影视/AI内容", "影视内容、AI视频、传媒修复", "内容储备和AI应用落地"],
  ["sh603444", "吉比特", "603444", "游戏", "游戏新品、分红、低估值修复", "新品流水和利润率"],
  ["sz002555", "三七互娱", "002555", "游戏/出海", "游戏出海、AI降本、分红", "新游流水和买量成本"],
  ["sh603259", "药明康德", "603259", "CXO/创新药", "CXO、海外订单、创新药外包", "订单恢复和地缘风险"],
  ["sh688506", "百利天恒", "688506", "创新药", "ADC创新药、出海授权、管线兑现", "临床数据和授权进展"],
  ["sh688266", "泽璟制药", "688266", "创新药", "创新药、商业化放量、医保", "产品放量和亏损收窄"],
  ["sz300015", "爱尔眼科", "300015", "医疗服务", "眼科医疗、消费医疗修复", "客流恢复和利润率"],
  ["sz002415", "海康威视", "002415", "安防/AI视觉", "安防、AI视觉、机器人感知", "海外收入和AI产品"],
  ["sz002236", "大华股份", "002236", "安防/AI视觉", "安防、AI视觉、低估值修复", "海外订单和利润率"],
  ["sz000651", "格力电器", "000651", "家电/红利", "家电、分红、消费修复", "空调销售、渠道和分红"],
  ["sh603195", "公牛集团", "603195", "消费电工", "消费电工、新能源充电、稳健现金流", "新品类放量和渠道库存"],
  ["sz300750", "宁德时代", "300750", "动力电池", "动力电池、储能、全球客户", "储能增速和毛利率"],
  ["sz300014", "亿纬锂能", "300014", "动力电池/储能", "动力电池、储能、消费电池", "储能订单和毛利率"],
  ["sz300274", "阳光电源", "300274", "光储逆变器", "储能、逆变器、海外需求", "储能订单和海外毛利"],
  ["sh601012", "隆基绿能", "601012", "光伏龙头", "光伏组件、BC电池、行业出清", "价格企稳和新技术放量"],
  ["sz002459", "晶澳科技", "002459", "光伏组件", "光伏组件、出海、周期修复", "组件价格和库存去化"],
  ["sh603806", "福斯特", "603806", "光伏胶膜", "光伏辅材、胶膜、感光干膜", "胶膜价格和盈利修复"],
  ["sh601872", "招商轮船", "601872", "航运/油运", "油运景气、全球贸易、红利", "运价和船队利用率"],
  ["sh600026", "中远海能", "600026", "油运", "油运周期、能源运输", "VLCC运价和分红"],
  ["sz000975", "山金国际", "000975", "黄金", "金价、资源股、避险", "金价和矿产金放量"],
  ["sh600489", "中金黄金", "600489", "黄金", "央企黄金、金价、资源整合", "金价和资源注入"],
  ["sz000807", "云铝股份", "000807", "电解铝", "铝价、水电铝、资源周期", "铝价和成本优势"],
  ["sh600426", "华鲁恒升", "600426", "煤化工", "煤化工、尿素、周期修复", "产品价差和新项目"],
  ["sz000830", "鲁西化工", "000830", "化工周期", "化工品价格、周期修复", "价差和开工率"],
  ["sh601601", "中国太保", "601601", "保险", "保险、资产端修复、高股息", "新业务价值和投资收益"],
  ["sh601688", "华泰证券", "601688", "券商", "券商、财富管理、市场风险偏好", "成交额和资本市场改革"],
  ["sz300033", "同花顺", "300033", "金融科技", "互联网金融、行情软件、AI投顾", "成交活跃度和AI产品"],
  ["sh600048", "保利发展", "600048", "地产龙头", "地产政策、央企地产、估值修复", "销售恢复和融资政策"],
  ["sz002271", "东方雨虹", "002271", "建材防水", "地产链、基建、消费建材", "地产需求和利润率修复"],
  ["sh603833", "欧派家居", "603833", "家居消费", "地产后周期、家居消费", "订单和渠道库存"]
];

const OVERSOLD_VALUE_POOL = [
  ["sh600048", "保利发展", "600048", "地产龙头", "地产政策、央企地产、估值修复", "销售恢复、融资政策、资产负债表安全", { pe: 8, pb: 0.5, roe: 6, dividend: 4.5, profitGrowth: -20, cashQuality: 0.7, size: "large" }],
  ["sz002271", "东方雨虹", "002271", "消费建材", "地产链修复、基建、防水龙头", "地产需求、应收改善、利润率修复", { pe: 18, pb: 1.3, roe: 7, dividend: 2, profitGrowth: -15, cashQuality: 0.7, size: "mid" }],
  ["sh603833", "欧派家居", "603833", "家居消费", "地产后周期、家居消费修复", "订单恢复、渠道库存、毛利率", { pe: 14, pb: 1.8, roe: 12, dividend: 4, profitGrowth: -10, cashQuality: 0.9, size: "mid" }],
  ["sh601012", "隆基绿能", "601012", "光伏龙头", "光伏行业出清、BC电池", "组件价格企稳、产能出清、现金流", { pe: null, pb: 1.2, roe: -5, dividend: 0, profitGrowth: -100, cashQuality: 0.4, size: "large" }],
  ["sz002459", "晶澳科技", "002459", "光伏组件", "光伏周期底部、出海", "库存去化、价格企稳、亏损收窄", { pe: null, pb: 0.9, roe: -8, dividend: 0, profitGrowth: -100, cashQuality: 0.4, size: "mid" }],
  ["sh603806", "福斯特", "603806", "光伏辅材", "胶膜周期修复、感光干膜", "胶膜价格、毛利率、库存", { pe: 24, pb: 2.5, roe: 11, dividend: 2, profitGrowth: -35, cashQuality: 0.7, size: "mid" }],
  ["sz300015", "爱尔眼科", "300015", "医疗服务", "消费医疗估值压缩", "客流、单店利润率、政策扰动缓和", { pe: 28, pb: 4.5, roe: 15, dividend: 0.8, profitGrowth: 5, cashQuality: 0.9, size: "large" }],
  ["sz300760", "迈瑞医疗", "300760", "医疗器械", "医疗设备龙头估值修复", "海外增长、招标恢复、毛利率", { pe: 22, pb: 6, roe: 28, dividend: 3.2, profitGrowth: 0, cashQuality: 1, size: "large" }],
  ["sh600276", "恒瑞医药", "600276", "创新药", "创新药出海、估值修复", "BD授权、管线进展、利润恢复", { pe: 45, pb: 6, roe: 13, dividend: 0.5, profitGrowth: 15, cashQuality: 0.9, size: "large" }],
  ["sz000333", "美的集团", "000333", "家电龙头", "家电出海、稳健现金流", "海外收入、毛利率、分红", { pe: 14, pb: 2.5, roe: 20, dividend: 4.2, profitGrowth: 10, cashQuality: 1, size: "large" }],
  ["sz002415", "海康威视", "002415", "安防AI", "低估值AI视觉、海外修复", "海外订单、AI产品、利润率", { pe: 18, pb: 2.4, roe: 15, dividend: 3, profitGrowth: 8, cashQuality: 0.9, size: "large" }],
  ["sz002236", "大华股份", "002236", "安防AI", "低估值修复、AI视觉", "海外收入、现金流、回购分红", { pe: 12, pb: 1.5, roe: 13, dividend: 3.5, profitGrowth: 8, cashQuality: 0.9, size: "mid" }],
  ["sz300274", "阳光电源", "300274", "光储逆变器", "储能出海、估值修复", "储能订单、海外毛利、汇率", { pe: 18, pb: 3.5, roe: 20, dividend: 1.2, profitGrowth: 15, cashQuality: 0.8, size: "large" }],
  ["sz002508", "老板电器", "002508", "厨电", "低估值、高分红、地产后周期", "分红、现金流、地产后周期需求", { pe: 11, pb: 1.7, roe: 15, dividend: 5.5, profitGrowth: 3, cashQuality: 1, size: "mid" }],
  ["sh603816", "顾家家居", "603816", "家居出口", "家居龙头、出口链、分红", "海外订单、利润率、分红", { pe: 13, pb: 2.1, roe: 16, dividend: 4.5, profitGrowth: 6, cashQuality: 0.9, size: "mid" }],
  ["sz002372", "伟星新材", "002372", "消费建材", "高ROE、高分红、现金流", "零售管材需求、分红、现金流", { pe: 18, pb: 3.5, roe: 20, dividend: 5.5, profitGrowth: 0, cashQuality: 1, size: "mid" }],
  ["sh603444", "吉比特", "603444", "游戏", "低估值、高分红、新品周期", "新品流水、分红、版号", { pe: 13, pb: 3, roe: 25, dividend: 6, profitGrowth: -5, cashQuality: 1, size: "small_mid" }],
  ["sz002555", "三七互娱", "002555", "游戏出海", "低估值、AI降本、游戏出海", "新游流水、买量成本、分红", { pe: 13, pb: 3, roe: 20, dividend: 5, profitGrowth: 5, cashQuality: 0.9, size: "mid" }],
  ["sh603338", "浙江鼎力", "603338", "工程机械出口", "高空作业平台、出口链、高ROE", "海外需求、关税、毛利率", { pe: 15, pb: 2.8, roe: 18, dividend: 2.5, profitGrowth: 12, cashQuality: 0.9, size: "mid" }],
  ["sz002984", "森麒麟", "002984", "轮胎出口", "轮胎出海、高ROE、扩产", "海外工厂、海运、毛利率", { pe: 13, pb: 2.2, roe: 18, dividend: 2, profitGrowth: 18, cashQuality: 0.8, size: "mid" }],
  ["sh603658", "安图生物", "603658", "体外诊断", "医疗器械估值压缩、现金流", "装机、试剂增长、集采影响", { pe: 18, pb: 3, roe: 16, dividend: 3, profitGrowth: 3, cashQuality: 0.9, size: "mid" }]
];

function pct(close, prevClose) {
  if (!prevClose) return 0;
  return Number((((close - prevClose) / prevClose) * 100).toFixed(2));
}

function amountText(value) {
  if (!Number.isFinite(value)) return "-";
  return `${(value / 100000000).toFixed(2)}亿`;
}

function parseSinaLine(line) {
  const match = line.match(/var hq_str_[^=]+="([^"]*)"/);
  if (!match) return null;
  const parts = match[1].split(",");
  if (parts.length < 32) return null;
  return {
    name: parts[0],
    open: Number(parts[1]),
    prevClose: Number(parts[2]),
    close: Number(parts[3]),
    high: Number(parts[4]),
    low: Number(parts[5]),
    volume: Number(parts[8]),
    amountRaw: Number(parts[9]),
    date: parts[30],
    time: parts[31]
  };
}

async function fetchSina(symbols) {
  const url = `https://hq.sinajs.cn/list=${symbols.join(",")}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      Referer: "https://finance.sina.com.cn",
      "User-Agent": "Mozilla/5.0"
    }
  });
  if (!res.ok) throw new Error(`Sina quote failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder("gb18030").decode(buf);
  return text.split(/\r?\n/).map(parseSinaLine).filter(Boolean);
}

function eastmoneySecid(symbol) {
  const code = symbol.replace(/^(sh|sz)/, "");
  return `${symbol.startsWith("sh") ? "1" : "0"}.${code}`;
}

function average(values) {
  const nums = values.filter(Number.isFinite);
  if (!nums.length) return NaN;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function pctRaw(current, base) {
  if (!Number.isFinite(current) || !Number.isFinite(base) || base === 0) return NaN;
  return ((current - base) / base) * 100;
}

async function fetchEastmoneyMarketCaps(pool) {
  const secids = pool.map(x => eastmoneySecid(x[0])).join(",");
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f12,f14,f116&secids=${secids}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) throw new Error(`Eastmoney market cap failed: ${res.status}`);
  const json = await res.json();
  const map = new Map();
  for (const row of json.data?.diff || []) {
    if (row.f12 && Number.isFinite(row.f116) && row.f116 > 0) {
      map.set(String(row.f12), Number((row.f116 / 100000000).toFixed(1)));
    }
  }
  return map;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function tushareCodeToAShareCode(tsCode) {
  return String(tsCode || "").split(".")[0];
}

function recentTradeDateCandidates(days = 10) {
  const dates = [];
  const now = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now.getTime() - i * 86400000);
    const day = d.getDay();
    if (day === 0 || day === 6) continue;
    dates.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`);
  }
  return dates;
}

async function fetchTushare(apiName, params, fields) {
  if (!TUSHARE_TOKEN) throw new Error("TUSHARE_TOKEN is not configured");
  const res = await fetch("https://api.tushare.pro", {
    method: "POST",
    signal: AbortSignal.timeout(30000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_name: apiName,
      token: TUSHARE_TOKEN,
      params,
      fields
    })
  });
  if (!res.ok) throw new Error(`Tushare ${apiName} failed: ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(`Tushare ${apiName} failed: ${json.msg || json.code}`);
  const columns = json.data?.fields || [];
  return (json.data?.items || []).map(item => Object.fromEntries(columns.map((field, index) => [field, item[index]])));
}

function cninfoPlate(symbol) {
  return symbol.startsWith("sh") ? "sh" : "sz";
}

function cninfoColumn(symbol) {
  return symbol.startsWith("sh") ? "sse" : "szse";
}

function recentDateRange(days = 7) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (date) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
  return `${fmt(start)}~${fmt(end)}`;
}

async function fetchCninfoAnnouncementsForStock(stock) {
  const symbol = stock.symbol || stock[0] || symbolFromCode(stock.code || stock[2]);
  const name = stock.name || stock[1];
  const code = stock.code || stock[2];
  const priority = stock.priority || "P2";
  const orgId = CNINFO_ORG_IDS[code] || TRACKED_EXTRA_CNINFO[code];
  if (!orgId) return [];
  const params = new URLSearchParams({
    stock: `${code},${orgId}`,
    searchkey: "",
    plate: cninfoPlate(symbol),
    category: "",
    trade: "",
    column: cninfoColumn(symbol),
    columnTitle: "历史公告查询",
    pageNum: "1",
    pageSize: "20",
    tabName: "fulltext",
    sortName: "",
    sortType: "",
    limit: "",
    seDate: recentDateRange(10)
  });
  const res = await fetch("http://www.cninfo.com.cn/new/hisAnnouncement/query", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": "Mozilla/5.0",
      Referer: `http://www.cninfo.com.cn/new/disclosure/stock?stockCode=${code}&orgId=${orgId}`
    },
    body: params.toString()
  });
  if (!res.ok) throw new Error(`Cninfo ${code} failed: ${res.status}`);
  const json = await res.json();
  return (json.announcements || [])
    .filter(item => IMPORTANT_ANNOUNCEMENT_RE.test(item.announcementTitle || ""))
    .map(item => ({
      date: chinaDateFromMs(item.announcementTime),
      source: "巨潮资讯",
      name,
      code,
      priority,
      title: item.announcementTitle,
      type: inferAnnouncementType(item.announcementTitle),
      importance: inferAnnouncementImportance(item.announcementTitle),
      url: `http://static.cninfo.com.cn/${item.adjunctUrl}`,
      facts: [],
      analystRead: "持仓公告已捕捉，必须优先核对原文并映射到仓位动作；未读原文前不下强结论。",
      action: "先列为持仓硬事件，结合公告原文、股价承接和板块资金再决定加减仓。",
      trigger: "公告内容利好且板块同步放量、个股高开后承接强。",
      fail: "公告利好兑现但高开低走、放量长上影，或公告内容存在低基数/一次性/现金流质量问题。"
    }));
}

function symbolFromCode(code = "") {
  if (String(code).startsWith("6")) return `sh${code}`;
  return `sz${code}`;
}

function chinaDateFromMs(ms) {
  if (!Number.isFinite(Number(ms))) return dateOnlyChina();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(Number(ms)));
}

function inferAnnouncementType(title = "") {
  if (/业绩预告|业绩快报|报告/.test(title)) return "财报/业绩";
  if (/减持|增持|回购/.test(title)) return "股东/资本动作";
  if (/合同|订单|中标/.test(title)) return "订单/合同";
  if (/问询|监管|风险/.test(title)) return "监管/风险";
  return "重要公告";
}

function inferAnnouncementImportance(title = "") {
  if (/业绩预告|业绩快报/.test(title)) return "高：直接影响估值和仓位等级";
  if (/减持|问询|监管|风险/.test(title)) return "高：先排风险";
  if (/合同|订单|中标/.test(title)) return "高：验证产业逻辑";
  return "中：需读原文判断";
}

async function fetchHoldingHardEvents(previous = {}, dailyCandidates = [], fiveXIdeas = [], valueIdeas = []) {
  const stockMap = new Map();
  const addStock = (stock, priority) => {
    if (!stock?.code || !stock?.name) return;
    if (!stockMap.has(stock.code)) {
      stockMap.set(stock.code, {
        symbol: stock.symbol || symbolFromCode(stock.code),
        name: stock.name,
        code: stock.code,
        priority
      });
    }
  };
  for (const [symbol, name, code] of STOCKS) addStock({ symbol, name, code }, "P0持仓");
  for (const item of previous.tradeTracking || []) addStock(item, item.status === "当前持仓" ? "P0持仓" : "P1跟踪");
  for (const item of previous.trackedCandidates || []) addStock(item, "P1强弹性跟踪");
  for (const item of previous.trackedFiveXIdeas || []) addStock(item, "P1五倍股跟踪");
  for (const item of previous.trackedValueIdeas || []) addStock(item, "P1估值质量跟踪");
  for (const item of dailyCandidates || []) addStock(item, "P2今日候选");
  for (const item of fiveXIdeas || []) addStock(item, "P2五倍候选");
  for (const item of valueIdeas || []) addStock(item, "P2估值候选");
  const fetched = [];
  const stocks = Array.from(stockMap.values())
    .filter(stock => CNINFO_ORG_IDS[stock.code] || TRACKED_EXTRA_CNINFO[stock.code])
    .slice(0, 80);
  const results = await Promise.allSettled(stocks.map(stock => fetchCninfoAnnouncementsForStock(stock)));
  for (const result of results) {
    if (result.status === "fulfilled") fetched.push(...result.value);
    else console.warn(`holding announcement fallback: ${result.reason?.message || result.reason}`);
  }
  const manualByKey = new Map(HOLDING_HARD_EVENTS.map(item => [`${item.code}-${item.title}`, item]));
  for (const item of fetched) {
    const key = `${item.code}-${item.title}`;
    if (!manualByKey.has(key)) manualByKey.set(key, item);
  }
  return Array.from(manualByKey.values())
    .filter(item => STOCKS.some(stock => stock[2] === item.code))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.name).localeCompare(String(b.name)))
    .slice(0, 30);
}

async function fetchTushareAStockSnapshot() {
  const basicsByCode = new Map();
  try {
    const basics = await fetchTushare("stock_basic", { list_status: "L" }, "ts_code,name,industry,market,exchange,list_status");
    for (const row of basics) {
      basicsByCode.set(row.ts_code, row);
    }
  } catch (error) {
    console.warn(`Tushare stock_basic fallback: ${error.message}`);
  }

  for (const tradeDate of recentTradeDateCandidates(12)) {
    const dailyBasic = await fetchTushare(
      "daily_basic",
      { trade_date: tradeDate },
      "ts_code,trade_date,close,turnover_rate,pe,pe_ttm,pb,total_mv,circ_mv"
    );
    if (!dailyBasic.length) continue;
    const dailyRows = await fetchTushare(
      "daily",
      { trade_date: tradeDate },
      "ts_code,trade_date,close,pct_chg,amount"
    ).catch(error => {
      console.warn(`Tushare daily fallback: ${error.message}`);
      return [];
    });
    const dailyByCode = new Map(dailyRows.map(row => [row.ts_code, row]));
    return dailyBasic.map(row => {
      const code = tushareCodeToAShareCode(row.ts_code);
      const basic = basicsByCode.get(row.ts_code) || {};
      const daily = dailyByCode.get(row.ts_code) || {};
      const close = toNumber(daily.close ?? row.close);
      const dayPct = toNumber(daily.pct_chg);
      return {
        code,
        name: basic.name || row.ts_code,
        industry: basic.industry || "未分行业",
        market: basic.market || "",
        exchange: basic.exchange || "",
        tradeDate: row.trade_date || daily.trade_date || tradeDate,
        close,
        dayPct,
        amountRaw: Number.isFinite(Number(daily.amount)) ? Number(daily.amount) * 1000 : null,
        turnover: toNumber(row.turnover_rate),
        pe: toNumber(row.pe),
        peTtm: toNumber(row.pe_ttm),
        pb: toNumber(row.pb),
        marketCapYi: Number.isFinite(Number(row.total_mv)) ? Number((Number(row.total_mv) / 10000).toFixed(1)) : null,
        floatCapYi: Number.isFinite(Number(row.circ_mv)) ? Number((Number(row.circ_mv) / 10000).toFixed(1)) : null,
        buyable: isBuyableAShareCode(code)
      };
    }).filter(row => row.code && row.name && Number.isFinite(row.close));
  }
  return [];
}

async function fetchJsonWithRetry(urls, label) {
  const list = Array.isArray(urls) ? urls : [urls];
  let lastError = null;
  for (const url of list) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(20000),
          headers: {
            "User-Agent": "Mozilla/5.0",
            Referer: "https://quote.eastmoney.com/"
          }
        });
        if (!res.ok) throw new Error(`${label} failed: ${res.status}`);
        return await res.json();
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, attempt * 600));
      }
    }
  }
  throw lastError || new Error(`${label} failed`);
}

async function fetchEastmoneyAStockSnapshot() {
  const rows = [];
  const pageSize = 100;
  const fs = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23";
  const fields = "f2,f3,f6,f8,f9,f12,f14,f20,f21,f23,f115";
  for (let page = 1; page <= 80; page += 1) {
    const query = `pn=${page}&pz=${pageSize}&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=${encodeURIComponent(fs)}&fields=${fields}`;
    const json = await fetchJsonWithRetry([
      `https://push2.eastmoney.com/api/qt/clist/get?${query}`,
      `http://push2.eastmoney.com/api/qt/clist/get?${query}`
    ], "Eastmoney A-share snapshot");
    const diff = json.data?.diff || [];
    if (!diff.length) break;
    for (const row of diff) {
      const code = String(row.f12 || "");
      rows.push({
        code,
        name: row.f14 || "",
        close: toNumber(row.f2),
        dayPct: toNumber(row.f3),
        amountRaw: toNumber(row.f6),
        turnover: toNumber(row.f8),
        pe: toNumber(row.f9),
        peTtm: toNumber(row.f115),
        pb: toNumber(row.f23),
        marketCapYi: Number.isFinite(Number(row.f20)) ? Number((Number(row.f20) / 100000000).toFixed(1)) : null,
        floatCapYi: Number.isFinite(Number(row.f21)) ? Number((Number(row.f21) / 100000000).toFixed(1)) : null,
        buyable: isBuyableAShareCode(code)
      });
    }
    if (diff.length < pageSize) break;
  }
  return rows;
}

async function fetchEastmoneyWeekly(symbol) {
  const secid = eastmoneySecid(symbol);
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=102&fqt=1&beg=20240101&end=20500101`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) throw new Error(`Eastmoney weekly failed: ${res.status}`);
  const json = await res.json();
  return (json.data?.klines || []).map(line => {
    const parts = String(line).split(",");
    return {
      date: parts[0],
      open: Number(parts[1]),
      close: Number(parts[2]),
      high: Number(parts[3]),
      low: Number(parts[4]),
      amount: Number(parts[6])
    };
  }).filter(k => Number.isFinite(k.close));
}

async function fetchTencentWeekly(symbol) {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},week,,,120,qfq`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) throw new Error(`Tencent weekly failed: ${res.status}`);
  const json = await res.json();
  const rows = json.data?.[symbol]?.qfqweek || json.data?.[symbol]?.week || [];
  return rows.map(row => ({
    date: row[0],
    open: Number(row[1]),
    close: Number(row[2]),
    high: Number(row[3]),
    low: Number(row[4]),
    amount: Number(row[5]) * Number(row[2])
  })).filter(k => Number.isFinite(k.close));
}

async function fetchWeekly(symbol) {
  try {
    return await fetchEastmoneyWeekly(symbol);
  } catch {
    return fetchTencentWeekly(symbol);
  }
}

function buildWeeklyProfile(klines) {
  const last52 = klines.slice(-52);
  const closes = last52.map(k => k.close);
  const highs = last52.map(k => k.high);
  const amounts = last52.map(k => k.amount);
  const last = closes.at(-1);
  const ma5 = average(closes.slice(-5));
  const ma10 = average(closes.slice(-10));
  const ma20 = average(closes.slice(-20));
  const ma20Prev = average(closes.slice(-24, -4));
  const high52 = Math.max(...highs.filter(Number.isFinite));
  const quarterBase = closes.at(-13);
  const yearBase = closes.at(0);
  const recent4Amount = average(amounts.slice(-4));
  const prior20Amount = average(amounts.slice(-24, -4));
  const lastWeekAmount = amounts.at(-1);
  const amountHigh52 = Math.max(...amounts.filter(Number.isFinite));
  const upAmounts = [];
  const downAmounts = [];

  for (let i = Math.max(1, closes.length - 12); i < closes.length; i += 1) {
    if (!Number.isFinite(amounts[i])) continue;
    if (closes[i] >= closes[i - 1]) upAmounts.push(amounts[i]);
    else downAmounts.push(amounts[i]);
  }

  const quarterReturn = pctRaw(last, quarterBase);
  const yearReturn = pctRaw(last, yearBase);
  const distanceToHighPct = pctRaw(last, high52);
  const weeklyTrendPass = last > ma20 && ma5 > ma10 && ma10 > ma20 && ma20 > ma20Prev;
  const positionPass = Number.isFinite(quarterReturn) && quarterReturn >= 20 && quarterReturn <= 80
    && (!Number.isFinite(yearReturn) || yearReturn <= 200)
    && Number.isFinite(distanceToHighPct) && distanceToHighPct >= -12;
  const volumeStairPass = recent4Amount > prior20Amount * 1.12;
  const upDownVolumePass = !downAmounts.length || average(upAmounts) > average(downAmounts) * 1.05;
  const noBlowoffPass = !Number.isFinite(amountHigh52) || lastWeekAmount < amountHigh52 * 0.92;

  return {
    weeklyTrendPass,
    positionPass,
    volumeStairPass,
    upDownVolumePass,
    noBlowoffPass,
    closeAbove20w: last > ma20,
    maQueue: ma5 > ma10 && ma10 > ma20,
    ma20Rising: ma20 > ma20Prev,
    quarterReturn: Number(quarterReturn.toFixed(1)),
    yearReturn: Number(yearReturn.toFixed(1)),
    distanceToHighPct: Number(distanceToHighPct.toFixed(1)),
    recent4AmountYi: Number((recent4Amount / 100000000).toFixed(1)),
    prior20AmountYi: Number((prior20Amount / 100000000).toFixed(1))
  };
}


function buildIndexTrendProfile(profile, dayPct) {
  if (!profile) {
    return {
      status: "趋势待确认",
      score: 0,
      read: "只拿到当日涨跌，暂不能下中期结论。",
      action: "不因为单日红绿改变仓位，等周线和全A宽度确认。"
    };
  }
  let score = 0;
  if (profile.closeAbove20w) score += 2;
  else score -= 2;
  if (profile.maQueue) score += 1;
  if (profile.ma20Rising) score += 2;
  else score -= 1;
  if (Number(profile.quarterReturn) > 8) score += 1;
  if (Number(profile.quarterReturn) < -8) score -= 1;
  if (profile.volumeStairPass && Number(dayPct) > 0) score += 1;
  if (profile.volumeStairPass && Number(dayPct) < -1) score -= 1;

  const status = score >= 4
    ? "中期上行"
    : score >= 2
      ? "震荡偏强"
      : score <= -3
        ? "中期破位"
        : "震荡偏弱";
  const read = [
    profile.closeAbove20w ? "在20周线上方" : "低于20周线",
    profile.ma20Rising ? "20周线向上" : "20周线未上行",
    profile.maQueue ? "5/10/20周线排队" : "均线未排队",
    Number.isFinite(Number(profile.quarterReturn)) ? `近3个月${profile.quarterReturn}%` : "近3个月待确认",
    Number.isFinite(Number(profile.distanceToHighPct)) ? `距52周高点${profile.distanceToHighPct}%` : "52周位置待确认"
  ].join("，");
  const action = status === "中期上行"
    ? "指数趋势支持结构性进攻，但仍要看成交额和主线扩散。"
    : status === "震荡偏强"
      ? "可以做强主线，不适合全面加仓。"
      : status === "中期破位"
        ? "指数趋势不支持重仓进攻，先降弱势和高波动仓。"
        : "指数趋势偏弱，仓位跟随板块确认，不提前押满。";
  return { status, score, read, action };
}

async function fetchWeeklyProfiles(pool) {
  const map = new Map();
  for (let i = 0; i < pool.length; i += 4) {
    const batch = pool.slice(i, i + 4);
    const pairs = await Promise.all(batch.map(async item => {
      try {
        const klines = await fetchWeekly(item[0]);
        return [item[2], buildWeeklyProfile(klines)];
      } catch {
        return [item[2], null];
      }
    }));
    for (const [code, profile] of pairs) {
      map.set(code, profile);
    }
  }
  return map;
}

function parseGlobalSinaLine(line) {
  const match = line.match(/var hq_str_([^=]+)="([^"]*)"/);
  if (!match || !match[2]) return null;
  const symbol = match[1];
  const parts = match[2].split(",");
  const meta = GLOBAL_SINA_SYMBOLS.find(x => x[0] === symbol);
  if (!meta) return null;
  if (symbol.startsWith("gb_")) {
    return {
      name: meta[1],
      close: Number(parts[1]),
      pct: Number(parts[2]),
      time: parts[2] ? parts[3] : ""
    };
  }
  if (symbol === "b_NKY" || symbol === "b_HSI") {
    return {
      name: meta[1],
      close: Number(parts[1]),
      pct: Number(parts[3]),
      time: `${parts[5] || ""} ${parts[6] || ""}`.trim()
    };
  }
  return null;
}

async function fetchGlobalSina() {
  const url = `https://hq.sinajs.cn/list=${GLOBAL_SINA_SYMBOLS.map(x => x[0]).join(",")}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      Referer: "https://finance.sina.com.cn",
      "User-Agent": "Mozilla/5.0"
    }
  });
  if (!res.ok) throw new Error(`Sina global quote failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder("gb18030").decode(buf);
  return text.split(/\r?\n/).map(parseGlobalSinaLine).filter(Boolean);
}

async function fetchYahooIndex(symbol, name) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) return null;
  const json = await res.json();
  const result = json.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close?.filter(v => Number.isFinite(v));
  if (!closes || closes.length < 2) return null;
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  return {
    name,
    close: Number(last.toFixed(2)),
    pct: Number((((last - prev) / prev) * 100).toFixed(2)),
    time: "Yahoo 5d daily"
  };
}

function validGlobalQuote(quote) {
  const pctValue = Number(quote?.pct);
  const closeValue = Number(quote?.close);
  return quote
    && Number.isFinite(pctValue)
    && Number.isFinite(closeValue)
    && closeValue > 0
    && Math.abs(pctValue) <= 10;
}

async function fetchThsKospi() {
  const urls = [
    "https://d.10jqka.com.cn/v6/time/48_KOSPI/last.js",
    "https://d.10jqka.com.cn/v6/line/48_KOSPI/01/last.js",
    "https://q.10jqka.com.cn/api.php?t=indexflash&code=KOSPI"
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        headers: {
          Referer: "https://www.10jqka.com.cn/",
          "User-Agent": "Mozilla/5.0"
        }
      });
      if (!res.ok) continue;
      const text = await res.text();
      const pctMatch = text.match(/(?:涨跌幅|fluctuationsRatio|zdf|rate|percent)["':：=\s]+(-?\d+(?:\.\d+)?)/i);
      const closeMatch = text.match(/(?:最新|close|price|10jqka_cur|zj)["':：=\s]+(\d+(?:\.\d+)?)/i);
      const quote = {
        name: "韩国KOSPI",
        close: closeMatch ? Number(closeMatch[1]) : NaN,
        pct: pctMatch ? Number(pctMatch[1]) : NaN,
        time: "同花顺KOSPI"
      };
      if (validGlobalQuote(quote)) return quote;
    } catch {
      // Try the next endpoint, then fall back to the Korean local source.
    }
  }
  return null;
}

async function fetchNaverKospi() {
  const url = "https://m.stock.naver.com/api/index/KOSPI/basic";
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: {
      Referer: "https://m.stock.naver.com/",
      "User-Agent": "Mozilla/5.0"
    }
  });
  if (!res.ok) return null;
  const json = await res.json();
  const close = Number(String(json.closePrice || "").replace(/,/g, ""));
  const pctValue = Number(String(json.fluctuationsRatio || "").replace("%", ""));
  const tradedAt = json.localTradedAt ? String(json.localTradedAt).slice(0, 10) : "最新交易日";
  const quote = {
    name: "韩国KOSPI",
    close: Number(close.toFixed(2)),
    pct: Number(pctValue.toFixed(2)),
    time: `Naver/韩国本土行情 ${tradedAt}`
  };
  return validGlobalQuote(quote) ? quote : null;
}

async function fetchKospiQuote(previous) {
  const ths = await fetchThsKospi();
  if (validGlobalQuote(ths)) return ths;
  const naver = await fetchNaverKospi();
  if (validGlobalQuote(naver)) return naver;
  const previousKospi = previous.macro?.globalMarkets?.find(x => x.name === "韩国KOSPI");
  if (validGlobalQuote(previousKospi)) {
    return {
      ...previousKospi,
      pct: NaN,
      time: "韩国行情源暂不可用；保留旧收盘点位但不参与判断"
    };
  }
  return {
    name: "韩国KOSPI",
    close: null,
    pct: NaN,
    time: "韩国行情源暂不可用；等待下次更新"
  };
}

function riskFor(stock) {
  if (stock.name === "富特科技") {
    if (stock.pct < -3 || stock.accountReturnPct < 0) return ["成长仓风控", "仓位约22%，不再按重仓处理；若跌破当日低点或放量转弱，先看高压快充板块是否共振，弱则降风险。"];
    if (stock.pct > 0) return ["成长仓持有", "今天强于组合，但只持有不追加；冲高放量滞涨可落袋一部分，等财报/订单确认。"];
    return ["成长仓持有", "小幅波动先持有观察；若不能守住短线趋势，按高波动成长仓控制回撤。"];
  }
  if (stock.name === "浪潮信息") {
    if (HOLDING_HARD_EVENTS.some(event => event.code === "000977" && /业绩预告/.test(event.title))) {
      return ["业绩兑现主线仓", "2026H1业绩预告大超预期：归母净利预计26.0-31.0亿元，同比+226%-288%；扣非同比+206%-280%。持有并看明天承接，不追高加仓。"];
    }
    if (stock.pct < -3) return ["新仓止损线", "新切入AI服务器方向不能变成被套仓，跌破买入区且板块走弱就减半验证。"];
    if (stock.pct > 3) return ["新仓验证成功一半", "调入国产算力方向是对的，明天看AI服务器/PCB/工业富联链是否延续，延续才持有。"];
    return ["新仓验证", "只按试错仓处理，不补仓；确认条件是AI服务器、PCB、国产算力同步放量。"];
  }
  if (stock.name === "江丰电子") {
    if (stock.pct < -2 || stock.accountReturnPct < -12) return ["弱势修复仓", "仓位仍不小，若材料链明天不能放量反包，继续降到10%以内。"];
    return ["修复观察", "只在韩国/日经半导体止跌且A股材料链放量时保留，不加仓。"];
  }
  if (stock.name === "巨化股份") {
    if (stock.pct < -3 || stock.accountReturnPct < -3) return ["周期仓验证", "制冷剂/氟化工是新切入的非科技方向，若价格链和板块不配合，不能拖成亏损仓。"];
    if (stock.pct > 2) return ["周期仓加强", "若制冷剂、氟化工和资源周期同步放量，调仓方向有望成为科技外的对冲线。"];
    return ["周期仓观察", "看制冷剂价格、三代制冷剂配额、氟化工板块成交额；不确认不加仓。"];
  }
  if (stock.name === "欣锐科技") {
    if (stock.pct < -3 || stock.accountReturnPct < -5) return ["高波动验证仓", "和富特同属高压快充/车载电源映射，若板块不共振，先控制亏损扩大。"];
    if (stock.pct > 2) return ["验证仓转强", "若新能源车高压快充链同步回流，可继续验证，但不能和富特形成同方向过度集中。"];
    return ["验证仓观察", "主要用来验证富特逻辑是不是板块共振；富特强、欣锐弱时，不加仓欣锐。"];
  }
  return ["观察", "等待资金确认。"];
}

function candidateTechnical(q, profile) {
  const { climbScore, heatLevel, weekly } = profile;
  if (heatLevel === "过热") return "日线已经明显放量冲高，只能等高位横盘或回踩10周线确认，不能追连续大阳。";
  if (weekly?.yearReturn > 150 && weekly?.yearReturn <= 230) return "趋势已经走出一大段，不属于早期潜伏；只能作为强趋势跟踪，等待横盘消化或回踩确认。";
  if (weekly?.weeklyTrendPass && weekly?.positionPass && climbScore >= 8) return "周K硬筛通过：20周线上方、均线排队、3个月涨幅合适、接近52周高点，适合重点跟踪平台突破或回踩不破。";
  if (climbScore >= 7) return "处在启动初中期：周线结构或量能已经出现爬坡特征，但还需要成交额和板块共振继续确认。";
  return "属于潜伏观察：逻辑可看，但技术和资金确认不足，不能提前重仓。";
}

function candidateTrigger(theme) {
  if (theme.includes("封装") || theme.includes("PCB") || theme.includes("光模块") || theme.includes("算力")) {
    return "AI硬件/国产算力板块放量回流，个股站上5日线且成交额放大。";
  }
  if (theme.includes("半导体") || theme.includes("CMP") || theme.includes("光刻胶") || theme.includes("特气")) {
    return "半导体材料/设备板块止跌反包，核心股不再冲高回落。";
  }
  if (theme.includes("功率") || theme.includes("IGBT")) {
    return "功率半导体板块止跌，新能源车链同步修复。";
  }
  return "所属主线放量走强，个股突破短期平台。";
}

function candidateFail(theme) {
  if (theme.includes("算力") || theme.includes("光模块") || theme.includes("PCB")) {
    return "海外AI硬件继续调整，或板块放量冲高回落。";
  }
  if (theme.includes("半导体") || theme.includes("CMP") || theme.includes("光刻胶")) {
    return "科创50继续破位，半导体材料核心股继续下跌。";
  }
  return "指数弱势、放量不涨或跌破前一日低点。";
}

function candidateIndustryScore(theme) {
  if (theme.includes("光模块") || theme.includes("PCB") || theme.includes("算力") || theme.includes("先进封装")) return 1.5;
  if (theme.includes("半导体") || theme.includes("CMP") || theme.includes("光刻胶") || theme.includes("特气") || theme.includes("设备")) return 1.4;
  if (theme.includes("功率") || theme.includes("IGBT")) return 1.3;
  return 1;
}

function candidateMarketCapScore(marketCapYi) {
  if (!Number.isFinite(marketCapYi)) return 0.8;
  if (marketCapYi >= 80 && marketCapYi <= 300) return 1.5;
  if (marketCapYi > 300 && marketCapYi <= 600) return 1;
  if (marketCapYi >= 50 && marketCapYi < 80) return 0.8;
  return 0.4;
}

function candidateFinancialScore(edge) {
  if (/订单|产能|毛利|验证|交付|盈利|稼动率/.test(edge)) return 1.5;
  if (/需求|修复|改善/.test(edge)) return 1.2;
  return 0.8;
}

function candidateClimbProfile(q, meta, weekly, marketCapYi) {
  const theme = meta[3];
  const financialEdge = meta[5] || "等待公告和财报验证";
  const dayPct = pct(q.close, q.prevClose);
  const amountYi = q.amountRaw / 100000000;
  const rangePct = q.prevClose ? ((q.high - q.low) / q.prevClose) * 100 : 0;
  const closePosition = q.high > q.low ? (q.close - q.low) / (q.high - q.low) : 0.5;
  const heatLevel = dayPct > 7 || (rangePct > 12 && closePosition < 0.65) ? "过热" : dayPct > 3 ? "偏热" : "不热";

  let weeklyTrendScore = 0;
  if (weekly?.closeAbove20w) weeklyTrendScore += 0.5;
  if (weekly?.maQueue) weeklyTrendScore += 0.7;
  if (weekly?.ma20Rising) weeklyTrendScore += 0.5;
  if (weekly?.positionPass) weeklyTrendScore += 0.8;
  if (!weekly && dayPct > -3 && dayPct < 7) weeklyTrendScore = 1;

  let volumeScore = 0;
  if (weekly?.volumeStairPass) volumeScore += 0.8;
  if (weekly?.upDownVolumePass) volumeScore += 0.7;
  if (weekly?.noBlowoffPass && heatLevel !== "过热") volumeScore += 0.5;
  if (!weekly) {
    if (amountYi >= 10) volumeScore += 0.8;
    if (amountYi >= 30 && heatLevel !== "过热") volumeScore += 0.7;
  }

  let structureScore = 0;
  if (rangePct >= 2 && rangePct <= 10) structureScore += 0.5;
  if (dayPct > -3 && dayPct < 6) structureScore += 0.5;

  const industryScore = candidateIndustryScore(theme);
  const marketCapScore = candidateMarketCapScore(marketCapYi);
  const financialScore = candidateFinancialScore(financialEdge);
  let positionPenalty = 0;
  if (weekly && (!Number.isFinite(weekly.quarterReturn) || weekly.quarterReturn < 20 || weekly.quarterReturn > 80)) positionPenalty += 0.8;
  if (weekly && Number.isFinite(weekly.yearReturn) && weekly.yearReturn > 200) positionPenalty += 1.4;
  if (weekly && Number.isFinite(weekly.distanceToHighPct) && weekly.distanceToHighPct < -12) positionPenalty += 0.7;
  if (heatLevel === "过热") positionPenalty += 1;
  const climbScore = Number(Math.max(0, weeklyTrendScore + volumeScore + structureScore + industryScore + marketCapScore + financialScore - positionPenalty).toFixed(1));

  return {
    dayPct,
    amountYi,
    rangePct,
    heatLevel,
    weekly,
    weeklyTrendScore: Number(weeklyTrendScore.toFixed(1)),
    volumeScore: Number(volumeScore.toFixed(1)),
    structureScore: Number(structureScore.toFixed(1)),
    industryScore,
    marketCapScore,
    financialScore,
    marketCapYi,
    financialEdge,
    positionPenalty: Number(positionPenalty.toFixed(1)),
    climbScore
  };
}

function candidatePhase(profile) {
  if (profile.weekly && profile.weekly.yearReturn > 230) return "主升后段/趋势锚";
  if (profile.weekly && (profile.weekly.quarterReturn > 80 || profile.weekly.yearReturn > 150)) return "趋势中段/不算早期";
  if (profile.heatLevel === "过热") return "冲刺后段/等回踩";
  if (profile.weekly?.weeklyTrendPass && profile.weekly?.positionPass && profile.climbScore >= 8) return "周线爬坡转强";
  if (profile.climbScore >= 7) return "启动初中期";
  return "潜伏观察";
}

function candidateBuyPoint(phase) {
  if (phase === "周线爬坡转强") return "优先等周线平台放量突破，或突破后第一次回踩10日线/10周线不破。";
  if (phase === "启动初中期") return "只做跟踪，不急买；等5/10/20周线排队、成交额中枢抬升后再升级。";
  if (phase === "趋势中段/不算早期") return "不是早期票，只能等高位横盘消化或回踩10周线不破后小仓验证，不能按潜伏票重仓。";
  if (phase === "冲刺后段/等回踩") return "不追；等高位横盘3到5周后再次放量突破，或回踩不破再评估。";
  return "先观察行业催化和量能，不因题材好提前买。";
}

function candidateNoBuySignal() {
  return "连续大阳、历史天量长上影、跌破20周线、只剩题材但股价仍在下降趋势。";
}

function rotateList(items, seed) {
  if (!items.length) return items;
  const offset = seed % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function isTrackableCandidate(c) {
  return c
    && isBuyableAShareCode(c.code)
    && Number(c.climbScore) >= 6.5
    && Number(c.fiveXScore ?? 0) >= 6.5
    && Number.isFinite(Number(c.quarterReturn))
    && Number.isFinite(Number(c.yearReturn))
    && Number.isFinite(Number(c.distanceToHighPct))
    && (!Number.isFinite(Number(c.yearReturn)) || Number(c.yearReturn) <= 230)
    && c.heatLevel !== "过热"
    && c.phase !== "主升后段/趋势锚"
    && c.phase !== "冲刺后段/等回踩";
}

function isBuyableAShareCode(code) {
  const text = String(code || "");
  if (/^(688|689)/.test(text)) return false;
  if (/^[89]/.test(text)) return false;
  return true;
}

function fiveXSimilarity(profile, theme) {
  const weekly = profile.weekly || {};
  let score = 0;
  if (weekly.weeklyTrendPass) score += 2;
  if (weekly.volumeStairPass) score += 2;
  if (weekly.upDownVolumePass) score += 1;
  if (weekly.positionPass) score += 1;
  if (weekly.quarterReturn >= 20 && weekly.quarterReturn <= 80) score += 2;
  if (weekly.yearReturn <= 230) score += 1;
  if (Number.isFinite(profile.marketCapYi) && profile.marketCapYi >= 30 && profile.marketCapYi <= 300) score += 2;
  if (profile.financialScore >= 1.5) score += 1;
  if (/AI|算力|PCB|光模块|机器人|低空|创新药|半导体|材料|涨价|高压|液冷|电源|军工|有色|资源/.test(theme)) score += 1;
  return Math.min(10, score);
}

function fiveXRead(score) {
  if (score >= 8) return "高相似：接近历史5倍股早中期画像，需重点盯催化兑现和量能延续。";
  if (score >= 6.5) return "中高相似：具备部分主升前特征，适合滚动跟踪，不适合一次性重仓。";
  if (score >= 5) return "中性：题材或形态有亮点，但还缺量能、位置或财务确认。";
  return "低相似：离历史5倍股启动模型较远，只作普通观察。";
}

function buildCandidates(quotes, previous, weeklyProfiles, marketCaps) {
  const metaByName = new Map(CANDIDATE_POOL.map(x => [x[1], x]));
  const previousByCode = new Map((previous.candidates || []).map(c => [c.code, c]));
  const today = dateOnlyChina();
  const seed = Number(today.replaceAll("-", ""));
  const previousDailyCodes = new Set((previous.candidates || []).map(c => c.code));
  const previousTrackedCodes = new Set((previous.trackedCandidates || []).map(c => c.code));
  const scored = quotes.map(q => {
    const meta = metaByName.get(q.name);
    if (!meta) return null;
    const previousItem = previousByCode.get(meta[2]);
    const previousWeekly = previousItem ? {
      closeAbove20w: previousItem.closeAbove20w,
      maQueue: previousItem.maQueue,
      ma20Rising: previousItem.ma20Rising,
      volumeStairPass: previousItem.volumeStairPass,
      upDownVolumePass: previousItem.upDownVolumePass,
      noBlowoffPass: previousItem.noBlowoffPass,
      positionPass: previousItem.positionPass,
      weeklyTrendPass: previousItem.weeklyTrendPass,
      quarterReturn: previousItem.quarterReturn,
      yearReturn: previousItem.yearReturn,
      distanceToHighPct: previousItem.distanceToHighPct
    } : null;
    const weekly = weeklyProfiles.get(meta[2]) || previousWeekly;
    const marketCapYi = marketCaps.get(meta[2]);
    const profile = candidateClimbProfile(q, meta, weekly, marketCapYi);
    const { dayPct, amountYi, rangePct } = profile;
    let score = 0;
    if (dayPct > 0) score += 2;
    if (dayPct > 3) score += 2;
    if (dayPct > 6) score += 1;
    if (amountYi > 20) score += 2;
    if (amountYi > 50) score += 1;
    if (rangePct > 4 && dayPct > -2) score += 1;
    const styleBonusThemes = [
      "先进封装/HBM", "AI服务器PCB", "光模块", "国产算力", "CMP抛光液/半导体材料",
      "红利", "高股息", "煤炭", "电力", "运营商",
      "有色", "化工", "资源", "白酒", "家电", "创新药", "医疗器械",
      "券商", "保险", "船舶", "工程机械", "出口链", "新能源车整车"
    ];
    if (styleBonusThemes.some(t => meta[3].includes(t))) score += 1;
    const phase = candidatePhase(profile);
    const fiveXScore = fiveXSimilarity(profile, meta[3]);
    return {
      name: q.name,
      code: meta[2],
      theme: meta[3],
      news: meta[4],
      financialEdge: profile.financialEdge,
      score,
      climbScore: profile.climbScore,
      fiveXScore,
      fiveXRead: fiveXRead(fiveXScore),
      phase,
      dayPct,
      amount: amountText(q.amountRaw),
      marketCapYi: Number.isFinite(profile.marketCapYi) ? profile.marketCapYi : null,
      quarterReturn: profile.weekly?.quarterReturn ?? null,
      yearReturn: profile.weekly?.yearReturn ?? null,
      distanceToHighPct: profile.weekly?.distanceToHighPct ?? null,
      closeAbove20w: profile.weekly?.closeAbove20w ?? null,
      maQueue: profile.weekly?.maQueue ?? null,
      ma20Rising: profile.weekly?.ma20Rising ?? null,
      volumeStairPass: profile.weekly?.volumeStairPass ?? null,
      upDownVolumePass: profile.weekly?.upDownVolumePass ?? null,
      noBlowoffPass: profile.weekly?.noBlowoffPass ?? null,
      positionPass: profile.weekly?.positionPass ?? null,
      weeklyTrendPass: profile.weekly?.weeklyTrendPass ?? null,
      rangePct: Number(rangePct.toFixed(2)),
      weeklyTrendScore: profile.weeklyTrendScore,
      volumeScore: profile.volumeScore,
      structureScore: profile.structureScore,
      industryScore: profile.industryScore,
      marketCapScore: profile.marketCapScore,
      financialScore: profile.financialScore,
      heatLevel: profile.heatLevel,
      technical: candidateTechnical(q, profile),
      trigger: candidateTrigger(meta[3]),
      fail: candidateFail(meta[3]),
      buyPoint: candidateBuyPoint(phase),
      noBuySignal: candidateNoBuySignal(),
      close: Number(q.close.toFixed(2))
    };
  }).filter(c => c && Number.isFinite(c.close));

  const selected = [];
  const add = item => {
    if (item && !selected.some(x => x.code === item.code)) selected.push(item);
  };

  scored
    .filter(c => isTrackableCandidate(c) && c.climbScore >= 7.5)
    .filter(c => c.closeAbove20w !== false)
    .sort((a, b) => b.climbScore - a.climbScore || b.score - a.score)
    .slice(0, 3)
    .forEach(add);

  const earlyCycle = scored
    .filter(c => !selected.some(x => x.code === c.code))
    .filter(c => !previousDailyCodes.has(c.code) || !previousTrackedCodes.has(c.code))
    .filter(c => isTrackableCandidate(c) && c.dayPct > -4)
    .sort((a, b) => b.climbScore - a.climbScore || b.rangePct - a.rangePct);

  rotateList(earlyCycle, seed).slice(0, 2).forEach(add);

  scored
    .filter(c => !selected.some(x => x.code === c.code))
    .filter(c => isTrackableCandidate(c))
    .filter(c => !c.yearReturn || c.yearReturn <= 220)
    .sort((a, b) => b.score - a.score || b.dayPct - a.dayPct)
    .forEach(add);

  scored
    .filter(c => !selected.some(x => x.code === c.code))
    .filter(c => isTrackableCandidate(c))
    .sort((a, b) => b.climbScore - a.climbScore || b.score - a.score)
    .forEach(add);

  return selected
    .filter(item => isTrackableCandidate(item))
    .slice(0, 5)
    .map((item, index) => ({
    ...item,
    selectionReason: index < 3 && item.climbScore >= 7.5
      ? "周K优先筛选靠前：趋势、量能、市值弹性、行业逻辑和财务边际同时有分。"
      : "轮动加入启动初中期/潜伏样本，重点找富特科技40元附近那种刚走出来的状态。"
  }));
}

function buildMarketWideCandidates(snapshot) {
  return (snapshot || [])
    .filter(row => row.buyable)
    .filter(row => !/^ST|^\*ST/.test(row.name || ""))
    .filter(row => Number(row.close) > 3)
    .filter(row => Number(row.marketCapYi) >= 40 && Number(row.marketCapYi) <= 600)
    .filter(row => Number(row.dayPct) > -2 && Number(row.dayPct) < 8)
    .filter(row => Number(row.turnover) >= 0.8 && Number(row.turnover) <= 12)
    .map(row => {
      const pe = Number(row.peTtm ?? row.pe);
      const pb = Number(row.pb);
      let climbScore = 0;
      if (Number(row.dayPct) > 0) climbScore += 1.2;
      if (Number(row.dayPct) > 3) climbScore += 0.8;
      if (Number(row.amountRaw) / 100000000 >= 3) climbScore += 1.2;
      if (Number(row.turnover) >= 1.5 && Number(row.turnover) <= 8) climbScore += 1.2;
      if (Number(row.marketCapYi) >= 80 && Number(row.marketCapYi) <= 300) climbScore += 1.2;
      else climbScore += 0.6;
      if (Number.isFinite(pe) && pe > 0 && pe <= 60) climbScore += 0.8;
      if (Number.isFinite(pb) && pb > 0 && pb <= 5) climbScore += 0.6;
      climbScore = Number(Math.min(10, climbScore + 1.5).toFixed(1));
      const fiveXScore = Number(Math.min(10, climbScore + (Number(row.marketCapYi) <= 300 ? 1 : 0)).toFixed(1));
      return {
        name: row.name,
        code: row.code,
        theme: "全市场快照候选",
        news: "由全A快照按可买权限、市值、换手、成交额、PE/PB和当日承接筛出；后续必须补周线、财报和产业逻辑。",
        financialEdge: "待补查公告、财报、ROE、现金流和行业景气",
        score: climbScore,
        climbScore,
        fiveXScore,
        fiveXRead: fiveXRead(fiveXScore),
        phase: "全市场初筛/待历史行情",
        dayPct: row.dayPct,
        amount: amountText(row.amountRaw),
        marketCapYi: row.marketCapYi,
        pe: row.pe,
        peTtm: row.peTtm,
        pb: row.pb,
        turnover: row.turnover,
        quarterReturn: "待补历史行情",
        yearReturn: "待补历史行情",
        distanceToHighPct: "待补历史行情",
        closeAbove20w: null,
        maQueue: null,
        ma20Rising: null,
        volumeStairPass: null,
        upDownVolumePass: null,
        noBlowoffPass: null,
        positionPass: null,
        weeklyTrendPass: null,
        rangePct: null,
        weeklyTrendScore: "-",
        volumeScore: "-",
        structureScore: "-",
        industryScore: "-",
        marketCapScore: "-",
        financialScore: "-",
        heatLevel: Number(row.dayPct) > 5 ? "偏热" : "不热",
        technical: "全市场快照初筛通过，但缺少周K/年线/量能历史行情，不能进入强弹性正式候选。",
        trigger: "补查周K站上20周线、成交额中枢抬升、行业有催化后再升级。",
        fail: "PE/PB低但利润下修、换手异常放大冲高回落、或补查周线仍在下降趋势。",
        buyPoint: "补齐周K、年线、量能和财报后再决定是否小仓验证。",
        noBuySignal: "未完成周线/财报核验前不买；低PE/PB不能替代产业逻辑。",
        close: row.close,
        selectionReason: "全市场快照筛出，不来自手工股票池。"
      };
    })
    .filter(c => c.fiveXScore >= 6.5)
    .sort((a, b) => b.fiveXScore - a.fiveXScore || b.dayPct - a.dayPct)
    .slice(0, 5);
}

function dateOnlyChina() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function daysBetween(dateA, dateB) {
  const a = new Date(`${dateA}T00:00:00+08:00`).getTime();
  const b = new Date(`${dateB}T00:00:00+08:00`).getTime();
  return Math.floor((b - a) / 86400000);
}

async function readPreviousDashboard() {
  try {
    const raw = await fs.readFile("data/dashboard.json", "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function buildTrackedCandidates(previous, dailyCandidates, allCandidateQuotes) {
  const today = dateOnlyChina();
  const quoteByName = new Map(allCandidateQuotes.map(q => [q.name, q]));
  const quoteByCode = new Map(allCandidateQuotes.map(q => [q.code, q]));
  const dailyByCode = new Map(dailyCandidates.map(c => [c.code, c]));
  const previousTracked = Array.isArray(previous.trackedCandidates) ? previous.trackedCandidates : [];
  const trackedByCode = new Map();

  for (const item of previousTracked) {
    if (!item.code) continue;
    const score = Number(item.climbScore ?? item.score);
    const stillQualified = isBuyableAShareCode(item.code)
      && Number.isFinite(score)
      && score >= 6.5
      && Number(item.fiveXScore ?? 0) >= 6.5
      && (!Number.isFinite(Number(item.yearReturn)) || Number(item.yearReturn) <= 230)
      && item.phase !== "主升后段/趋势锚"
      && item.phase !== "冲刺后段/等回踩";
    const last = item.lastSelectedDate || item.firstTrackedDate || today;
    if ((stillQualified && daysBetween(last, today) <= 30) || dailyByCode.has(item.code)) {
      trackedByCode.set(item.code, { ...item });
    }
  }

  for (const c of dailyCandidates) {
    const existing = trackedByCode.get(c.code);
    if (existing) {
      existing.lastSelectedDate = today;
      existing.theme = c.theme;
      existing.news = c.news;
      existing.score = c.score;
      existing.climbScore = c.climbScore;
      existing.fiveXScore = c.fiveXScore;
      existing.fiveXRead = c.fiveXRead;
      existing.phase = c.phase;
      existing.selectionReason = c.selectionReason;
      existing.status = "今日再次入选，延长跟踪";
      trackedByCode.set(c.code, existing);
    } else {
      trackedByCode.set(c.code, {
        name: c.name,
        code: c.code,
        theme: c.theme,
        firstTrackedDate: today,
        lastSelectedDate: today,
        entryPrice: c.close,
        news: c.news,
        score: c.score,
        climbScore: c.climbScore,
        fiveXScore: c.fiveXScore,
        fiveXRead: c.fiveXRead,
        phase: c.phase,
        selectionReason: c.selectionReason,
        status: "今日新入选"
      });
    }
  }

  return Array.from(trackedByCode.values()).map(item => {
    const q = quoteByCode.get(item.code) || quoteByName.get(item.name);
    const currentPrice = q ? Number(q.close.toFixed(2)) : item.currentPrice;
    const dayPct = q ? pct(q.close, q.prevClose) : item.dayPct;
    const entryPrice = Number(item.entryPrice);
    const returnPct = Number.isFinite(entryPrice) && entryPrice > 0 && Number.isFinite(currentPrice)
      ? Number((((currentPrice - entryPrice) / entryPrice) * 100).toFixed(2))
      : null;
    const age = item.firstTrackedDate ? daysBetween(item.firstTrackedDate, today) : 0;
    const selectedAge = item.lastSelectedDate ? daysBetween(item.lastSelectedDate, today) : 0;
    return {
      ...item,
      currentPrice,
      dayPct,
      returnPct,
      trackingDays: age,
      expiresInDays: Math.max(0, 30 - selectedAge),
      status: age === 0 ? item.status || "今日新入选，累计从入选收盘价开始计算"
        : item.status || (returnPct >= 10 ? "已明显走强" : returnPct <= -8 ? "跟踪失败风险" : "继续跟踪")
    };
  }).sort((a, b) => {
    const as = Number(a.climbScore ?? a.score ?? -999);
    const bs = Number(b.climbScore ?? b.score ?? -999);
    if (bs !== as) return bs - as;
    const ar = Number(a.returnPct ?? -999);
    const br = Number(b.returnPct ?? -999);
    return br - ar;
  }).slice(0, 100);
}

function quoteRowsFromItems(items) {
  return (items || []).map(item => {
    const close = Number(item.close ?? item.currentPrice);
    const dayPct = Number(item.dayPct);
    const prevClose = Number.isFinite(close) && Number.isFinite(dayPct)
      ? close / (1 + dayPct / 100)
      : close;
    return {
      name: item.name,
      code: item.code,
      close,
      prevClose
    };
  }).filter(row => row.code && Number.isFinite(row.close));
}

function buildRollingResearchPool(previous, key, dailyItems, quoteRows, options = {}) {
  const today = dateOnlyChina();
  const minScore = Number(options.minScore ?? 6.5);
  const scoreField = options.scoreField || "score";
  const statusPrefix = options.statusPrefix || "今日入选";
  const excludeCodes = new Set(options.excludeCodes || []);
  const previousTracked = Array.isArray(previous[key]) ? previous[key] : [];
  const dailyByCode = new Map((dailyItems || []).filter(x => x?.code).map(x => [x.code, x]));
  const quoteByCode = new Map((quoteRows || []).filter(x => x?.code).map(x => [x.code, x]));
  const quoteByName = new Map((quoteRows || []).filter(x => x?.name).map(x => [x.name, x]));
  const trackedByCode = new Map();

  for (const item of previousTracked) {
    if (!item.code) continue;
    if (excludeCodes.has(item.code)) continue;
    const score = Number(item[scoreField] ?? item.score);
    const last = item.lastSelectedDate || item.firstTrackedDate || today;
    const stillFresh = daysBetween(last, today) <= 30;
    if (stillFresh || dailyByCode.has(item.code)) {
      trackedByCode.set(item.code, {
        ...item,
        status: Number.isFinite(score) && score >= minScore
          ? (item.status || "滚动跟踪中")
          : "滚动跟踪中，今日评分降级"
      });
    }
  }

  for (const item of dailyItems || []) {
    if (!item?.code) continue;
    if (excludeCodes.has(item.code)) continue;
    const score = Number(item[scoreField] ?? item.score);
    if (!Number.isFinite(score) || score < minScore) continue;
    const existing = trackedByCode.get(item.code);
    if (existing) {
      trackedByCode.set(item.code, {
        ...existing,
        ...item,
        firstTrackedDate: existing.firstTrackedDate || today,
        entryPrice: existing.entryPrice || item.close,
        lastSelectedDate: today,
        status: `${statusPrefix}再次入选，延长跟踪`
      });
    } else {
      trackedByCode.set(item.code, {
        ...item,
        firstTrackedDate: today,
        lastSelectedDate: today,
        entryPrice: item.close,
        status: `${statusPrefix}新入选`
      });
    }
  }

  return Array.from(trackedByCode.values()).map(item => {
    const daily = dailyByCode.get(item.code);
    const q = quoteByCode.get(item.code) || quoteByName.get(item.name);
    const close = Number(q?.close ?? daily?.close ?? item.currentPrice ?? item.close);
    const currentPrice = Number.isFinite(close) ? Number(close.toFixed(2)) : item.currentPrice;
    const dayPct = Number.isFinite(Number(daily?.dayPct))
      ? Number(daily.dayPct)
      : q ? pct(q.close, q.prevClose) : item.dayPct;
    const entryPrice = Number(item.entryPrice);
    const returnPct = Number.isFinite(entryPrice) && entryPrice > 0 && Number.isFinite(currentPrice)
      ? Number((((currentPrice - entryPrice) / entryPrice) * 100).toFixed(2))
      : null;
    const trackingDays = item.firstTrackedDate ? daysBetween(item.firstTrackedDate, today) : 0;
    const selectedAge = item.lastSelectedDate ? daysBetween(item.lastSelectedDate, today) : 0;
    return {
      ...item,
      currentPrice,
      dayPct,
      returnPct,
      trackingDays,
      expiresInDays: Math.max(0, 30 - selectedAge),
      status: item.status || (returnPct >= 10 ? "跟踪后明显走强" : returnPct <= -8 ? "跟踪后走弱，降级复盘" : "继续跟踪")
    };
  }).sort((a, b) => {
    const bs = Number(b[scoreField] ?? b.score ?? -999);
    const as = Number(a[scoreField] ?? a.score ?? -999);
    if (bs !== as) return bs - as;
    return Number(b.returnPct ?? -999) - Number(a.returnPct ?? -999);
  }).slice(0, 100);
}

function mergeResearchItems(items) {
  const byCode = new Map();
  for (const item of items || []) {
    if (!item?.code) continue;
    const previous = byCode.get(item.code);
    if (!previous || Number(item.fiveXScore ?? item.score ?? -999) > Number(previous.fiveXScore ?? previous.score ?? -999)) {
      byCode.set(item.code, item);
    }
  }
  return Array.from(byCode.values());
}

function isFiveXPoolEligible(item) {
  if (!item?.code || !isBuyableAShareCode(item.code)) return false;
  if (item.code === "002463") return false; // 沪电股份今年涨幅已过大，不再按早中期5倍候选处理。
  const yearReturn = Number(item.yearReturn);
  if (Number.isFinite(yearReturn) && yearReturn > 230) return false;
  return Number(item.fiveXScore) >= 6.5;
}

function valueRecoveryScore(q, meta, weekly, marketCapYi) {
  const dayPct = pct(q.close, q.prevClose);
  const amountYi = q.amountRaw / 100000000;
  const yearReturn = weekly?.yearReturn ?? null;
  const quarterReturn = weekly?.quarterReturn ?? null;
  const distanceToHighPct = weekly?.distanceToHighPct ?? null;
  const drawdown = Number.isFinite(distanceToHighPct) ? Math.abs(Math.min(0, distanceToHighPct)) : null;
  let score = 0;
  if (Number.isFinite(drawdown) && drawdown >= 35) score += 2;
  else if (Number.isFinite(drawdown) && drawdown >= 25) score += 1.3;
  if (Number.isFinite(yearReturn) && yearReturn <= -20) score += 1.5;
  else if (Number.isFinite(yearReturn) && yearReturn <= -10) score += 0.8;
  if (Number.isFinite(quarterReturn) && quarterReturn > -10 && quarterReturn < 30) score += 1.2;
  if (dayPct > 0) score += 0.8;
  if (dayPct > 2) score += 0.5;
  if (amountYi > 10) score += 0.8;
  if (weekly?.closeAbove20w || weekly?.ma20Rising) score += 1;
  if (/修复|出清|企稳|恢复|出海|分红|现金流|毛利|订单|BD|管线/.test(meta[5] || "")) score += 1.5;
  if (Number.isFinite(marketCapYi) && marketCapYi > 80) score += 0.5;
  return Number(Math.min(10, score).toFixed(1));
}

function valueQualityScore(row) {
  let score = 0;
  const pe = Number(row.peTtm ?? row.pe);
  const pb = Number(row.pb);
  const marketCap = Number(row.marketCapYi);
  const amountYi = Number(row.amountRaw) / 100000000;
  const turnover = Number(row.turnover);
  if (Number.isFinite(pe) && pe > 0 && pe <= 18) score += 2.2;
  else if (Number.isFinite(pe) && pe > 18 && pe <= 28) score += 1.2;
  if (Number.isFinite(pb) && pb > 0 && pb <= 1.5) score += 2;
  else if (Number.isFinite(pb) && pb > 1.5 && pb <= 2.5) score += 1;
  if (Number.isFinite(marketCap) && marketCap >= 40 && marketCap <= 500) score += 1.4;
  else if (Number.isFinite(marketCap) && marketCap > 500 && marketCap <= 1500) score += 0.7;
  if (Number.isFinite(amountYi) && amountYi >= 2) score += 0.8;
  if (Number.isFinite(turnover) && turnover >= 0.5 && turnover <= 8) score += 0.8;
  if (Number(row.dayPct) > 0) score += 0.5;
  return Number(Math.min(10, score).toFixed(1));
}

function valueQualityPhase(score, row) {
  const pe = Number(row.peTtm ?? row.pe);
  const pb = Number(row.pb);
  if (score >= 6.5 && pe > 0 && pb > 0) return "硬指标低估观察";
  if (score >= 5) return "估值待验证";
  return "不入选";
}

function buildMarketWideValueIdeas(snapshot, previous) {
  const priorByCode = new Map((previous.oversoldValueIdeas || []).map(x => [x.code, x]));
  return (snapshot || [])
    .filter(row => row.buyable)
    .filter(row => !/^ST|^\*ST/.test(row.name || ""))
    .filter(row => Number(row.close) > 2)
    .map(row => {
      const score = valueQualityScore(row);
      const prior = priorByCode.get(row.code) || {};
      const phase = valueQualityPhase(score, row);
      return {
        name: row.name,
        code: row.code,
        theme: prior.theme || "全市场估值扫描",
        logic: "由全A快照按PE/PB/市值/流动性/成交承接筛出，后续必须再核验行业、财报和现金流。",
        keyCheck: "硬指标初筛通过；下一步必须查ROE、经营现金流、利润增速、负债率和行业景气，确认不是低估陷阱。",
        score,
        phase,
        action: phase === "硬指标低估观察"
          ? "进入硬指标观察，但必须补查财报和行业位置；等技术止跌后再考虑。"
          : "硬指标有便宜迹象，但数据不完整或质量未确认，只做待验证。",
        dayPct: row.dayPct,
        amount: amountText(row.amountRaw),
        close: row.close,
        marketCapYi: row.marketCapYi,
        floatCapYi: row.floatCapYi,
        pe: row.pe,
        peTtm: row.peTtm,
        pb: row.pb,
        turnover: row.turnover,
        risk: "低PE/PB可能是盈利下滑、周期下行或财务质量问题造成，必须结合ROE、现金流和财报趋势排除价值陷阱。"
      };
    })
    .filter(x => x.score >= 5)
    .sort((a, b) => b.score - a.score || Number(a.marketCapYi ?? 999999) - Number(b.marketCapYi ?? 999999))
    .slice(0, 20);
}

function valueRecoveryPhase(score, weekly) {
  if (score >= 7.5 && (weekly?.ma20Rising || weekly?.closeAbove20w)) return "超跌修复确认";
  if (score >= 6.5) return "低估修复观察";
  if (score >= 5) return "便宜但未确认";
  return "暂不参与";
}

function valueRecoveryAction(phase) {
  if (phase === "超跌修复确认") return "可放入观察名单，等回踩不破或放量突破再小仓验证。";
  if (phase === "低估修复观察") return "只观察不急买，必须等行业催化和技术止跌同时出现。";
  if (phase === "便宜但未确认") return "估值可能便宜，但没有右侧确认，不能因为跌得多就买。";
  return "先排除，避免价值陷阱。";
}

function buildOversoldValueIdeas(quotes, previous, weeklyProfiles, marketCaps) {
  const metaByName = new Map(OVERSOLD_VALUE_POOL.map(x => [x[1], x]));
  const previousIdeas = new Map((previous.oversoldValueIdeas || []).map(x => [x.code, x]));
  return quotes.map(q => {
    const meta = metaByName.get(q.name);
    if (!meta) return null;
    const prior = previousIdeas.get(meta[2]);
    const weekly = weeklyProfiles.get(meta[2]) || prior || null;
    const marketCapYi = marketCaps.get(meta[2]);
    const score = valueRecoveryScore(q, meta, weekly, marketCapYi);
    const phase = valueRecoveryPhase(score, weekly);
    return {
      name: q.name,
      code: meta[2],
      theme: meta[3],
      logic: meta[4],
      keyCheck: meta[5],
      score,
      phase,
      action: valueRecoveryAction(phase),
      dayPct: pct(q.close, q.prevClose),
      amount: amountText(q.amountRaw),
      close: Number(q.close.toFixed(2)),
      marketCapYi: Number.isFinite(marketCapYi) ? marketCapYi : null,
      quarterReturn: weekly?.quarterReturn ?? null,
      yearReturn: weekly?.yearReturn ?? null,
      distanceToHighPct: weekly?.distanceToHighPct ?? null,
      closeAbove20w: weekly?.closeAbove20w ?? null,
      ma20Rising: weekly?.ma20Rising ?? null,
      risk: "超跌低估不等于安全，若业绩继续下修、行业没有出清、反弹无量，就是价值陷阱。"
    };
  }).filter(x => x && x.score >= 5)
    .sort((a, b) => b.score - a.score || b.dayPct - a.dayPct)
    .slice(0, 8);
}

function tradeSignal(item, dayPct, cumulativePct, marketRiskLevel) {
  const weakMarket = marketRiskLevel === "偏防守";
  if (item.status === "已清仓") {
    if (dayPct > 5) return ["已清仓跟踪", "清仓后大涨只做复盘，除非重新满足买入逻辑，否则不追。"];
    return ["已清仓跟踪", "已清仓标的只记录后续走势，用来复盘卖点质量，不作为当前操作指令。"];
  }
  if (item.status === "已卖出") {
    if (dayPct > 3 && cumulativePct > 0) return ["重新观察", "卖出后重新走强，可放回观察池，但必须等回踩确认。"];
    return ["继续跟踪", "已卖出标的只做复盘，不急于重新买入。"];
  }
  if (cumulativePct <= -8 || dayPct <= -5) {
    return ["卖出/降仓信号", "跌幅触发风控：累计跌幅或单日跌幅过大，优先保护本金。"];
  }
  if (weakMarket && dayPct < 0) {
    return ["减仓观察", "市场偏防守且个股转弱，反弹不强则降低仓位。"];
  }
  if (dayPct > 3 && cumulativePct > 0 && !weakMarket) {
    return ["买入/加仓观察", "个股与市场共振转强，可等回踩不破或放量突破确认。"];
  }
  if (dayPct > 0 && cumulativePct > 0) {
    return ["持有观察", "趋势仍有承接，继续看关键支撑和板块资金。"];
  }
  return ["等待确认", "未触发明确买入或卖出，继续跟踪量价和板块强弱。"];
}

function buildTradeTracking(previous, quoteMap, marketRiskLevel) {
  const previousItems = Array.isArray(previous.tradeTracking) ? previous.tradeTracking : [];
  const byCode = new Map();
  for (const item of previousItems) {
    if (item.code) byCode.set(item.code, { ...item });
  }
  const today = dateOnlyChina();
  for (const [symbol, name, code, status, theme] of TRADE_TRACKING_BASE) {
    const existing = byCode.get(code) || {};
    const q = quoteMap.get(name);
    const currentPrice = q ? Number(q.close.toFixed(2)) : Number(existing.currentPrice);
    const existingBasisIsPriceTracking = existing.trackingBasis === "selected-price";
    const startDate = existingBasisIsPriceTracking && existing.startDate ? existing.startDate : today;
    const startPrice = existingBasisIsPriceTracking && Number.isFinite(Number(existing.startPrice))
      ? Number(existing.startPrice)
      : currentPrice;
    byCode.set(code, {
      ...existing,
      symbol,
      name,
      code,
      status,
      startDate,
      startPrice,
      theme,
      trackingBasis: "selected-price"
    });
  }
  return Array.from(byCode.values()).map(item => {
    const q = quoteMap.get(item.name);
    const currentPrice = q ? Number(q.close.toFixed(2)) : Number(item.currentPrice ?? item.startPrice);
    const prevClose = q ? Number(q.prevClose) : currentPrice;
    const dayPct = pct(currentPrice, prevClose);
    const startPrice = Number(item.startPrice);
    const cumulativePct = Number.isFinite(startPrice) && startPrice > 0
      ? Number((((currentPrice - startPrice) / startPrice) * 100).toFixed(2))
      : null;
    const [signal, signalReason] = tradeSignal(item, dayPct, cumulativePct ?? 0, marketRiskLevel);
    return {
      ...item,
      currentPrice,
      dayPct,
      cumulativePct,
      signal,
      signalReason,
      buyLogic: "买入逻辑：板块资金回流 + 个股站回5日线/10日线 + 成交额放大 + 海外/政策映射不拖后腿。",
      sellLogic: "卖出逻辑：跌破关键支撑、单日放量大跌、累计回撤触发风控、或板块主线转弱且反弹无量。"
    };
  }).sort((a, b) => {
    if (a.status === b.status) return (b.cumulativePct ?? -999) - (a.cumulativePct ?? -999);
    return a.status === "当前持仓" ? -1 : 1;
  });
}

function buildMarketInternals(snapshot = []) {
  const rows = (snapshot || []).filter(row => Number.isFinite(Number(row.dayPct)));
  const tradable = rows.filter(row => Number(row.close) > 0);
  const up = tradable.filter(row => row.dayPct > 0).length;
  const down = tradable.filter(row => row.dayPct < 0).length;
  const flat = Math.max(0, tradable.length - up - down);
  const limitUp = tradable.filter(row => row.dayPct >= 9.8).length;
  const limitDown = tradable.filter(row => row.dayPct <= -9.8).length;
  const strong = tradable.filter(row => row.dayPct >= 5).length;
  const weak = tradable.filter(row => row.dayPct <= -5).length;
  const medianPct = median(tradable.map(row => Number(row.dayPct)).filter(Number.isFinite));
  const totalAmount = tradable.reduce((sum, row) => sum + (Number(row.amountRaw) || 0), 0);
  const industryMap = new Map();
  for (const row of tradable) {
    const industry = row.industry || "未分行业";
    const current = industryMap.get(industry) || {
      industry,
      count: 0,
      up: 0,
      down: 0,
      pctSum: 0,
      amountRaw: 0,
      strong: 0,
      weak: 0
    };
    current.count += 1;
    current.up += row.dayPct > 0 ? 1 : 0;
    current.down += row.dayPct < 0 ? 1 : 0;
    current.strong += row.dayPct >= 5 ? 1 : 0;
    current.weak += row.dayPct <= -5 ? 1 : 0;
    current.pctSum += Number(row.dayPct) || 0;
    current.amountRaw += Number(row.amountRaw) || 0;
    industryMap.set(industry, current);
  }
  const industries = Array.from(industryMap.values())
    .filter(item => item.count >= 5)
    .map(item => ({
      ...item,
      avgPct: Number((item.pctSum / item.count).toFixed(2)),
      upRatio: Number(((item.up / item.count) * 100).toFixed(1)),
      amountYi: Number((item.amountRaw / 100000000).toFixed(1)),
      amountShare: totalAmount > 0 ? Number(((item.amountRaw / totalAmount) * 100).toFixed(1)) : null
    }));
  const strongIndustries = industries
    .filter(item => item.upRatio >= 55 || item.avgPct > 1)
    .sort((a, b) => b.avgPct - a.avgPct || b.amountYi - a.amountYi)
    .slice(0, 8);
  const weakIndustries = industries
    .filter(item => item.upRatio <= 40 || item.avgPct < -1)
    .sort((a, b) => a.avgPct - b.avgPct || b.amountYi - a.amountYi)
    .slice(0, 8);
  const activeIndustries = industries
    .sort((a, b) => b.amountYi - a.amountYi)
    .slice(0, 8);
  const upRatio = tradable.length ? Number(((up / tradable.length) * 100).toFixed(1)) : null;
  const downRatio = tradable.length ? Number(((down / tradable.length) * 100).toFixed(1)) : null;
  const emotion =
    !tradable.length ? "数据不足"
      : upRatio < 35 || weak > strong * 1.5 || limitDown > limitUp * 1.5 ? "弱势防守"
      : upRatio > 58 && strong > weak ? "赚钱效应扩散"
      : upRatio > 48 ? "结构轮动"
      : "弱平衡";
  const read =
    !tradable.length ? "全A内部结构未取到，不能只凭指数判断资金情绪。"
      : `全A上涨${up}家、下跌${down}家，涨跌中位数${Number.isFinite(medianPct) ? medianPct.toFixed(2) : "-"}%，涨停约${limitUp}家、跌停约${limitDown}家；强势股${strong}家、弱势股${weak}家。`;
  return {
    source: tradable.length ? "Tushare/全A快照" : "未取得",
    sampleSize: tradable.length,
    tradeDate: tradable.find(row => row.tradeDate)?.tradeDate || null,
    up,
    down,
    flat,
    upRatio,
    downRatio,
    limitUp,
    limitDown,
    strong,
    weak,
    medianPct: Number.isFinite(medianPct) ? Number(medianPct.toFixed(2)) : null,
    totalAmountYi: Number((totalAmount / 100000000).toFixed(1)),
    emotion,
    read,
    strongIndustries,
    weakIndustries,
    activeIndustries
  };
}

function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function marketConclusion(indices, holdings, internals = {}) {
  const trendLine = indices.map(i => `${i.name}${i.trend?.status || "趋势待确认"}：${i.trend?.read || "周线待确认"}`).join("；");
  const cyb = indices.find(x => x.name === "创业板指")?.pct ?? 0;
  const kc = indices.find(x => x.name === "科创50")?.pct ?? 0;
  const sh = indices.find(x => x.name === "上证指数")?.pct ?? 0;
  const semiWeak = holdings.filter(h => ["江丰电子", "雅克科技", "鼎龙股份", "菲利华"].includes(h.name) && h.pct < -4).length;
  if (internals.emotion === "弱势防守") {
    return `指数趋势：${trendLine}。指数和全A内部结构偏弱：${internals.read} 这不是可以随便进攻的盘面，明天先看弱势行业是否止跌、强势方向是否有持续承接。`;
  }
  if (internals.emotion === "赚钱效应扩散") {
    return `指数趋势：${trendLine}。全A赚钱效应扩散：${internals.read} 可以做结构性进攻，但仍要避开冲高回落和高位拥挤。`;
  }
  if (sh < -1 || cyb < -1 || (internals.downRatio && internals.downRatio > 55)) {
    return `指数趋势：${trendLine}。市场处在弱平衡/分化调整：${internals.read || "指数回落但内部结构待确认。"} 强势股可以跟踪，弱势仓不补。`;
  }
  if (cyb < -3 || kc < -4) {
    return `指数趋势：${trendLine}。科技成长线明显承压，先防守再找修复。明天重点看创业板/科创50是否止跌，以及半导体材料是否有核心股反包。`;
  }
  if (semiWeak >= 2) {
    return `指数趋势：${trendLine}。指数未必最弱，但半导体材料链内部压力较大，组合需要降低弱势科技仓暴露。`;
  }
  return `指数趋势：${trendLine}。市场未出现系统性破坏，持仓按强弱分层处理：强势核心持有观察，弱势修复不加仓。`;
}

function buildMacroMap(indices, globalMarkets = [], internals = {}) {
  const shIndex = indices.find(x => x.name === "上证指数") || {};
  const cybIndex = indices.find(x => x.name === "创业板指") || {};
  const kcIndex = indices.find(x => x.name === "科创50") || {};
  const sh = shIndex.pct ?? 0;
  const cyb = cybIndex.pct ?? 0;
  const kc = kcIndex.pct ?? 0;
  const shTrendScore = Number(shIndex.trend?.score || 0);
  const growthTrendScore = Math.min(Number(cybIndex.trend?.score || 0), Number(kcIndex.trend?.score || 0));
  const marketPct = (name) => {
    const value = Number(globalMarkets.find(x => x.name === name)?.pct);
    return Number.isFinite(value) ? value : NaN;
  };
  const pctText = (value) => Number.isFinite(value) ? `${value}%` : "待确认";
  const nasdaq = marketPct("纳斯达克");
  const ndx = marketPct("纳斯达克100");
  const soxx = marketPct("半导体ETF");
  const kospi = marketPct("韩国KOSPI");
  const nikkei = marketPct("日经225");
  const hsi = marketPct("恒生指数");
  const globalTechWeak = soxx < -3 || kospi < -3 || nikkei < -2;
  const internalWeak = internals.emotion === "弱势防守" || Number(internals.downRatio) > 58;
  const internalStrong = internals.emotion === "赚钱效应扩散" || Number(internals.upRatio) > 58;
  const riskLevel = cyb < -3 || kc < -4 || globalTechWeak || internalWeak || growthTrendScore <= -3 ? "偏防守" : internalStrong && growthTrendScore >= 2 ? "积极观察" : "中性观察";
  const growthWeak = cyb < -2 || kc < -3 || growthTrendScore <= -3;
  const growthStrong = (cyb > 1.5 || kc > 2) && growthTrendScore >= 2;
  const broadStrong = sh > 0.8 && shTrendScore >= 2;
  const broadWeak = sh < -1.2 || shTrendScore <= -3;
  const marketRegime =
    broadStrong && growthStrong && !globalTechWeak ? "全面牛市观察"
      : growthStrong && !broadWeak && !globalTechWeak ? "结构性牛市"
      : (growthWeak && globalTechWeak) || (broadWeak && growthWeak) || (broadWeak && internalWeak) ? "熊市预警"
      : broadWeak && !growthStrong ? "弱势震荡"
      : "震荡市/结构轮动";
  const regimeScore = {
    broadIndex: broadStrong ? 2 : broadWeak ? -2 : sh > 0 ? 1 : -1,
    growthIndex: growthStrong ? 2 : growthWeak ? -2 : cyb > 0 || kc > 0 ? 1 : -1,
    overseasRisk: globalTechWeak ? -2 : soxx > 1 || kospi > 1 || nikkei > 1 ? 1 : 0,
    styleBreadth: internalStrong ? 2 : internalWeak ? -2 : riskLevel === "偏防守" ? -1 : 1
  };
  const regimeTotal = Object.values(regimeScore).reduce((sum, value) => sum + value, 0);
  const overseasSummary = [
    `半导体ETF ${pctText(soxx)}`,
    `韩国KOSPI ${pctText(kospi)}`,
    `日经225 ${pctText(nikkei)}`
  ].join("，");
  return {
    riskLevel,
    marketRegime: {
      regime: marketRegime,
      score: regimeTotal,
      summary: marketRegime === "全面牛市观察"
        ? "宽基指数和成长指数同步走强，海外风险不拖后腿，可以提高进攻仓位，但仍要防主线过热。"
        : marketRegime === "结构性牛市"
          ? "不是所有股票都涨，而是少数主线赚钱效应强。策略重点是跟随资金主线，不要拿弱板块硬扛。"
          : marketRegime === "熊市预警"
            ? "成长指数、科创/创业板和海外科技同步转弱，说明风险偏好收缩。优先保本金、降高波动仓位。"
            : marketRegime === "弱势震荡"
              ? "宽基承压但尚未形成全面崩塌，适合降低频率，只做确定性更高的板块。"
              : "市场大概率是轮动市，追涨容易吃回撤，关键是识别资金正在去哪条主线。",
      scoreItems: [
        { item: "上证/宽基", value: sh, read: `${shIndex.trend?.status || "趋势待确认"}：${shIndex.trend?.read || "周线待确认"}。${broadStrong ? "宽基走强，全面行情概率上升。" : broadWeak ? "宽基走弱，系统性风险上升。" : "宽基中性，更多是结构行情。"}` },
        { item: "创业板/科创", value: Math.min(cyb, kc), read: `创业板${cybIndex.trend?.status || "趋势待确认"}；科创50${kcIndex.trend?.status || "趋势待确认"}。${growthStrong ? "成长风险偏好回升。" : growthWeak ? "成长风险偏好收缩。" : "成长风格中性。"}` },
        { item: "海外科技", value: soxx, read: globalTechWeak ? "海外科技负反馈，A股高估值成长要降预期。" : "海外科技暂不构成系统拖累。" },
        { item: "全A宽度", value: internals.upRatio ?? "待确认", read: internals.read || "没有全A内部结构时，不给强结论。" },
        { item: "资金风格", value: regimeTotal, read: riskLevel === "偏防守" ? "先防守，等确认。" : "可做结构性机会。" }
      ],
      earlySignals: [
        { signal: "结构性牛市确认", condition: "指数不一定大涨，但某条主线连续放量、涨停扩散、龙头横盘不跌，候选股回踩不破10日/10周线。", action: "提高该主线观察权重，分批买，不追连续高潮。" },
        { signal: "全面牛市苗头", condition: "上证、创业板、科创50同步站上中期均线，两市成交额持续放大，金融和成长同时有赚钱效应。", action: "仓位可以更积极，但仍保留止损线。" },
        { signal: "熊市/杀估值预警", condition: "宽基和成长指数同步破位，成交放大但反弹无量，海外科技或汇率继续压制。", action: "降仓、少做新票，只保留最强和有业绩兑现的仓位。" },
        { signal: "假牛市/诱多", condition: "指数拉升但多数题材不跟，只有金融护盘或少数大票拉指数，候选股冲高回落。", action: "不因为指数红就加仓，继续看板块宽度和个股承接。" }
      ],
      positionGuide: marketRegime === "全面牛市观察"
        ? "可把进攻仓位上限提高，但分批进，不追连续大阳。"
        : marketRegime === "结构性牛市"
          ? "只在最强主线里进攻，非主线仓位降低；你的科技仓必须看AI基础设施是否仍是主线。"
          : marketRegime === "熊市预警"
            ? "优先降高波动科技和弱势仓，保留现金，等止跌反包后再恢复进攻。"
            : "控制仓位和节奏，做轮动确认，不提前重仓押方向。"
    },
    summary: riskLevel === "偏防守"
      ? `资金情绪偏防守：${internals.read || "全A宽度待确认"} 海外映射：${overseasSummary}。先确认资金是否从高位科技撤出，再决定是否切换到周期、消费、医药或红利。`
      : `资金情绪可做结构观察：${internals.read || "全A宽度待确认"} 海外映射：${overseasSummary}。只有板块成交额和上涨家数同时扩散，才提高进攻仓位。`,
    marketInternals: internals,
    globalMarkets,
    newsSources: [
      {
        name: "巨潮资讯/交易所",
        role: "公告与硬事实",
        watch: "财报、业绩预告、业绩快报、减持、调研、问询、监管函、招股书",
        use: "先判断有没有硬变化或硬风险；财报和公告优先级高于媒体解读。同比100%以上、环比继续改善、毛利率/订单/现金流同步变好要高亮。",
        portfolioMap: "所有持仓和我的跟踪池"
      },
      {
        name: "财联社",
        role: "政策与快讯",
        watch: "盘中政策、产业催化、机构解读、突发事件",
        use: "捕捉催化，但必须用成交额和板块联动验证，不能只因快讯买。",
        portfolioMap: "AI算力、半导体、新能源车、低空经济、机器人"
      },
      {
        name: "东方财富",
        role: "资金与板块热度",
        watch: "板块涨跌、主力资金、热门概念、股吧热度",
        use: "看资金是否真的进入对应板块，避免新闻热但盘面不买单。",
        portfolioMap: "观察池、强弹性候选、资金情绪页"
      },
      {
        name: "雪球",
        role: "市场观点分歧",
        watch: "持仓个股讨论热度、看多/看空理由、散户拥挤度、关键争议点",
        use: "雪球不当事实源，主要看预期是否过满、分歧是否加大、利空是否已被充分讨论。",
        portfolioMap: "富特科技、江丰电子、雅克科技、强弹性候选"
      },
      {
        name: "同花顺",
        role: "题材归因与概念链",
        watch: "涨停原因、概念板块、异动归因、同概念联动、资金风格",
        use: "验证个股上涨到底跟哪个题材有关，并找同板块未完全定价的二线核心。",
        portfolioMap: "主升前爬坡候选池、观察池、资金情绪页"
      },
      {
        name: "海外源",
        role: "全球映射",
        watch: "美股涨幅榜、费半、纳指、日经、韩国KOSPI、HBM/AI硬件链",
        use: "把美股、日韩涨幅榜映射到A股板块，再决定A股科技线仓位和候选方向。",
        portfolioMap: "AI服务器、PCB、光模块、半导体材料、机器人"
      }
    ],
    researchRadarTasks: [
      {
        priority: "1",
        task: "先查持仓公告和财报预告",
        targets: "巨化股份、浪潮信息、富特科技、江丰电子；中材科技、鼎龙股份、欣锐科技等历史交易名单继续跟踪公告但不当作当前持仓",
        whatToFind: "业绩预告、订单/合同、减持、问询、调研纪要、毛利率和现金流变化。",
        decisionUse: "有硬利空先降风险；有超预期财报且板块资金配合，才提高持仓等级。"
      },
      {
        priority: "2",
        task: "跟踪AI服务器链是否确认浪潮信息新仓",
        targets: "浪潮信息、工业富联、中科曙光、沪电股份、胜宏科技、深南电路",
        whatToFind: "AI服务器订单、PCB/高端板毛利、云厂商资本开支、英伟达/博通/AMD指引。",
        decisionUse: "若链条同步放量，浪潮可继续验证；若板块强它弱，降低新仓信心。"
      },
      {
        priority: "3",
        task: "判断半导体材料是否只是弱反弹，同时跟踪科创板科技风向",
        targets: "江丰电子、鼎龙股份、安集科技、南大光电、华海清科、通富微电、长电科技",
        whatToFind: "韩国存储/HBM、美光/海力士/三星指引、材料公司财报毛利率、A股材料链成交额、科创50和科创设备/材料/创新药强弱。",
        decisionUse: "科创板不可作为可买候选，但必须作为科技风险偏好风向；若科创设备/材料先止跌，再映射到可买的主板/创业板标的。江丰不反包继续降到10%以内；鼎龙弱则清尾仓。"
      },
      {
        priority: "4",
        task: "验证富特科技是否仍能做组合防线",
        targets: "富特科技、威迈斯、欣锐科技、斯达半导、新洁能、拓普集团",
        whatToFind: "高压快充、车载电源、储能、特斯拉/新能源车财报、国内新能源车销量和价格战。",
        decisionUse: "富特只持有不加仓；若新能源车链转弱或个股放量补跌，先降集中度。"
      },
      {
        priority: "5",
        task: "从财报超预期里找新候选",
        targets: "强弹性候选池、我的跟踪池、AI硬件/电力/半导体/新能源车/机器人链",
        whatToFind: "净利润或扣非同比100%以上，且收入、毛利率、订单或现金流同步改善。",
        decisionUse: "只把财报超预期且周K爬坡、量能台阶成立的公司加入重点观察。"
      }
    ],
    earningsRadarPolicy: [
      {
        tier: "爆发级",
        threshold: "净利润/扣非净利同比 >= 300%，或扭亏且利润体量明显",
        action: "最高优先级高亮；必须拆解是需求爆发、价格上涨、产能释放、产品结构升级、费用下降，还是低基数一次性修复。",
        caveat: "若只是低基数、资产处置、投资收益或政府补助，不按主线成长股处理。"
      },
      {
        tier: "强超预期",
        threshold: "净利润/扣非净利同比 >= 100%，且营收、毛利率、订单/产能至少一项同步改善",
        action: "进入重点财报观察；优先寻找周K已走出来但市场还没完全定价的标的。",
        caveat: "如果股价已提前大涨，要判断财报兑现后是继续上修还是利好落地。"
      },
      {
        tier: "边际改善",
        threshold: "收入增速加快、毛利率回升、亏损收窄、现金流改善、合同/订单/大客户出现变化",
        action: "进入候选池财务加分；适合找启动初中期股票。",
        caveat: "必须和行业景气、资金流和技术结构一起验证。"
      }
    ],
    aShareEarningsWatch: [
      {
        focus: "A股财报/业绩预告",
        watch: "净利润同比、扣非同比、营收同比、毛利率、经营现金流、合同负债/订单、产能利用率、大客户变化。",
        highlight: "同比100%以上先高亮；300%以上或扭亏且利润体量明显列为爆发级；越高越靠前，但必须排除低基数和非经常损益。",
        nextQuarter: "判断下一期能否延续：看订单可见度、价格趋势、产能释放节奏、库存周期、客户资本开支和费用率。"
      },
      {
        focus: "持仓映射",
        watch: "巨化看制冷剂价格、氟化工景气和利润兑现；浪潮看AI服务器订单、交付、毛利率和现金流；富特看车载电源/高压快充订单和毛利率；江丰看靶材客户验证、半导体材料需求和毛利率。",
        highlight: "持仓公司若财报超预期，要同时判断是否能改变仓位等级；弱势仓只有财报和板块资金共振才从修复仓升回进攻仓。",
        nextQuarter: "下一期预想必须写清：继续上修、维持、还是高基数回落。"
      }
    ],
    aShareEarningsTargets: [
      {
        name: "巨化股份",
        relation: "当前持仓；制冷剂/氟化工周期验证仓",
        whyWatch: "当前是组合第一大仓，能否继续持有取决于制冷剂价格、氟化工景气和利润兑现，而不是只看当日涨跌。",
        keyMetrics: "制冷剂价格、氟化工产品价差、营收增速、毛利率、扣非净利、经营现金流。",
        bullishRead: "若价格上涨能转化为毛利率和扣非利润改善，说明周期涨价逻辑兑现，可继续作为组合非科技方向主仓。",
        riskRead: "若价格上涨未体现到利润，或周期股集体退潮，应降低周期仓集中度。",
        nextQuarterView: "看制冷剂价格持续性、库存和下游需求，判断利润弹性是否还能延续。"
      },
      {
        name: "浪潮信息",
        relation: "当前持仓；AI服务器/国产算力主线仓候选",
        whyWatch: "已出中报业绩预告，利润同比大幅增长，是当前持仓里最明确的业绩兑现线索。",
        keyMetrics: "营收增速、净利润/扣非增速、毛利率、存货、合同负债、AI服务器订单和客户结构。",
        bullishRead: "若利润同比100%以上且毛利率/订单同步改善，浪潮从验证仓升级为组合主线仓候选。",
        riskRead: "若收入增长但毛利率下滑或存货压力加大，说明AI服务器景气未转化为利润，不宜加仓。",
        nextQuarterView: "看云厂商/国产算力采购是否延续，若订单可见度提升，下一期有继续上修空间。"
      },
      {
        name: "富特科技",
        relation: "当前持仓；高波动成长仓",
        whyWatch: "仓位已降至约22%，仍需财报证明高压电源/800V快充逻辑兑现，不能只按强势股惯性持有。",
        keyMetrics: "车载高压电源收入、毛利率、客户放量、经营现金流、存货和应收账款。",
        bullishRead: "若收入和扣非利润高增，同时毛利率稳定，说明强势股有基本面支撑，可继续持有但不追加。",
        riskRead: "若收入增但现金流/应收恶化，或毛利率受价格战压制，强势可能变成估值透支。",
        nextQuarterView: "看新能源车销量、800V平台渗透和客户订单，决定利润能否延续。"
      },
      {
        name: "江丰电子",
        relation: "当前持仓；半导体材料主要风险仓",
        whyWatch: "持仓收益仍为负，是否继续留仓取决于材料链财报和海外存储/HBM周期能否修复。",
        keyMetrics: "靶材收入、先进制程客户验证、毛利率、扣非净利、海外限制带来的国产替代订单。",
        bullishRead: "若扣非同比100%以上且毛利率改善，说明材料链不是单纯反弹，可从弱势修复仓上调。",
        riskRead: "若利润低于预期或毛利率继续承压，反弹也应减仓，不做摊低。",
        nextQuarterView: "看晶圆厂稼动率、韩国存储周期和国产替代订单是否继续改善。"
      },
    ],
    earningsAnalystSummary: {
      conclusion: "我的财报线索判断：浪潮信息已发布2026H1业绩预告，归母净利润预计26.0-31.0亿元、同比+226%-288%，扣非净利润预计20.55-25.55亿元、同比+206%-280%，属于持仓中的爆发级硬数据。下一阶段重点不是只找同比高，而是判断利润高增能否被订单、毛利率、现金流和板块资金继续验证。",
      portfolioAdvice: "持仓里，巨化是周期/制冷剂第一大仓，浪潮是AI服务器业绩兑现主线仓候选，富特是高压快充成长仓，江丰是半导体材料修复仓。欣锐、鼎龙、中材等旧名单继续保留在历史跟踪，不再当作当前持仓。",
      candidateAdvice: "候选股里，财报高增要和周K爬坡、成交额台阶、行业高景气一起看。若一家公司净利同比100%以上但股价已连续大阳、长上影或成交天量，先不追；若财报超预期但周线刚突破平台、量能温和放大，才是重点跟踪对象。",
      currentStatus: "已确认浪潮信息2026年半年度业绩预告为爆发级硬数据；其他持仓和跟踪池公告继续通过巨潮公告雷达滚动捕捉。"
    },
    earningsActionIdeas: [
      {
        direction: "优先看好",
        targets: "AI服务器、PCB、光模块、存储/HBM",
        reason: "海外云厂商CapEx、英伟达/博通/AMD指引、存储价格和HBM需求决定A股AI硬件是否还有上修空间。",
        stockMap: "浪潮信息、工业富联、中科曙光、沪电股份、胜宏科技、深南电路、中际旭创、新易盛、通富微电、长电科技",
        action: "财报若兑现订单和毛利，回调后优先跟踪；没有财报支撑的高位AI硬件不追。"
      },
      {
        direction: "谨慎看待",
        targets: "半导体材料弱势反弹",
        reason: "江丰所在材料链需要财报和海外存储周期一起确认，否则容易只是跌深反抽。",
        stockMap: "江丰电子、鼎龙股份、安集科技、南大光电、华海清科",
        action: "江丰不反包继续降风险；鼎龙作为已清仓历史跟踪，只观察不按当前持仓处理。"
      },
      {
        direction: "持有但不追",
        targets: "新能源车高压快充/车载电源",
        reason: "富特科技逻辑要靠订单、毛利率和现金流证明；仓位约22%，财报好也先看持续性，不盲目加仓。",
        stockMap: "富特科技、威迈斯、欣锐科技、斯达半导、新洁能",
        action: "财报确认则保留核心仓；若现金流、毛利率或客户放量不佳，降低集中度。"
      },
      {
        direction: "防止误判",
        targets: "低基数高增/一次性收益",
        reason: "同比100%以上不等于好公司，低基数、补贴、资产处置、投资收益都可能制造假高增。",
        stockMap: "所有财报高增候选",
        action: "必须看扣非、现金流、营收和毛利率，四项不共振就只观察。"
      }
    ],
    globalEarningsMap: [
      {
        company: "英伟达/AMD/博通",
        indicators: "数据中心收入、AI GPU/ASIC订单、毛利率、库存、下季指引、云厂商资本开支。",
        aShareImpact: "AI服务器、PCB、光模块、连接器、液冷、电源、先进封装；映射浪潮信息、沪电股份、胜宏科技、深南电路、中际旭创、新易盛、天孚通信、通富微电、长电科技。",
        read: "若收入和指引继续超预期，A股AI硬件链估值可上修；若毛利率或指引转弱，A股高位AI硬件先降预期。"
      },
      {
        company: "谷歌/微软/Meta/Amazon",
        indicators: "云收入、AI资本开支、广告/应用需求、下季度CapEx计划。",
        aShareImpact: "云厂商CapEx决定AI服务器、PCB、光模块、数据中心电力和液冷持续性。",
        read: "CapEx上修比利润本身更关键；如果云厂商继续加AI投资，A股算力链回调后更容易修复。"
      },
      {
        company: "苹果",
        indicators: "iPhone/Mac/可穿戴销量、AI终端进展、供应链库存、中国区收入。",
        aShareImpact: "消费电子、PCB、连接器、光学、精密制造、存储链。",
        read: "苹果链改善会带动消费电子和部分半导体修复，但若中国区弱，A股苹果链弹性打折。"
      },
      {
        company: "特斯拉",
        indicators: "交付、汽车毛利率、储能收入、FSD/机器人进展、下季交付指引。",
        aShareImpact: "新能源车零部件、高压快充、热管理、功率半导体、机器人；映射富特科技、斯达半导、新洁能、拓普集团等。",
        read: "储能和高压平台改善对富特这类高压电源/快充链更直接；若汽车毛利继续承压，整车链估值受压。"
      },
      {
        company: "美光/闪迪/西部数据/SK海力士/三星电子",
        indicators: "DRAM/NAND价格、HBM收入、库存、毛利率、下季价格指引。",
        aShareImpact: "存储、HBM、封测、半导体材料；映射江丰电子、鼎龙股份、通富微电、长电科技、深科技、华海诚科。",
        read: "存储价格和HBM指引向上，A股材料/封测更容易反包；若库存或价格转弱，材料链反弹要降级。"
      },
      {
        company: "台积电/ASML/应用材料/泛林/东京电子",
        indicators: "先进制程需求、设备订单、EUV/先进封装、晶圆厂CapEx、地区限制影响。",
        aShareImpact: "半导体设备、材料、先进封装、晶圆代工；映射华海清科、北方华创、中微公司、安集科技、南大光电、江丰电子。",
        read: "设备订单和CapEx上修利好国产替代情绪；但出口限制强化时要区分短期风险和长期国产替代。"
      },
      {
        company: "SpaceX/星链",
        indicators: "发射节奏、星链用户、融资估值、卫星制造和低轨通信订单。",
        aShareImpact: "低空/卫星互联网、通信设备、复材、连接器、电源。",
        read: "SpaceX不是上市公司，重点看融资、订单和发射节奏；对A股更多是主题催化，必须用板块成交验证。"
      }
    ],
    dailyGlobalReview: [
      {
        title: "美股科技",
        fact: `纳斯达克 ${pctText(nasdaq)}，纳斯达克100 ${pctText(ndx)}，半导体ETF ${pctText(soxx)}。`,
        read: soxx < -3
          ? "核心问题不是纳指小跌，而是芯片链大跌。AI硬件、半导体、PCB、先进封装的风险偏好被明显压低。"
          : "美股科技尚未系统性走坏，若半导体同步止跌，A股科技可以看修复。",
        aShare: "映射到A股：江丰/雅克/鼎龙/菲利华、通富/长电、沪电/胜宏、中际旭创/新易盛。"
      },
      {
        title: "日本市场",
        fact: `日经225 ${pctText(nikkei)}。`,
        read: nikkei < -2
          ? "日经明显下跌，通常说明日本半导体设备、电子材料和出口型科技链承压。A股设备/材料不能急着抄底。"
          : "日经相对稳定时，A股设备和电子材料更容易获得修复窗口。",
        aShare: "映射到A股：华海清科、安集科技、南大光电、江丰电子、雅克科技、富特科技的新能源车出口链。"
      },
      {
        title: "韩国市场",
        fact: `韩国KOSPI ${pctText(kospi)}。`,
        read: kospi < -3
          ? "韩国大跌是最重要的负反馈。韩国代表存储、HBM、三星/SK海力士产业链温度，暴跌会直接压制A股半导体材料和先进封装。"
          : Number.isFinite(kospi) ? "韩国止跌时，A股存储、材料、先进封装更容易反包。" : "韩国自动行情源暂未稳定返回，今天只作为待确认项，不用旧数据误导判断。",
        aShare: "映射到A股：雅克科技、江丰电子、鼎龙股份、菲利华、通富微电、长电科技。"
      },
      {
        title: "港股/风险偏好",
        fact: `恒生指数 ${pctText(hsi)}。`,
        read: hsi > 0
          ? "港股没有同步大跌，说明不是所有中国资产都被抛售，A股问题更集中在科技成长高位兑现。"
          : "港股若同步走弱，说明整体中国资产风险偏好也在下降。",
        aShare: "映射到A股：若港股稳而A股科技弱，优先区分科技高位风险，不要把所有持仓一刀切。"
      }
    ],
    policyReview: [
      {
        title: "半导体出口管制/国产替代",
        content: "中期利好国产材料、设备、算力链，但短线遇到海外芯片大跌时，政策逻辑不能抵消资金撤退。必须等材料/设备核心股放量反包。"
      },
      {
        title: "新能源车与欧洲贸易",
        content: "新能源车政策和出口链对富特科技是中期支撑；但若全球成长股风险偏好下降，富特即使强，也要按高仓位风险管理。"
      },
      {
        title: "AI算力与超聚变IPO映射",
        content: "国产算力仍是重要主题，映射中科曙光、浪潮信息、工业富联、PCB、先进封装。但今天外盘芯片弱，AIDC方向只看修复确认，不追高。"
      },
      {
        title: "汇率/利率/风险偏好",
        content: "美元和利率环境会影响成长股估值。外部风险偏好偏弱时，A股高估值科技股要降低仓位，低位启动初期品种也要等量价确认。"
      }
    ],
    convictionViews: [
      {
        rank: 1,
        view: "我短线最看好AI基础设施，而不是泛AI概念。",
        why: "海外资金没有完全离开AI，但半导体ETF和韩国KOSPI大跌说明高位芯片/材料在兑现。资金更可能从纯芯片弹性切到能兑现订单的AI基础设施。",
        aShareMap: "沪电股份、胜宏科技、深南电路、工业富联、通富微电、长电科技、中科曙光。",
        trigger: "美股半导体止跌，A股PCB/先进封装/国产算力放量反包，科创50不再继续破位。",
        fail: "海外芯片继续跌，A股AI硬件冲高回落或放量不涨。"
      },
      {
        rank: 2,
        view: "我看好富特科技的相对强度，但这已经是风控核心，不是加仓核心。",
        why: "富特仍是新能源车高压电源/800V快充方向代表，但仓位已降至约22%，后续重点是看订单、毛利率和现金流能否支撑强势。",
        aShareMap: "富特科技；辅助观察新能源车零部件、功率半导体、快充链。",
        trigger: "继续站稳51.6/50.0且新能源车链有资金回流，可继续持有。",
        fail: "跌破49.50或补跌放量，先把仓位降到35%-38%。"
      },
      {
        rank: 3,
        view: "江丰电子仍是组合半导体材料风险仓，鼎龙股份只作为已清仓历史跟踪。",
        why: "江丰仓位约16%，材料链必须等韩国/日经半导体止跌和A股材料股放量反包；鼎龙不再按当前持仓处理。",
        aShareMap: "江丰电子、鼎龙股份；辅助观察安集科技、南大光电、华海清科、通富微电、长电科技。",
        trigger: "韩国半导体止跌，A股材料核心股放量反包，江丰不再冲高回落。",
        fail: "弱反弹无量、跌破前低或板块资金继续流出。"
      },
      {
        rank: 4,
        view: "浪潮信息是这次调仓里最需要验证的新方向。",
        why: "它把组合从半导体材料扩到AI服务器/国产算力，方向是对的，但必须看AI服务器、PCB、工业富联/中科曙光链条是否同步放量。",
        aShareMap: "浪潮信息、工业富联、中科曙光、沪电股份、胜宏科技、深南电路。",
        trigger: "AI服务器/PCB/国产算力板块同步走强，浪潮不冲高回落。",
        fail: "板块强它不强，或跌破买入区后无法收回。"
      }
    ],
    finalAnalystView: "当前我的投研结论：最新组合集中在巨化、浪潮、富特、江丰四只。巨化验证周期/制冷剂，浪潮验证AI服务器业绩兑现，富特验证高压快充成长，江丰验证半导体材料修复；欣锐、鼎龙、中材等保留在历史跟踪池，不再当作当前仓位。",
    sectorFlowReview: [
      {
        title: "资金仍在AI/科技，但内部开始分化",
        fact: "2026年上半年美国ETF资金流入创纪录，科技ETF吸走约69%的行业ETF资金；AI、机器人、智能基础设施是最强主题。",
        read: "这说明中期资金没有离开AI，但短期从“什么AI都买”转向“只买能兑现盈利的硬件、内存、数据中心、电力和基础设施”。",
        aShareMap: "A股优先映射AI服务器、PCB、先进封装、光模块、算力电力；弱软件、纯概念和高位无业绩票要降级。"
      },
      {
        title: "半导体/内存是最强资金主线，但也最容易高位兑现",
        fact: "内存、半导体、AI硬件在上半年涨幅巨大，韩国三星、SK海力士和美股内存链此前大涨，今天韩国KOSPI和半导体ETF急跌。",
        read: "这不是主线消失，而是主线过热后的高位兑现。后续要看资金是回到核心硬件，还是切到工业、电力、金融、医疗等低估值方向。",
        aShareMap: "江丰、雅克、鼎龙、菲利华、通富、长电、沪电、胜宏都要先看反包质量；不反包就不能按主线继续持有。"
      },
      {
        title: "可能回流的方向：工业、电力、能源基础设施、金融、医疗",
        fact: "海外二季度后市场开始讨论科技估值压力，工业、能源、金融、通信服务、医疗被多家媒体/机构视为更有估值性价比的方向。",
        read: "如果AI硬件继续波动，资金可能不是离开AI，而是流向AI的“物理基础设施”：电力、工业自动化、数据中心、材料和设备。",
        aShareMap: "A股对应电力设备、智能电网、工业自动化、数据中心液冷、PCB/铜连接、券商金融、医药龙头。"
      },
      {
        title: "短线风险：散户期权/杠杆降温，科技股缺少边际买盘",
        fact: "JPMorgan提示散户期权和保证金交易降温，过去类似信号曾出现在科技股阶段性顶部附近。",
        read: "如果短线买盘从科技撤退，高位题材即使逻辑还在，也可能先杀估值再修复。",
        aShareMap: "A股高弹性候选要从“追涨”改为“等缩量止跌、放量反包”；持仓里半导体材料要先看风险。"
      }
    ],
    institutionViews: [
      {
        institution: "Goldman Sachs 高盛",
        view: "偏多AI，但方向从纯软件/概念转向AI基础设施、半导体、服务器、数据中心、电力，以及AI进入工厂、矿山、公用事业等实体经济。",
        implication: "A股不应只看光模块/芯片，还要看AI电力、工业自动化、数据中心基础设施、PCB、先进封装和国产算力。",
        risk: "高盛内部也有AI盈利兑现担忧：如果AI投入不能转化为利润，估值会被压。"
      },
      {
        institution: "Morgan Stanley 大摩",
        view: "强调AI算力需求仍可能超预期，同时看好能源、金属、通信基础设施、专有数据、国防科技等不易被AI替代或受政府支持的资产。",
        implication: "A股映射为国产算力、半导体设备、稀土/关键材料、电力基础设施、军工信息化和数据要素。",
        risk: "大摩也提醒不确定性高，市场从兴奋到亢奋时需要新的担忧来延长牛市，不能无脑追高。"
      },
      {
        institution: "JPMorgan 小摩",
        view: "更偏谨慎，提示AI硬件供应商大涨而AI资本开支方走弱，类似1999年的分化；同时散户期权/杠杆降温可能削弱科技股买盘。",
        implication: "A股半导体材料和AI硬件不能只看长期逻辑，要看资金是否继续承接；高位硬件链如果放量下跌，要先防守。",
        risk: "如果AI盈利被质疑、云厂商资本开支放缓，A股AI硬件和材料链会被压估值。"
      },
      {
        institution: "综合结论",
        view: "机构不是一致看空AI，而是在分化：高盛偏多基础设施，大摩看算力和实物资产，小摩警惕AI交易过热和买盘降温。",
        implication: "明天A股策略应是：AI主线保留，但只看硬件基础设施中的强者；半导体材料等高位票先等反包；低位启动候选必须有成交确认。",
        risk: "不能把任何AI新闻都当利好，必须看资金流向和板块强弱。"
      }
    ],
    usGainerMapping: US_GAINER_THEMES.map((x, index) => ({
      rank: index + 1,
      ...x,
      use: "每天看美股涨幅榜是否出现同一主题的多只股票集体上涨；只有集体上涨才算主题资金，不把单只异动当主线。"
    })),
    asiaGainerMapping: JAPAN_KOREA_GAINER_THEMES.map((x, index) => ({
      rank: index + 1,
      ...x,
      useRule: "日韩涨幅榜主要用于验证产业链温度：日本看设备/材料/机器人/汽车电子，韩国看存储/HBM/电池/互联网风险偏好。"
    })),
    overseasRead: [
      {
        market: "美股科技/半导体",
        fact: `纳指和纳斯达克100代表风险偏好，半导体ETF代表芯片链温度；当前半导体ETF ${Number.isFinite(soxx) ? `${soxx}%` : "待确认"}。`,
        aShareImpact: "直接影响AI服务器、光模块、PCB、先进封装、半导体材料。",
        conclusion: soxx < -3 ? "对A股科技是负反馈，明天反包必须看成交额，不追弱反弹。" : "若继续走强，可支持A股科技修复。"
      },
      {
        market: "韩国",
        fact: `韩国KOSPI ${Number.isFinite(kospi) ? `${kospi}%` : "待确认"}，重点看三星、SK海力士、HBM和存储链。`,
        aShareImpact: "映射雅克、江丰、材料链、先进封装、存储周期。",
        conclusion: kospi < -3 ? "韩国半导体杀跌会压制A股材料链估值，江丰/雅克/鼎龙/菲利华反弹预期下调。" : "韩国止跌会给材料链修复窗口。"
      },
      {
        market: "日本",
        fact: `日经225 ${Number.isFinite(nikkei) ? `${nikkei}%` : "待确认"}，重点看半导体设备、电子材料、机器人和汽车链。`,
        aShareImpact: "映射华海清科、安集、南大光电、富特科技、功率半导体。",
        conclusion: nikkei < -2 ? "日经科技链转弱时，A股设备/材料不要急着抄底。" : "日经设备链止跌可提高A股设备材料修复概率。"
      }
    ],
    aSharePlaybook: [
      {
        rank: 1,
        direction: "AIDC/算力事件驱动",
        overseasBasis: "美股半导体和AI硬件是核心温度计，若费半/半导体ETF止跌，A股先看算力链修复。",
        aShareMap: "中科曙光、浪潮信息、工业富联、沪电股份、胜宏科技、通富微电、长电科技",
        tradingRead: globalTechWeak ? "海外芯片仍弱，明天只能看低吸修复，不追高。" : "海外科技配合，可作为第一主线观察。"
      },
      {
        rank: 2,
        direction: "半导体材料/设备修复",
        overseasBasis: "韩国存储、日经半导体设备和美股芯片决定材料链风险偏好。",
        aShareMap: "江丰电子、雅克科技、鼎龙股份、菲利华、安集科技、南大光电、华海清科",
        tradingRead: kospi < -3 || nikkei < -2 ? "日韩半导体承压，材料链反包需要强成交确认。" : "日韩止跌，材料/设备有修复窗口。"
      },
      {
        rank: 3,
        direction: "AI硬件/PCB/光模块",
        overseasBasis: "NASDAQ、纳指100、AI服务器和云厂商资本开支影响PCB与光模块。",
        aShareMap: "沪电股份、胜宏科技、深南电路、中际旭创、新易盛、天孚通信",
        tradingRead: soxx < -3 ? "AI硬件海外负反馈仍在，候选股只看强者，不做普涨预期。" : "AI硬件可作为弹性候选方向。"
      },
      {
        rank: 4,
        direction: "新能源车/功率半导体",
        overseasBasis: "日经汽车链、欧洲电动车政策和国内新能源车销量影响零部件估值。",
        aShareMap: "富特科技、露笑科技、新洁能、斯达半导",
        tradingRead: "富特若继续强于市场，可作为组合防线；露笑/功率半导体必须看板块共振。"
      },
      {
        rank: 5,
        direction: "消费电子/机器人/低位修复",
        overseasBasis: "美股消费电子、日经机器人和风险偏好决定低位题材弹性。",
        aShareMap: "立讯精密、歌尔股份、绿的谐波、鸣志电器等",
        tradingRead: "只作为备选方向，当前优先级低于算力和半导体修复。"
      }
    ],
    wholeMarketRadar: [
      {
        style: "科技成长",
        currentView: "仍是高弹性主线，但内部拥挤且波动大，不能默认每天都是主线。",
        watchSignals: "科创50/创业板、半导体ETF、AI服务器/PCB/光模块成交额、涨停家数和冲高回落比例。",
        representativeSectors: "AI服务器、PCB、光模块、半导体材料、机器人、低空经济",
        stockExamples: "浪潮信息、工业富联、中科曙光、沪电股份、胜宏科技、中际旭创、新易盛、江丰电子；科创板设备/材料/创新药只看风向，不列为可买候选。",
        portfolioAction: "你当前持仓偏科技，所以科技不强时要降预期；科创板用于判断科技风险偏好，真正可买池只放主板、创业板和中小板。"
      },
      {
        style: "红利/高股息",
        currentView: "如果成长股继续大波动，红利是资金避险方向，不一定涨得快，但能对冲组合波动。",
        watchSignals: "银行、煤炭、电力、运营商、交运是否逆势走强，成交额是否持续放大。",
        representativeSectors: "银行、煤炭、电力、运营商、高速公路、港口",
        stockExamples: "工商银行、农业银行、中国神华、陕西煤业、长江电力、中国移动",
        portfolioAction: "若科技连续走弱，可考虑把候选池加入红利防守标的，但不和科技股用同一套买点。"
      },
      {
        style: "顺周期/资源",
        currentView: "适合在经济预期、商品价格或政策刺激改善时观察；不是每天都该买，但不能忽视。",
        watchSignals: "铜、铝、煤、钢、化工品价格，地产/基建政策，资源股是否放量突破。",
        representativeSectors: "有色、煤炭、化工、钢铁、建材、工程机械",
        stockExamples: "紫金矿业、洛阳钼业、中国铝业、万华化学、三一重工、海螺水泥",
        portfolioAction: "若科技弱而资源周期强，说明资金在切风格，持仓科技仓位不能硬扛。"
      },
      {
        style: "消费/医药",
        currentView: "偏修复和防守弹性，关键看政策、业绩和估值性价比；适合做非科技观察池。",
        watchSignals: "白酒、家电、创新药、医疗器械、旅游酒店是否出现机构回流。",
        representativeSectors: "白酒、食品饮料、家电、创新药、医疗器械、旅游",
        stockExamples: "贵州茅台、五粮液、美的集团、恒瑞医药、迈瑞医疗、中国中免",
        portfolioAction: "若财报季消费/医药出现超预期，应该和科技候选同台比较，不应只看科技。"
      },
      {
        style: "金融/地产链",
        currentView: "金融是指数和风险偏好放大器，地产链是政策弹性方向；适合观察风格切换。",
        watchSignals: "券商、保险、银行、地产服务、建材家居是否集体放量，政策是否超预期。",
        representativeSectors: "券商、保险、银行、地产开发、建材、家居",
        stockExamples: "东方财富、中信证券、中国平安、保利发展、东方雨虹、欧派家居",
        portfolioAction: "若金融拉指数但科技不跟，要警惕你的持仓不受益；若券商放量可提升市场风险偏好。"
      },
      {
        style: "出口链/制造",
        currentView: "人民币、海外需求和关税政策决定弹性；富特科技也部分属于这条线。",
        watchSignals: "汽车零部件、家电、机械、电力设备、船舶出口订单和汇率变化。",
        representativeSectors: "汽车零部件、家电、机械、电力设备、船舶",
        stockExamples: "拓普集团、伯特利、美的集团、格力电器、阳光电源、中国船舶",
        portfolioAction: "富特是否能继续做核心，要看新能源车/高压快充出口链是否有资金回流。"
      }
    ],
    capitalMigrationView: {
      conclusion: "当前不能假设资金一直在科技。我的判断是：科技成长仍有局部机会，但资金更挑剔，正在从泛科技、高位半导体材料，切向能被财报验证的AI基础设施；如果科技承接不住，防守资金会去红利高股息，进攻资金会寻找资源周期、金融券商、消费医药和出口制造的轮动机会。",
      from: "高位泛科技、半导体材料弱反弹、无业绩题材、小票情绪炒作",
      to: "AI服务器/PCB/光模块/存储HBM的财报兑现线，红利高股息防守线，有色资源和出口制造轮动线，消费医药超预期修复线，金融券商风险偏好线",
      portfolioRisk: "你的持仓科技/材料/新能源暴露较高。如果资金确认不在科技，不能硬等反弹，要先控富特集中度、继续压江丰风险、清理鼎龙尾仓，再用非科技候选分散风格。",
      nextTwoWeeks: "未来两周先看风格切换是否确认：科技若放量反包，优先AI基础设施；科技若继续弱，优先红利/资源/金融里走势最强的方向。",
      nextMonth: "未来一个月真正值得进攻的股票，必须同时满足：财报或订单验证、周K不破趋势、成交额中枢抬升、所属板块资金连续回流。"
    },
    styleAnchors: [
      {
        rank: 1,
        name: "浪潮信息",
        code: "000977",
        direction: "AI服务器/国产算力",
        why: "新仓所在方向仍是AI基础设施核心，若AI服务器、PCB和国产算力链同步放量，最容易从验证仓变成主线仓。",
        trigger: "板块成交放大，浪潮不冲高回落，并且财报/订单能证明AI服务器交付和毛利改善。",
        risk: "若板块强它弱，或AI硬件海外继续杀估值，降低验证仓。"
      },
      {
        rank: 2,
        name: "沪电股份",
        code: "002463",
        direction: "AI服务器PCB",
        why: "PCB是AI服务器CapEx最直接的A股映射之一，若海外云厂商/英伟达链维持高景气，容易继续受资金关注。",
        trigger: "高端PCB成交额持续放大，财报显示AI服务器订单和毛利提升。",
        risk: "连续大阳后放量长上影不追。"
      },
      {
        rank: 3,
        name: "紫金矿业",
        code: "601899",
        direction: "有色资源/铜金",
        why: "如果科技资金退潮，资源龙头可能成为非科技进攻方向；铜金价格和全球资源逻辑能承接部分机构资金。",
        trigger: "有色板块放量强于指数，铜金价格走强，股价周线维持上行。",
        risk: "商品价格回落或资源股冲高放量滞涨。"
      },
      {
        rank: 4,
        name: "比亚迪",
        code: "002594",
        direction: "新能源车整车/出口链",
        why: "不是纯科技，是制造和出口链代表；若新能源车销量、出口和智能化叙事修复，能带动富特相关链条。",
        trigger: "整车和汽零板块同步走强，销量/出口数据改善。",
        risk: "价格战继续压利润，或整车涨但零部件不跟。"
      },
      {
        rank: 5,
        name: "东方财富",
        code: "300059",
        direction: "金融券商/风险偏好",
        why: "如果市场从结构行情切到指数行情，券商和互联网金融是风险偏好放大器。",
        trigger: "两市成交额放大，券商板块集体放量，指数和题材共振。",
        risk: "只拉金融护指数、题材不跟时，不代表你的科技持仓安全。"
      },
      {
        rank: 6,
        name: "恒瑞医药",
        code: "600276",
        direction: "创新药/医药修复",
        why: "如果资金从高位科技切向低位机构品种，创新药财报和BD催化可能成为消费医药里的弹性方向。",
        trigger: "创新药板块放量，财报/管线/出海授权出现边际改善。",
        risk: "医药只是防守轮动，没有成交持续性。"
      },
      {
        rank: 7,
        name: "中国船舶",
        code: "600150",
        direction: "船舶出口/周期制造",
        why: "非科技的高景气制造方向，订单周期长、出口逻辑清楚，适合作为科技之外的进攻观察。",
        trigger: "船舶板块放量，订单和新船价格维持强势。",
        risk: "高位周期股若放量滞涨，短线不追。"
      },
      {
        rank: 8,
        name: "中国神华",
        code: "601088",
        direction: "煤炭红利/防守",
        why: "如果科技继续走弱，红利高股息用于降低组合波动，不是暴涨首选，但能防止账户被单一风格拖累。",
        trigger: "红利板块连续强于指数，煤炭/电力资金净流入。",
        risk: "红利只适合防守配置，不按题材股追涨。"
      }
    ],
    elasticAttackWatch: [
      {
        rank: 1,
        name: "英维克",
        code: "002837",
        direction: "液冷/数据中心温控",
        marketRole: "AI电力与液冷弹性",
        why: "不是科创板，能映射AI数据中心液冷、储能温控和服务器散热；如果资金从芯片扩散到基础设施，弹性比纯大票更好。",
        trigger: "液冷、数据中心电力、温控板块集体放量，订单/财报边际改善。",
        risk: "若AI硬件继续退潮或放量冲高回落，不追。"
      },
      {
        rank: 2,
        name: "申菱环境",
        code: "301018",
        direction: "液冷/数据中心温控",
        marketRole: "创业板AI基础设施弹性",
        why: "创业板可买，方向同样贴近数据中心温控和液冷；适合观察AI基础设施资金是否从大票向中小盘扩散。",
        trigger: "数据中心液冷项目、温控订单或板块成交额温和上台阶。",
        risk: "若只是AI概念扩散，没有订单和成交配合，先观察。"
      },
      {
        rank: 3,
        name: "奥海科技",
        code: "002993",
        direction: "电源/车载电源/服务器电源",
        marketRole: "出口制造+服务器电源弹性",
        why: "不完全是科技股，兼具消费电源、新能源车电源和服务器电源映射，适合作为富特之外的电源链观察。",
        trigger: "电源链、服务器电力、汽车电子同步走强，周线放量突破平台。",
        risk: "消费电子弱或毛利率承压时，不上仓位。"
      },
      {
        rank: 4,
        name: "贝斯特",
        code: "300580",
        direction: "机器人丝杠/汽零",
        marketRole: "机器人启动初中期弹性",
        why: "如果资金从AI硬件外溢到机器人，丝杠/汽零方向比大票更有弹性。",
        trigger: "机器人板块放量，核心零部件不冲高回落，财报或订单出现边际改善。",
        risk: "机器人题材若只靠消息刺激，无量上涨不追。"
      },
      {
        rank: 5,
        name: "五洲新春",
        code: "603667",
        direction: "机器人轴承/丝杠",
        marketRole: "机器人零部件弹性",
        why: "机器人零部件里更偏弹性，适合观察资金是否从大票切到小中盘执行器/丝杠链。",
        trigger: "机器人零部件板块连续强于指数，成交额温和上台阶。",
        risk: "若放历史天量长上影，短线高潮风险高。"
      },
      {
        rank: 6,
        name: "欣锐科技",
        code: "300745",
        direction: "车载电源/充电模块",
        marketRole: "新能源车高压快充弹性",
        why: "创业板可买，和富特科技同属高压快充/车载电源映射，可用来验证富特逻辑是不是板块共振，而不是单股强。",
        trigger: "新能源车高压快充、车载电源板块同步回流。",
        risk: "若整车价格战压制零部件毛利，不加仓。"
      },
      {
        rank: 7,
        name: "南大光电",
        code: "300346",
        direction: "光刻胶/电子特气",
        marketRole: "创业板半导体材料弹性",
        why: "创业板可买，如果半导体材料修复，不只看江丰/鼎龙，也要看光刻胶、电子特气等更有弹性的材料分支。",
        trigger: "材料链反包，光刻胶/特气成交放大且财报毛利改善。",
        risk: "材料链无量反弹或冲高回落时不碰。"
      },
      {
        rank: 8,
        name: "宗申动力",
        code: "001696",
        direction: "低空经济/航空动力",
        marketRole: "政策事件弹性",
        why: "主板可买，低空经济若有政策和订单推进，航空动力链比泛概念更容易被资金识别。",
        trigger: "低空政策落地、航空动力链或板块放量突破。",
        risk: "纯政策消息无成交配合时，只观察不追。"
      }
    ],
    nonTechWatch: [
      {
        rank: 1,
        direction: "红利防守",
        why: "当科技波动放大、半导体ETF走弱时，红利能降低组合波动。",
        watch: "银行、电力、煤炭、运营商是否逆势放量。",
        action: "先纳入候选池，不急买；等科技确认走弱且红利连续两天强于指数再考虑。"
      },
      {
        rank: 2,
        direction: "资源周期",
        why: "若商品价格和政策预期改善，周期股可能成为科技之外的赚钱方向。",
        watch: "有色、煤炭、化工是否出现放量平台突破。",
        action: "只看龙头和财报改善股，不碰纯题材小票。"
      },
      {
        rank: 3,
        direction: "消费/医药修复",
        why: "财报季若消费或医药出现超预期，可能吸引低位机构资金回流。",
        watch: "白酒、家电、创新药、医疗器械的财报和机构回流。",
        action: "作为非科技备选，不追单日大阳，等周线企稳。"
      },
      {
        rank: 4,
        direction: "金融券商",
        why: "券商是市场风险偏好指标，能判断行情是否从结构性变成指数行情。",
        watch: "东方财富、中信证券、同花顺等是否放量带动指数。",
        action: "若金融强而科技弱，说明你当前持仓可能跑输指数，要考虑降科技集中度。"
      }
    ],
    avoidDirections: [
      {
        direction: "高位半导体材料无量反弹",
        reason: "海外芯片和日韩半导体弱时，高位材料股反弹容易被兑现。",
        examples: "雅克、江丰、鼎龙、菲利华需看反包成交，不强则降级。"
      },
      {
        direction: "单纯消息刺激但无量价确认",
        reason: "政策或财联社快讯只能提供催化，不能替代资金确认。",
        examples: "光刻胶、先进封装、国产算力都必须看成交额。"
      },
      {
        direction: "弱势新仓拖成被动持仓",
        reason: "新仓如果没有板块共振，容易从试错变成套牢。",
        examples: "露笑科技若不能修复，要按验证失败处理。"
      }
    ],
    recommendationAdjustments: [
      {
        item: "保留第一主线",
        adjustment: "AIDC/国产算力仍是候选主线，但从“进攻首选”改为“先看海外芯片止跌后的修复确认”。"
      },
      {
        item: "上调",
        adjustment: "富特科技作为逆势强股和新能源车高压电源方向，加入组合防线观察，但不能因强势继续加仓。"
      },
      {
        item: "新增观察",
        adjustment: "海外AI硬件若止跌，重点看PCB、光模块、先进封装三条链；候选池每天只新增5只并滚动跟踪。"
      },
      {
        item: "下调",
        adjustment: "半导体材料高位股从进攻仓降为修复观察仓，江丰/雅克/鼎龙/菲利华都必须等反包确认。"
      }
    ],
    fiveXModel: {
      title: "近5年A股一年5倍股模型",
      conclusion: "一年5倍股很少靠单一K线产生，通常是低位或中低位技术结构先走出来，再叠加硬消息、产业周期、业绩爆发或流动性抱团。真正能早期跟踪的阶段，往往是涨幅30%-120%之间、周线趋势刚排队、成交额中枢抬升但还没天量高潮的时候。",
      sampleNote: "样本为近5年代表性案例，用于提炼框架，不等同于完整名单；科创和北证样本可作风向研究，但不进入你的可买候选。",
      samples: [
        {
          name: "九安医疗",
          code: "002432",
          year: "2021-2022",
          driver: "新冠检测订单和业绩爆发",
          technical: "长期低位后放量突破，连续涨停打开空间，周线从底部直接进入主升。",
          message: "海外检测需求、订单、业绩预告不断强化预期。",
          lesson: "最强5倍股往往有利润兑现，不只是概念；但连续加速后只能看分歧低吸，不能追高潮。"
        },
        {
          name: "浙江建投",
          code: "002761",
          year: "2022",
          driver: "稳增长、基建、情绪龙头",
          technical: "低位平台后连板突破，换手放大，情绪资金不断接力。",
          message: "基建稳增长政策和市场情绪共振。",
          lesson: "政策主题能造妖，但基本面不强的5倍股生命周期短，必须用情绪退潮信号止盈。"
        },
        {
          name: "中通客车",
          code: "000957",
          year: "2022",
          driver: "新能源客车、核酸检测车、国企改革情绪",
          technical: "低价低位启动，连续涨停后高换手维持强势。",
          message: "题材密集、辨识度高，游资和短线资金集中攻击。",
          lesson: "题材龙头需要市场情绪配合，断板后若不能快速反包，风险急剧上升。"
        },
        {
          name: "剑桥科技",
          code: "603083",
          year: "2023",
          driver: "AI算力、CPO、光模块映射",
          technical: "周线平台突破后沿趋势上行，成交额中枢逐级抬升。",
          message: "英伟达和海外AI资本开支引爆光通信链，CPO预期持续发酵。",
          lesson: "产业趋势型5倍股更适合用周线跟踪，核心是海外映射、订单和板块共振。"
        },
        {
          name: "联特科技",
          code: "301205",
          year: "2023",
          driver: "CPO/光模块小盘弹性",
          technical: "创业板小市值，低位右侧突破后主升斜率陡，波动大。",
          message: "AI光模块二线补涨、市场寻找更高弹性标的。",
          lesson: "二线弹性股必须满足主线足够强；主线退潮时跌幅也会很大。"
        },
        {
          name: "万兴科技",
          code: "300624",
          year: "2023",
          driver: "AI应用、AIGC软件重估",
          technical: "底部抬升后放量突破，涨幅扩大阶段不断横盘再突破。",
          message: "AIGC应用侧想象空间和产品迭代驱动估值重估。",
          lesson: "AI应用类更多靠预期和估值重估，必须盯收入兑现和板块热度。"
        },
        {
          name: "正丹股份",
          code: "300641",
          year: "2024",
          driver: "TMA涨价、供需错配、业绩弹性",
          technical: "低位长期沉寂后放量主升，涨价逻辑不断被业绩验证。",
          message: "化工品价格上涨、业绩预告超预期、稀缺涨价链强化。",
          lesson: "涨价周期股最核心是产品价格和利润弹性；价格见顶或监管关注后要降温。"
        },
        {
          name: "寒武纪",
          code: "688256",
          year: "2024-2025",
          driver: "国产AI芯片、算力自主可控、稀缺龙头",
          technical: "周线持续上行，机构和产业资金强化趋势。",
          message: "国产算力政策、AI芯片稀缺性和产业链预期共振。",
          lesson: "科创板样本只作风向研究；它能帮助判断国产算力风险偏好，再映射到你能买的主板/创业板标的。"
        }
      ],
      traits: [
        { dimension: "技术面", rule: "先看周线：20周线拐头向上，5/10/20周线排队，低点抬高；最好是平台突破、慢牛爬坡或杯柄突破。", use: "日线只用于买点，不能用单日大阳线倒推逻辑。" },
        { dimension: "量能", rule: "成交额中枢上台阶，上涨放量、下跌缩量；启动期放量但不放历史天量长上影。", use: "天量长上影多半是阶段高潮，不是舒服买点。" },
        { dimension: "位置", rule: "最优阶段不是最低点，而是从底部起来30%-120%、刚离开无人区、还没有3倍以上透支。", use: "已经从低位涨3-5倍的，只能当风向，不再当启动候选。" },
        { dimension: "消息面", rule: "必须有硬催化：订单、涨价、政策、AI/产业映射、业绩预告、海外龙头财报或供需错配。", use: "纯传闻和社交热度只作辅助，必须被公告、财报或成交验证。" },
        { dimension: "基本面", rule: "最强样本往往有业绩爆发、利润率提升、订单兑现、产品价格上涨或商业模式重估。", use: "同比100%以上只是入场券，还要看扣非、现金流、毛利率和是否可持续。" },
        { dimension: "资金面", rule: "小中盘更容易走出高弹性，但必须有板块共振和龙头辨识度；机构趋势股则更看产业确定性。", use: "你的可买池优先主板、创业板，中小市值但基本面太弱的只观察。" }
      ],
      rules: [
        "候选股低于6.5分不进池；5倍股相似度低于6.5时，只能普通观察。",
        "优先找周线刚排队、成交额中枢抬升、近3个月涨幅20%-80%的票。",
        "有硬催化但股价仍在下降趋势，不买；股价强但没有消息/业绩验证，不重仓。",
        "科创板和北证继续作为风向研究，但不进入可买候选；创业板可以进入。",
        "买点只看两类：平台突破后不跌回，或第一次回踩10日线/10周线不破。",
        "卖点看三类：天量长上影、跌破20日/10周趋势、核心催化证伪或价格周期见顶。"
      ],
      dailyIntegration: [
        "每日候选增加5倍股相似度，和爬坡分一起看。",
        "财报季把净利润/扣非同比100%以上、300%以上、扭亏且利润体量明显的公司加入重点扫描。",
        "美股、日韩涨幅榜若出现同一产业链集体上涨，用来寻找A股可买映射，不把单只海外异动当主线。",
        "如果市场资金从科技切到资源、医药、消费或金融，5倍股模型也要在新主线里重新筛，不固定科技。"
      ]
    },
    finalCommand: riskLevel === "偏防守"
      ? "明天先看海外科技和亚洲半导体是否止跌，再看A股科创50/创业板是否修复。持仓先控半导体材料风险，候选池只看AI基础设施、工业/电力/数据中心等有资金回流迹象的强者，不做全面进攻。"
      : "若海外科技、韩国半导体、日经设备链同步稳定，A股可按AIDC/AI硬件、半导体材料、功率半导体三条线寻找强弹性候选。"
    ,
    signals: [
      {
        source: "美股/费半",
        watch: "NASDAQ、费城半导体、英伟达、AMD、博通、美光",
        aShareMap: "AI服务器、光模块、PCB、先进封装、半导体材料",
        action: "海外科技强则A股科技可看修复；海外科技弱则高位成长降级。"
      },
      {
        source: "韩国",
        watch: "三星电子、SK海力士、HBM、存储周期",
        aShareMap: "雅克、江丰、材料链、先进封装、存储周期",
        action: "韩国存储止跌或走强，A股材料链更容易修复；韩国继续杀跌则降低反包预期。"
      },
      {
        source: "日经",
        watch: "半导体设备、电子材料、机器人、汽车链",
        aShareMap: "华海清科、安集、南大光电、富特科技、功率半导体",
        action: "日经科技链止跌，A股设备/材料修复概率提高。"
      },
      {
        source: "美元/利率/汇率",
        watch: "美债利率、美元指数、人民币汇率、北向风险偏好",
        aShareMap: "成长股估值、出口链、外资偏好",
        action: "美元强或利率上行时，高估值成长股和题材股要降低仓位。"
      },
      {
        source: "地缘/贸易政策",
        watch: "出口管制、电动车关税、关键矿产、国产替代政策",
        aShareMap: "半导体国产替代、新能源车出口链、稀缺材料",
        action: "政策只提供方向，必须等成交额和板块资金确认。"
      }
    ],
    portfolioImpact: [
      {
        target: "富特科技",
        link: "新能源车出口、800V快充、欧洲关税和国内新能源车销量。",
        use: "若新能源车链和出口政策改善，富特强势可延续；若成长风格继续杀跌，富特高仓位仍要先防补跌。"
      },
      {
        target: "江丰/雅克/鼎龙/菲利华",
        link: "费半、韩国存储、日经半导体设备、出口管制和国产替代。",
        use: "海外半导体止跌是A股材料链反包的重要前提；外围继续弱时，反弹不追。"
      },
      {
        target: "中材科技",
        link: "新能源材料、玻纤电子布、AI服务器材料链和周期品风险偏好。",
        use: "若电子布/PCB链修复可观察，否则按利润保护处理。"
      },
      {
        target: "露笑科技",
        link: "新能源车功率半导体、碳化硅、日经汽车链和功率器件景气。",
        use: "没有板块共振时，新仓不能拖成被动持仓。"
      }
    ]
  };
}

function chinaTimeString() {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date()).replace(/\//g, "-");
}

function chinaTimeParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  const pick = (type) => parts.find(p => p.type === type)?.value;
  const hour = Number(pick("hour")) % 24;
  const minute = Number(pick("minute"));
  return {
    date: `${pick("year")}-${pick("month")}-${pick("day")}`,
    weekday: pick("weekday"),
    hour,
    minute,
    minutes: hour * 60 + minute
  };
}

function updateSession(now = new Date()) {
  const { weekday, minutes } = chinaTimeParts(now);
  const weekend = weekday === "Sat" || weekday === "Sun";
  if (weekend) {
    return {
      name: "周末复盘版",
      target: "下周",
      instruction: "周末复盘用于指导下周，不做盘中操作指令，重点看政策、海外市场、产业趋势和下周主线。"
    };
  }
  if (minutes < 12 * 60) {
    return {
      name: "早盘指导版",
      target: "上午",
      instruction: "早盘更新用于指导上午交易，重点看隔夜海外、开盘风险、上午观察位和是否先控仓。"
    };
  }
  if (minutes < 17 * 60) {
    return {
      name: "午间复盘版",
      target: "下午",
      instruction: "午间复盘用于指导下午交易，重点看上午资金流、板块强弱、午后能否修复或是否要降仓。"
    };
  }
  return {
    name: "盘后复盘版",
    target: "明天",
    instruction: "盘后复盘用于指导明天交易，重点看全天资金、收盘结构、夜间海外风险和次日操作预案。"
  };
}

function shouldRunScheduledUpdate(previous, session, now = new Date()) {
  if (process.env.GITHUB_EVENT_NAME !== "schedule") return { ok: true, reason: "manual-or-push" };

  const { date, weekday, minutes } = chinaTimeParts(now);
  const weekend = weekday === "Sat" || weekday === "Sun";
  const lastUpdated = String(previous?.meta?.lastUpdated || "").replace(/\//g, "-");
  const lastDate = lastUpdated.slice(0, 10);
  const lastSession = previous?.meta?.session || "";
  const updatedToday = lastDate === date;

  const inRange = (start, end) => minutes >= start && minutes <= end;
  const alreadyHas = (names) => updatedToday && names.includes(lastSession);
  const hm = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  if (weekend) {
    if (inRange(17 * 60, 18 * 60 + 30) && !alreadyHas(["周末复盘版"])) return { ok: true, reason: "weekend-evening" };
    if (minutes > 18 * 60 + 30 && minutes < 23 * 60 && !alreadyHas(["周末复盘版"])) return { ok: true, reason: "weekend-catchup" };
    return { ok: false, reason: `skip weekend heartbeat ${date} ${hm}; last=${lastDate || "-"} ${lastSession || "-"}` };
  }

  if (inRange(8 * 60 + 35, 9 * 60 + 30) && !alreadyHas(["早盘指导版", "午间复盘版", "盘后复盘版"])) {
    return { ok: true, reason: "morning-window" };
  }
  if (inRange(12 * 60 + 20, 13 * 60 + 20) && !alreadyHas(["午间复盘版", "盘后复盘版"])) {
    return { ok: true, reason: "midday-window" };
  }
  if (inRange(17 * 60, 18 * 60 + 30) && !alreadyHas(["盘后复盘版"])) {
    return { ok: true, reason: "after-close-window" };
  }

  if (minutes > 13 * 60 + 20 && minutes < 17 * 60 && !alreadyHas(["午间复盘版", "盘后复盘版"])) {
    return { ok: true, reason: "midday-catchup" };
  }
  if (minutes > 18 * 60 + 30 && minutes < 23 * 60 && !alreadyHas(["盘后复盘版"])) {
    return { ok: true, reason: "after-close-catchup" };
  }

  return { ok: false, reason: `skip heartbeat ${date} ${hm}; current=${session.name}; last=${lastDate || "-"} ${lastSession || "-"}` };
}

function modelForSession(session) {
  return session.name === "盘后复盘版" || session.name === "周末复盘版"
    ? OPENAI_DEEP_MODEL
    : OPENAI_DAILY_MODEL;
}

function compactDashboardForModel(dashboard) {
  return {
    meta: dashboard.meta,
    market: dashboard.market,
    globalMarkets: dashboard.macro?.globalMarkets || [],
    newsSources: dashboard.macro?.newsSources || [],
    convictionViews: dashboard.macro?.convictionViews || [],
    wholeMarketRadar: dashboard.macro?.wholeMarketRadar || [],
    marketRegime: dashboard.macro?.marketRegime || {},
    nonTechWatch: dashboard.macro?.nonTechWatch || [],
    capitalMigrationView: dashboard.macro?.capitalMigrationView || {},
    styleAnchors: dashboard.macro?.styleAnchors || [],
    elasticAttackWatch: dashboard.macro?.elasticAttackWatch || [],
    fiveXModel: dashboard.macro?.fiveXModel || {},
    researchRadarTasks: dashboard.macro?.researchRadarTasks || [],
    holdingHardEvents: dashboard.macro?.holdingHardEvents || [],
    earningsAnalystSummary: dashboard.macro?.earningsAnalystSummary || {},
    earningsActionIdeas: dashboard.macro?.earningsActionIdeas || [],
    earningsRadarPolicy: dashboard.macro?.earningsRadarPolicy || [],
    aShareEarningsWatch: dashboard.macro?.aShareEarningsWatch || [],
    aShareEarningsTargets: dashboard.macro?.aShareEarningsTargets || [],
    globalEarningsMap: dashboard.macro?.globalEarningsMap || [],
    portfolio: {
      stance: dashboard.portfolio?.stance,
      positionRatio: dashboard.portfolio?.positionRatio,
      holdings: (dashboard.portfolio?.holdings || []).map(h => ({
        name: h.name,
        code: h.code,
        weight: h.weight,
        theme: h.theme,
        close: h.close,
        pct: h.pct,
        amount: h.amount,
        risk: h.risk,
        action: h.action
      }))
    },
    candidates: (dashboard.candidates || []).map(c => ({
      name: c.name,
      code: c.code,
      theme: c.theme,
      phase: c.phase,
      climbScore: c.climbScore,
      fiveXScore: c.fiveXScore,
      fiveXRead: c.fiveXRead,
      dayPct: c.dayPct,
      marketCapYi: c.marketCapYi,
      quarterReturn: c.quarterReturn,
      yearReturn: c.yearReturn,
      distanceToHighPct: c.distanceToHighPct,
      closeAbove20w: c.closeAbove20w,
      maQueue: c.maQueue,
      volumeStairPass: c.volumeStairPass,
      financialEdge: c.financialEdge,
      heatLevel: c.heatLevel,
      buyPoint: c.buyPoint,
      noBuySignal: c.noBuySignal
    })),
    oversoldValueIdeas: (dashboard.oversoldValueIdeas || []).map(x => ({
      name: x.name,
      code: x.code,
      theme: x.theme,
      score: x.score,
      phase: x.phase,
      logic: x.logic,
      keyCheck: x.keyCheck,
      dayPct: x.dayPct,
      pe: x.pe,
      peTtm: x.peTtm,
      pb: x.pb,
      marketCapYi: x.marketCapYi,
      turnover: x.turnover,
      quarterReturn: x.quarterReturn,
      yearReturn: x.yearReturn,
      distanceToHighPct: x.distanceToHighPct,
      action: x.action,
      risk: x.risk
    })),
    tradeTracking: (dashboard.tradeTracking || []).map(t => ({
      name: t.name,
      code: t.code,
      status: t.status,
      dayPct: t.dayPct,
      cumulativePct: t.cumulativePct,
      signal: t.signal,
      signalReason: t.signalReason
    }))
  };
}

function fallbackModelAnalysis(session, reason) {
  return {
    enabled: false,
    model: modelForSession(session),
    status: reason || "未配置 OPENAI_API_KEY，当前使用规则化投研版本。",
    summary: "模型分析未启用；本版结论来自行情、海外映射、候选池规则和持仓纪律。",
    finalCommand: "富特作为核心强势仓持有不加；浪潮信息验证AI服务器方向；江丰不修复继续降；巨化验证周期/制冷剂切换；欣锐只作高压快充小仓验证。",
    actionPriorities: [
      "巨化股份约32%为周期/制冷剂主仓，继续看制冷剂价格、氟化工景气和利润兑现。",
      "浪潮信息约29%为AI服务器业绩兑现仓，已有中报预告硬数据，重点看高位承接和产业链共振。",
      "富特科技约22%为高压快充成长仓，持有看订单、毛利率和现金流，不盲目加。",
      "江丰电子约16%为半导体材料修复仓，若材料链不能放量反包，继续控风险。",
      "欣锐科技已清仓，只保留历史跟踪，不再按当前持仓给仓位建议。"
    ],
    holdingImpacts: [
      { name: "富特科技", impact: "新能源车高压电源/800V快充仍有相对强度，但仓位集中。", action: "持有不加仓，冲高滞涨或补跌先降仓。", trigger: "站稳短线趋势且新能源车链回流。", fail: "跌破短线支撑或放量补跌。" },
      { name: "浪潮信息", impact: "AI服务器/国产算力方向今天较强，是调仓里最成功的一笔。", action: "按验证仓持有，不确认不补。", trigger: "AI服务器、PCB、国产算力同步放量。", fail: "板块强它弱或跌破买入区。" },
      { name: "江丰电子", impact: "半导体材料仍受海外半导体和韩国存储情绪影响。", action: "不能反包就继续降风险。", trigger: "韩国/日经半导体止跌，A股材料链放量反包。", fail: "弱反弹无量或再创新低。" },
      { name: "巨化股份", impact: "新增周期/制冷剂方向，能降低组合科技单一暴露。", action: "先按验证仓观察，不确认不加。", trigger: "制冷剂、氟化工和资源周期同步放量。", fail: "板块不配合且跌破买入区。" },
      { name: "欣锐科技", impact: "已清仓历史跟踪；可作为高压快充/车载电源方向参照。", action: "不按当前持仓处理，只观察方向验证。", trigger: "高压快充和新能源车零部件回流。", fail: "方向不共振则继续移出重点。" }
    ],
    candidateAdjustments: [],
    newsTasks: [
      { source: "巨潮资讯/交易所", task: "财报季重点筛净利润/扣非同比100%以上、300%以上或扭亏且利润体量明显的公司，并拆分低基数/非经常损益/主营改善。", map: "所有持仓、我的跟踪池、强弹性候选池" },
      { source: "海外财报", task: "跟踪英伟达、谷歌、苹果、特斯拉、微软、Meta、Amazon、美光、闪迪/西部数据、SK海力士、三星、台积电、ASML、博通、AMD、SpaceX等指标公司财报和指引。", map: "AI服务器、PCB、光模块、半导体材料、存储、消费电子、新能源车、机器人/低空" }
    ]
  };
}

function parseJsonObject(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function buildModelAnalysis(dashboard, session) {
  if (!OPENAI_API_KEY) return fallbackModelAnalysis(session);

  const model = modelForSession(session);
  const payload = compactDashboardForModel(dashboard);
  const isDeepSession = session.name === "盘后复盘版" || session.name === "周末复盘版";
  const modelTimeoutMs = isDeepSession ? 300000 : 120000;
  const prompt = `你是严谨的A股投研分析师。请基于以下仪表盘数据，输出JSON，不要输出Markdown。
要求：
1. 不要泛泛罗列新闻，要说明新闻/海外/资金如何影响持仓和候选股。
2. 必须给出明确操作优先级：先看什么、减什么、观察什么、什么条件才可买。
3. 对雪球只作为市场分歧/预期拥挤度参考；对同花顺只作为题材归因和板块联动参考；公告和交易所信息优先于社交讨论。
4. 早盘版指导上午，午间版指导下午，盘后版指导明天，周末版指导下周。
5. 必须先判断市场阶段：熊市预警、弱势震荡、震荡市/结构轮动、结构性牛市、全面牛市观察。要说明这是全面行情还是结构性行情，并给出仓位上限、应该进攻还是防守。
6. 候选股必须按“周K先筛、量能台阶、市值80-300亿优先、行业高景气、财务/公告边际改善”评价；日K只用于买点，不作为先选依据。
7. 必须使用“近5年一年5倍股模型”辅助判断候选：低位/中低位周线爬坡、成交额中枢上移、硬催化、财报/订单/涨价兑现、板块资金共振。fiveXScore低于6.5的股票不要建议买入，只能普通观察。
8. 用户暂时不能买科创板和北证，所以可买候选、买入建议和加仓建议不得给688/689开头科创板、8/9开头北证；但整体投研必须继续分析科创50、科创半导体设备/材料/创新药，把它们作为科技风险偏好和产业链映射风向，再映射到可买的主板/创业板标的。创业板300/301可以纳入可买候选。
9. 必须先判断全市场资金风格，不允许只看科技。比较科技成长、红利高股息、顺周期资源、消费医药、金融地产、出口链、军工低空。如果资金不在科技，要明确给出降科技仓、切换观察方向和触发条件。
10. 必须单独评估超跌/低估股票：只有估值压缩、基本面未坏、行业有修复催化、技术止跌或资金回流同时出现，才可以观察；不能因为跌得多就建议买入，要警惕价值陷阱。
11. 财报季必须高亮A股业绩超预期公司：净利润/扣非同比100%以上重点列出，300%以上或扭亏且利润体量明显更靠前；必须解释为什么指标变好、是否低基数/一次性、下一期能否延续。
12. 必须关注海外指标公司财报和指引，包括但不限于英伟达、谷歌、苹果、特斯拉、SpaceX、微软、Meta、Amazon、美光、闪迪/西部数据、SK海力士、三星、台积电、ASML、博通、AMD；说明对A股AI服务器、PCB、光模块、半导体材料、存储、消费电子、新能源车、机器人/低空等方向的影响。
13. 不要承诺收益，不要使用“必涨”等确定性表达。
返回JSON字段：
{
  "summary": "100字内总判断",
  "finalCommand": "一句话交易指令",
  "actionPriorities": ["3-6条操作优先级"],
  "holdingImpacts": [{"name":"股票名","impact":"新闻/海外/资金影响","action":"操作建议","trigger":"触发条件","fail":"失败信号"}],
  "candidateAdjustments": [{"name":"股票名","view":"看法","why":"原因","buyPoint":"买点","avoid":"不买条件"}],
  "newsTasks": [{"source":"新闻源","task":"今天重点抓什么","map":"映射到哪些持仓/板块"}]
}
数据：${JSON.stringify(payload)}`;

  async function callModel(timeoutMs, attemptLabel) {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: "你是A股投研分析师，重视事实、风险、触发条件和失败信号。"
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });
    if (!res.ok) {
      throw new Error(`${attemptLabel}模型接口返回 ${res.status}`);
    }
    const json = await res.json();
    const text = json.output_text
      || (json.output || []).flatMap(item => item.content || []).map(part => part.text || "").join("\n");
    const parsed = parseJsonObject(text);
    if (!parsed) throw new Error(`${attemptLabel}模型返回格式无法解析`);
    return {
      enabled: true,
      model,
      status: `模型分析已启用（${attemptLabel}，超时上限${Math.round(timeoutMs / 1000)}秒）`,
      summary: parsed.summary || "",
      finalCommand: parsed.finalCommand || "",
      actionPriorities: Array.isArray(parsed.actionPriorities) ? parsed.actionPriorities : [],
      holdingImpacts: Array.isArray(parsed.holdingImpacts) ? parsed.holdingImpacts : [],
      candidateAdjustments: Array.isArray(parsed.candidateAdjustments) ? parsed.candidateAdjustments : [],
      newsTasks: Array.isArray(parsed.newsTasks) ? parsed.newsTasks : []
    };
  }

  try {
    return await callModel(modelTimeoutMs, "深度");
  } catch (error) {
    try {
      return await callModel(180000, "深度重试");
    } catch (retryError) {
      return fallbackModelAnalysis(session, `模型分析调用失败：${error.message}；重试失败：${retryError.message}。本次降级为规则版。`);
    }
  }
}

async function main() {
  const previous = await readPreviousDashboard();
  const session = updateSession();
  const scheduleGate = shouldRunScheduledUpdate(previous, session);
  if (!scheduleGate.ok) {
    console.log(scheduleGate.reason);
    return;
  }
  console.log(`dashboard update started: ${session.name}; trigger=${process.env.GITHUB_EVENT_NAME || "local"}; reason=${scheduleGate.reason}`);
  const previousHoldings = previous.portfolio?.holdings || [];
  const previousIndices = previous.market?.indices || [];
  const previousCandidates = previous.candidates || [];
  const trackingSymbols = Array.from(new Set([
    ...STOCKS.map(x => x[0]),
    ...TRADE_TRACKING_BASE.map(x => x[0])
  ]));
  const stockQuotes = await fetchSina(STOCKS.map(x => x[0])).catch(error => {
    console.warn(`stock quote fallback: ${error.message}`);
    const previousByCode = new Map(previousHoldings.map(h => [h.code, h]));
    return STOCKS.map(([, name, code]) => {
      const h = previousByCode.get(code) || {};
      const close = Number(h.close);
      return {
        name,
        prevClose: Number.isFinite(close) ? close / (1 + Number(h.pct || 0) / 100) : 0,
        close,
        high: Number(h.high ?? close),
        low: Number(h.low ?? close),
        amountRaw: Number(String(h.amount || "0").replace("亿", "")) * 100000000
      };
    }).filter(q => Number.isFinite(q.close) && q.close > 0);
  });
  const trackingQuotes = await fetchSina(trackingSymbols).catch(error => {
    console.warn(`tracking quote fallback: ${error.message}`);
    return stockQuotes;
  });
  const indexQuotes = await fetchSina(INDICES.map(x => x[0])).catch(error => {
    console.warn(`index quote fallback: ${error.message}`);
    return previousIndices.map(i => ({
      name: i.name,
      prevClose: Number(i.close) / (1 + Number(i.pct || 0) / 100),
      close: Number(i.close)
    })).filter(q => Number.isFinite(q.close));
  });
  const indexWeeklyProfiles = await fetchWeeklyProfiles(INDICES.map(x => [x[0], x[1], x[0].replace(/^(sh|sz)/, "")])).catch(error => {
    console.warn(`index weekly trend fallback: ${error.message}`);
    return new Map();
  });
  const candidateQuotes = await fetchSina(CANDIDATE_POOL.map(x => x[0])).catch(error => {
    console.warn(`candidate quote fallback: ${error.message}`);
    return previousCandidates.map(c => ({
      name: c.name,
      prevClose: Number(c.close) || 1,
      close: Number(c.close) || 1,
      high: Number(c.close) || 1,
      low: Number(c.close) || 1,
      amountRaw: 0
    }));
  });
  const candidateWeeklyProfiles = await fetchWeeklyProfiles(CANDIDATE_POOL).catch(error => {
    console.warn(`candidate weekly fallback: ${error.message}`);
    return new Map();
  });
  const candidateMarketCaps = await fetchEastmoneyMarketCaps(CANDIDATE_POOL).catch(error => {
    console.warn(`candidate market cap fallback: ${error.message}`);
    return new Map();
  });
  let marketWideSource = "";
  let marketWideSnapshot = await fetchEastmoneyAStockSnapshot().then(rows => {
    marketWideSource = "东方财富全A快照";
    return rows;
  }).catch(error => {
    console.warn(`Eastmoney A-share snapshot fallback: ${error.message}`);
    return [];
  });
  if (!marketWideSnapshot.length) {
    marketWideSnapshot = await fetchTushareAStockSnapshot().then(rows => {
      if (rows.length) marketWideSource = "Tushare全A快照";
      return rows;
    }).catch(error => {
      console.warn(`Tushare A-share snapshot fallback: ${error.message}`);
      return [];
    });
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
    ? buildMarketWideCandidates(marketWideSnapshot)
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
  const oversoldValueIdeas = marketWideSnapshot.length
    ? buildMarketWideValueIdeas(marketWideSnapshot, previous)
    : hasPreviousFullMarketValue
      ? previous.oversoldValueIdeas
      : buildOversoldValueIdeas(oversoldQuotes, previous, oversoldWeeklyProfiles, oversoldMarketCaps);
  const valueTrackingQuotes = marketWideSnapshot.length
    ? quoteRowsFromItems(marketWideSnapshot)
    : quoteRowsFromItems(oversoldValueIdeas);
  const fiveXSourceItems = mergeResearchItems([
    ...dailyCandidates,
    ...(Array.isArray(previous.trackedCandidates) ? previous.trackedCandidates : []),
    ...(Array.isArray(previous.trackedFiveXIdeas) ? previous.trackedFiveXIdeas : [])
  ]);
  const fiveXIdeas = fiveXSourceItems
    .filter(isFiveXPoolEligible)
    .sort((a, b) => Number(b.fiveXScore ?? -999) - Number(a.fiveXScore ?? -999) || Number(b.score ?? -999) - Number(a.score ?? -999))
    .slice(0, 20);
  const trackedValueIdeas = buildRollingResearchPool(previous, "trackedValueIdeas", oversoldValueIdeas, valueTrackingQuotes, {
    minScore: 5,
    scoreField: "score",
    statusPrefix: "估值质量"
  });
  const trackedFiveXIdeas = buildRollingResearchPool(previous, "trackedFiveXIdeas", fiveXIdeas, candidateTrackingQuotes, {
    minScore: 6.5,
    scoreField: "fiveXScore",
    statusPrefix: "5倍模型",
    excludeCodes: ["002463"]
  });
  const holdingHardEvents = await fetchHoldingHardEvents(previous, dailyCandidates, fiveXIdeas, oversoldValueIdeas).catch(error => {
    console.warn(`holding hard events fallback: ${error.message}`);
    return HOLDING_HARD_EVENTS;
  });
  const scanScopeText = marketWideSnapshot.length
    ? `估值质量扫描：${marketWideSource}${marketWideSnapshot.length}只；可操作池排除科创/北证`
    : hasPreviousFullMarketValue
      ? `估值质量扫描：本次全A行情源失败，暂沿用上一版全A结果；不把样本池冒充全市场`
      : "估值质量扫描：全A快照失败，本次仅有样本池，占位不作为强结论";
  const candidateScanScopeText = marketWideSnapshot.length
    ? `强弹性候选：${marketWideSource}${marketWideSnapshot.length}只同台初筛；剔除科创/北证、ST、过小/过大市值和评分低于6.5的标的`
    : hasPreviousFullMarketCandidates
      ? `强弹性候选：本次全A行情源失败，暂沿用上一版全A候选；等待下一次云端刷新`
      : "强弹性候选：全A快照失败，本次仅有手工池占位，不作为正式全市场选股";
  const marketInternals = buildMarketInternals(marketWideSnapshot);
  const macro = buildMacroMap(indices, globalMarkets, marketInternals);
  const dashboard = {
    meta: {
      version: "云端自动更新版",
      lastUpdated: chinaTimeString(),
      session: session.name,
      guidanceTarget: session.target,
      guidanceInstruction: session.instruction,
      scanScope: scanScopeText,
      candidateScanScope: candidateScanScopeText,
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
      holdingHardEvents
    },
    portfolio: {
      totalValue: "",
      positionRatio: "99.41%",
      profit: "",
      stance: indices.some(x => x.pct < -3) ? "防守" : "观察",
      privacyNote: "按用户要求，网页不展示账户金额，只展示仓位比例、收益百分比和交易状态。",
      holdings
    },
    candidates: dailyCandidates,
    fiveXCandidates: fiveXIdeas,
    oversoldValueIdeas,
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

  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/dashboard.json", `${JSON.stringify(dashboard, null, 2)}\n`, "utf8");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
