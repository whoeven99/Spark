import type { AiDrilldownAction } from "./aiDrilldownContext";

export type TodayBusinessModuleKey = "roi" | "traffic" | "conversion" | "orders";

export type TodayOverviewModule = {
  key: TodayBusinessModuleKey;
  title: string;
  summary: string;
  yesterdayLabel: string;
  yesterdayValue: string;
  averageLabel: string;
  averageValue: string;
  deltaLabel: string;
  deltaValue: string;
  detailPath: string;
  chartPath: string;
  chartHint: string;
};

export type TodayRoiMetric = {
  key: "short_term" | "long_term";
  title: string;
  currentLabel: string;
  currentValue: string;
  baselineLabel: string;
  baselineValue: string;
  deltaLabel: string;
  deltaValue: string;
  summary: string;
  tone: "positive" | "warning" | "critical";
};

export type TodayRoiFactor = {
  title: string;
  detail: string;
  tone: "warning" | "critical";
};

export type TodayMetricStatus = {
  label: string;
  status: "healthy" | "watch" | "risk";
  detail: string;
};

export type TodayMetricTable = {
  title: string;
  columns: string[];
  rows: string[][];
};

export type TodayMetricAction = AiDrilldownAction;

export type TodayMetricDetail = {
  key: TodayBusinessModuleKey;
  title: string;
  subtitle: string;
  intro: string;
  accent: string;
  primaryQuestion: string;
  chartHref: string;
  chartLabel: string;
  chartHint: string;
  metrics: Array<{
    label: string;
    value: string;
    unit?: string;
  }>;
  statuses: TodayMetricStatus[];
  tables: TodayMetricTable[];
  actions: TodayMetricAction[];
  conclusions: string[];
};

const OVERVIEW_MODULES: TodayOverviewModule[] = [
  {
    key: "traffic",
    title: "流量质量",
    summary: "昨日流量高于 7 日均值，但高质量流量占比没有同步抬升，今天要继续盯住有效输入而不是单纯冲量。",
    yesterdayLabel: "昨日会话",
    yesterdayValue: "8,420",
    averageLabel: "7 日均值",
    averageValue: "7,950",
    deltaLabel: "较均值",
    deltaValue: "+5.9%",
    detailPath: "/app/today/traffic",
    chartPath: "/app/today/traffic",
    chartHint: "进入流量质量详情页，继续看趋势、来源结构和高流量落地页。",
  },
  {
    key: "conversion",
    title: "转化承接",
    summary: "昨日转化率高于 7 日均值，但加购到结账阶段仍有掉点，赚钱效率仍在被中后段承接拖累。",
    yesterdayLabel: "昨日转化率",
    yesterdayValue: "1.82%",
    averageLabel: "7 日均值",
    averageValue: "1.64%",
    deltaLabel: "较均值",
    deltaValue: "+0.18pp",
    detailPath: "/app/today/conversion",
    chartPath: "/app/today/conversion",
    chartHint: "进入转化承接详情页，继续看漏斗趋势、掉点环节和关键页面。",
  },
  {
    key: "orders",
    title: "收入与订单",
    summary: "昨日订单量和收入都略高于 7 日均值，但折扣订单和退款仍在影响真实赚钱质量。",
    yesterdayLabel: "昨日订单数",
    yesterdayValue: "126",
    averageLabel: "7 日均值",
    averageValue: "118",
    deltaLabel: "较均值",
    deltaValue: "+6.8%",
    detailPath: "/app/today/orders",
    chartPath: "/app/today/orders",
    chartHint: "进入收入与订单详情页，继续看收入趋势、订单结构和退款影响。",
  },
];

const ROI_METRICS: TodayRoiMetric[] = [
  {
    key: "short_term",
    title: "短期 ROI",
    currentLabel: "近 7 天",
    currentValue: "1.9x",
    baselineLabel: "前 30 天基准",
    baselineValue: "2.3x",
    deltaLabel: "变化",
    deltaValue: "-0.4x",
    summary: "短期 ROI 明显承压，当前要优先盯住流量质量和落地页承接，避免继续放大获客浪费。",
    tone: "critical",
  },
  {
    key: "long_term",
    title: "长期 ROI",
    currentLabel: "近 7 天",
    currentValue: "2.8x",
    baselineLabel: "前 30 天基准",
    baselineValue: "2.6x",
    deltaLabel: "变化",
    deltaValue: "+0.2x",
    summary: "长期 ROI 还在安全区，说明老客和复购贡献仍有支撑，但短期效率已经开始偏弱。",
    tone: "warning",
  },
];

const ROI_FACTORS: TodayRoiFactor[] = [
  {
    title: "流量质量回落",
    detail: "高成本渠道占比抬升，新增会话虽然增长，但有效流量占比没有同步提升。",
    tone: "critical",
  },
  {
    title: "落地页承接偏弱",
    detail: "商品页到结账页的承接效率低于近 7 天均值，短期 ROI 被直接拖累。",
    tone: "critical",
  },
  {
    title: "售后损耗仍在侵蚀利润",
    detail: "退款和售后成本没有失控，但仍在吞噬利润空间，继续压缩短期回报。",
    tone: "warning",
  },
];

const DETAIL_MAP: Record<TodayBusinessModuleKey, TodayMetricDetail> = {
  roi: {
    key: "roi",
    title: "ROI 详情",
    subtitle: "ROI 详情不只看总结果，还要继续拆到付费流量、优惠券、复购等关键动作，判断钱该投在哪。",
    intro: "这个页面用来回答今天哪些经营动作真的在产生回报，哪些动作虽然带来了单量，但还没有带来足够的 ROI。",
    accent: "近 7 天 vs 前 30 天基准",
    primaryQuestion: "今天最值得继续投的动作是什么，是付费流量、优惠券、复购运营，还是该先止损收口？",
    chartHref: "/app/today/roi",
    chartLabel: "查看 ROI 详情",
    chartHint: "先在当前详情页收敛整体判断，再决定是否继续深钻到具体模块。",
    metrics: [
      { label: "短期 ROI", value: "1.9x" },
      { label: "长期 ROI", value: "2.8x" },
      { label: "近 7 天收入", value: "$56,300" },
      { label: "近 7 天投入", value: "$29,640" },
      { label: "退款损耗", value: "$2,180" },
      { label: "老客贡献", value: "24%" },
    ],
    statuses: [
      {
        label: "整体赚钱结果",
        status: "watch",
        detail: "长期 ROI 还在安全区，但短期 ROI 已明显偏离基准，说明赚钱效率正在走弱。",
      },
      {
        label: "流量与转化",
        status: "risk",
        detail: "高成本流量占比抬升，同时商品页到结账页承接偏弱，短期 ROI 被双重拖累。",
      },
      {
        label: "利润损耗",
        status: "watch",
        detail: "退款和售后成本没有失控，但仍在侵蚀利润空间，压缩最终回报。",
      },
    ],
    tables: [
      {
        title: "ROI 结果拆解",
        columns: ["指标", "当前", "基准", "变化"],
        rows: [
          ["短期 ROI", "1.9x", "2.3x", "-0.4x"],
          ["长期 ROI", "2.8x", "2.6x", "+0.2x"],
          ["收入", "$56,300", "$54,800", "+2.7%"],
          ["投入", "$29,640", "$23,800", "+24.5%"],
        ],
      },
      {
        title: "影响 ROI 的关键因子",
        columns: ["因子", "当前判断", "影响", "建议"],
        rows: [
          ["流量质量", "高成本渠道占比上升", "拖累 ROI", "先压低低效流量"],
          ["转化承接", "详情页到结账偏弱", "直接影响回收", "优先修高流量页面"],
          ["售后损耗", "退款集中在 2 个 SKU", "侵蚀利润", "跟进退款原因"],
          ["老客复购", "仍有一定支撑", "稳定长期 ROI", "继续维护老客"],
        ],
      },
    ],
    actions: [
      {
        title: "先压低低效流量",
        detail: "优先收紧高成本低回收渠道，避免短期 ROI 继续被无效获客拖累。",
        priority: "P0",
      },
      {
        title: "排查关键承接页",
        detail: "先看高流量商品页和优惠页的承接掉点，确认是页面内容还是结账前链路在拖累回收。",
        priority: "P1",
      },
      {
        title: "跟进退款损耗对象",
        detail: "把退款集中 SKU 单独拉出来看原因，避免利润继续被售后损耗侵蚀。",
        priority: "P2",
      },
    ],
    conclusions: [
      "Today 里的 ROI 不是只看一个总数，而是继续拆到关键动作，判断哪类经营动作值得继续投入。",
      "今天最值得优先处理的是高成本低效率流量，以及转化承接偏弱的关键页面。",
      "如果要继续深钻，优先看付费流量 ROI、优惠券 ROI 和复购支撑，再决定去流量质量或转化承接页。",
    ],
  },
  traffic: {
    key: "traffic",
    title: "流量质量详情",
    subtitle: "这个模块不只看流量大小，而是看今天进来的流量是否真的在支撑赚钱。",
    intro: "流量质量页的重点不是继续看曝光和会话，而是判断这些流量值不值钱、能不能转成结果。",
    accent: "昨日 vs 近 7 日均值",
    primaryQuestion: "今天进来的流量到底有没有价值，是哪些渠道和落地页在支撑或拖累赚钱？",
    chartHref: "/app/today/traffic",
    chartLabel: "查看流量质量详情",
    chartHint: "当前详情页已经收敛了流量质量判断，后续会继续补更完整的趋势深钻。",
    metrics: [
      { label: "昨日会话", value: "8,420" },
      { label: "7 日均值", value: "7,950" },
      { label: "自然流量占比", value: "41%" },
      { label: "付费流量占比", value: "37%" },
      { label: "跳出率", value: "38.4%" },
      { label: "落地页收入", value: "$5,820" },
    ],
    statuses: [
      {
        label: "流量规模",
        status: "healthy",
        detail: "昨日会话高于 7 日均值 5.9%，当前规模没有掉到风险区间。",
      },
      {
        label: "渠道结构",
        status: "watch",
        detail: "付费流量增速快于自然流量，质量需要继续结合转化页承接一起判断。",
      },
      {
        label: "落地页承接",
        status: "risk",
        detail: "Top 落地页的跳出率偏高，新增流量没有被稳定接住。",
      },
    ],
    tables: [
      {
        title: "渠道结构拆解",
        columns: ["渠道", "昨日会话", "7 日均值", "变化"],
        rows: [
          ["Paid Social", "2,980", "2,540", "+17.3%"],
          ["Organic Search", "2,410", "2,360", "+2.1%"],
          ["Direct", "1,860", "1,940", "-4.1%"],
          ["Email / CRM", "690", "610", "+13.1%"],
        ],
      },
      {
        title: "Top 落地页",
        columns: ["页面", "昨日会话", "跳出率", "收入"],
        rows: [
          ["/products/hero-serum", "1,920", "42.1%", "$1,860"],
          ["/collections/bestsellers", "1,360", "34.4%", "$1,120"],
          ["/products/night-cream", "980", "47.8%", "$760"],
          ["/pages/summer-offer", "760", "51.2%", "$420"],
        ],
      },
    ],
    actions: [
      {
        title: "优先修高流量落地页",
        detail: "先处理跳出率高但会话量大的页面，避免新增流量继续低效流失。",
        priority: "P0",
      },
      {
        title: "复核渠道质量",
        detail: "把 Paid Social 和 Organic Search 分开看，确认增长是不是来自真正能支撑转化的流量。",
        priority: "P1",
      },
      {
        title: "联动转化承接判断",
        detail: "如果落地页问题持续存在，直接去转化承接模块核对加购到结账的掉点位置。",
        priority: "P2",
      },
    ],
    conclusions: [
      "流量规模本身没有问题，今天先不要把注意力放在继续冲量上。",
      "应该优先检查高流量落地页的承接与页面内容，避免新增流量继续低效消耗。",
      "若要进一步判断问题来源，直接去图表页看 Storefront 趋势和 referrer 结构。",
    ],
  },
  conversion: {
    key: "conversion",
    title: "转化承接详情",
    subtitle: "这个模块用来回答流量进来后有没有被接住，以及哪里正在拖累赚钱效率。",
    intro: "转化承接页的重点是看漏斗掉点和页面承接，不是单独把订单结果再重复一遍。",
    accent: "昨日 vs 近 7 日均值",
    primaryQuestion: "流量进来以后是在哪里被漏掉的，哪个承接环节正在拖累今天的赚钱效率？",
    chartHref: "/app/today/conversion",
    chartLabel: "查看转化承接详情",
    chartHint: "当前详情页已经收敛了承接判断，后续会继续补更完整的漏斗趋势深钻。",
    metrics: [
      { label: "昨日转化率", value: "1.82%" },
      { label: "7 日均值", value: "1.64%" },
      { label: "加购率", value: "8.6%" },
      { label: "到达结账率", value: "4.1%" },
      { label: "完成结账率", value: "1.82%" },
      { label: "平均客单价", value: "$64" },
    ],
    statuses: [
      {
        label: "总体转化",
        status: "healthy",
        detail: "昨日结果略高于近 7 日均值，说明转化没有继续下滑。",
      },
      {
        label: "加购到结账",
        status: "watch",
        detail: "中段漏斗仍然偏弱，说明页面说服力和优惠触发还不够稳定。",
      },
      {
        label: "结账完成",
        status: "risk",
        detail: "结账完成率受支付与运费展示影响，最后一步仍有明显流失。",
      },
    ],
    tables: [
      {
        title: "漏斗拆解",
        columns: ["阶段", "昨日", "7 日均值", "变化"],
        rows: [
          ["Sessions", "8,420", "7,950", "+5.9%"],
          ["Add to Cart", "724", "671", "+7.9%"],
          ["Reached Checkout", "346", "332", "+4.2%"],
          ["Completed Checkout", "153", "130", "+17.7%"],
        ],
      },
      {
        title: "重点承接页",
        columns: ["页面", "昨日 CVR", "7 日均值", "备注"],
        rows: [
          ["/products/hero-serum", "2.6%", "2.3%", "主推页，承接稳定"],
          ["/products/night-cream", "1.4%", "1.8%", "详情页掉点偏多"],
          ["/pages/summer-offer", "1.1%", "1.5%", "优惠说明不够清晰"],
          ["/cart", "3.8%", "4.2%", "运费展示仍影响提交"],
        ],
      },
    ],
    actions: [
      {
        title: "优先修商品详情页承接",
        detail: "先处理高流量但 CVR 走弱的商品页，把最明显的中段漏斗掉点止住。",
        priority: "P0",
      },
      {
        title: "复核结账页阻碍",
        detail: "排查支付、运费展示和优惠说明，减少最后一步的流失。",
        priority: "P1",
      },
      {
        title: "对齐流量入口",
        detail: "把流量质量模块里的高流量入口与当前漏斗掉点对照，避免继续把流量送到低效页面。",
        priority: "P2",
      },
    ],
    conclusions: [
      "当前问题不是完全没有转化，而是中后段漏斗还不够稳。",
      "需要优先处理商品详情页和结账页的承接问题，而不是继续盲目放大流量。",
      "图表页更适合继续看 7 天 conversion_rate 趋势和 checkout 相关指标。",
    ],
  },
  orders: {
    key: "orders",
    title: "收入与订单详情",
    subtitle: "这个模块负责解释赚钱规模有没有起来，以及订单增长是不是健康增长。",
    intro: "收入与订单页不再只看订单数，而是一起看收入、客单、退款和折扣对真实赚钱结果的影响。",
    accent: "昨日 vs 近 7 日均值",
    primaryQuestion: "今天的订单和收入增长是不是健康增长，哪些对象正在支撑或侵蚀真实赚钱结果？",
    chartHref: "/app/today/orders",
    chartLabel: "查看收入与订单详情",
    chartHint: "当前详情页已经收敛了收入与订单判断，后续会继续补更完整的趋势深钻。",
    metrics: [
      { label: "昨日订单数", value: "126" },
      { label: "7 日均值", value: "118" },
      { label: "昨日销售额", value: "$8,064" },
      { label: "平均客单价", value: "$64" },
      { label: "取消率", value: "2.4%" },
      { label: "退款率", value: "3.1%" },
    ],
    statuses: [
      {
        label: "订单规模",
        status: "healthy",
        detail: "订单量与销售额都高于 7 日均值，规模侧没有出现新的掉速。",
      },
      {
        label: "收入质量",
        status: "watch",
        detail: "客单价稳定，但部分折扣订单占比抬升，需要继续观察利润质量。",
      },
      {
        label: "售后风险",
        status: "watch",
        detail: "退款率没有失控，但退款原因仍集中在 2 个核心 SKU 上。",
      },
    ],
    tables: [
      {
        title: "订单结果拆解",
        columns: ["指标", "昨日", "7 日均值", "变化"],
        rows: [
          ["订单数", "126", "118", "+6.8%"],
          ["销售额", "$8,064", "$7,510", "+7.4%"],
          ["AOV", "$64", "$63", "+1.6%"],
          ["退款率", "3.1%", "2.8%", "+0.3pp"],
        ],
      },
      {
        title: "重点订单对象",
        columns: ["对象", "昨日值", "备注", "影响"],
        rows: [
          ["高客单订单", "18 单", "主要来自套装", "拉高收入"],
          ["折扣订单", "42 单", "占比偏高", "影响利润"],
          ["退款订单", "4 单", "集中在 2 个 SKU", "侵蚀短期 ROI"],
          ["取消订单", "3 单", "支付失败为主", "轻度影响"],
        ],
      },
    ],
    actions: [
      {
        title: "先拆折扣订单占比",
        detail: "确认订单增长是不是主要由折扣拉动，避免把规模增长误判成赚钱改善。",
        priority: "P0",
      },
      {
        title: "跟进退款集中对象",
        detail: "把退款集中 SKU 和取消订单原因单独排查，减少对短期利润的侵蚀。",
        priority: "P1",
      },
      {
        title: "复核高客单支撑项",
        detail: "确认高客单订单来自哪些商品或套装，判断这些增长是否可持续。",
        priority: "P2",
      },
    ],
    conclusions: [
      "订单模块目前整体稳定，但利润质量还不能只看订单数。",
      "下一步应该把折扣、退款和高客单对象一起看，判断订单增长是不是健康增长。",
      "需要继续深钻时，直接进入 Sales 图表页查看订单和收入趋势。",
    ],
  },
};

export function getTodayOverviewModules(): TodayOverviewModule[] {
  return OVERVIEW_MODULES;
}

export function getTodayRoiMonitor() {
  return {
    metrics: ROI_METRICS,
    factors: ROI_FACTORS,
    chartPath: "/app/today/roi",
    reportPath: "/app/today/roi",
  };
}

export function getTodayMetricDetail(key: TodayBusinessModuleKey): TodayMetricDetail {
  return DETAIL_MAP[key];
}
