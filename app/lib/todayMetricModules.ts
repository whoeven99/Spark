export type TodayBusinessModuleKey = "traffic" | "conversion" | "orders";

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

export type TodayMetricDetail = {
  key: TodayBusinessModuleKey;
  title: string;
  subtitle: string;
  intro: string;
  accent: string;
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
  conclusions: string[];
};

const OVERVIEW_MODULES: TodayOverviewModule[] = [
  {
    key: "traffic",
    title: "流量",
    summary: "昨日流量高于 7 日均值，当前主要增量来自付费渠道回升和首页入口放量。",
    yesterdayLabel: "昨日会话",
    yesterdayValue: "8,420",
    averageLabel: "7 日均值",
    averageValue: "7,950",
    deltaLabel: "较均值",
    deltaValue: "+5.9%",
    detailPath: "/app/today/traffic",
    chartPath: "/app/settings/shopify-reports?tab=storefront&range=7d",
    chartHint: "查看 Shopify Reports / Storefront 的 7 天趋势和来源结构。",
  },
  {
    key: "conversion",
    title: "转化",
    summary: "昨日转化率高于 7 日均值，但加购到结账阶段仍有掉点，需要继续观察承接页质量。",
    yesterdayLabel: "昨日转化率",
    yesterdayValue: "1.82%",
    averageLabel: "7 日均值",
    averageValue: "1.64%",
    deltaLabel: "较均值",
    deltaValue: "+0.18pp",
    detailPath: "/app/today/conversion",
    chartPath: "/app/settings/shopify-reports?tab=storefront&range=7d",
    chartHint: "查看 Shopify Reports / Storefront 的漏斗和转化趋势。",
  },
  {
    key: "orders",
    title: "订单",
    summary: "昨日订单量和收入都略高于 7 日均值，退款和取消暂时没有形成新的异常抬头。",
    yesterdayLabel: "昨日订单数",
    yesterdayValue: "126",
    averageLabel: "7 日均值",
    averageValue: "118",
    deltaLabel: "较均值",
    deltaValue: "+6.8%",
    detailPath: "/app/today/orders",
    chartPath: "/app/settings/shopify-reports?tab=sales&range=7d",
    chartHint: "查看 Shopify Reports / Sales 的订单和销售额趋势。",
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
  traffic: {
    key: "traffic",
    title: "流量详情",
    subtitle: "先看昨日结果与 7 日均值，再判断流量规模、渠道结构和落地页承接是否健康。",
    intro: "这个页面先沿用订单详情页的组织方式，把流量当成独立模块来读：先看摘要，再看状态、关键对象和结论。",
    accent: "昨日 vs 近 7 日均值",
    chartHref: "/app/settings/shopify-reports?tab=storefront&range=7d",
    chartLabel: "查看流量图表",
    chartHint: "进入 Shopify Reports / Storefront，可继续查看 sessions、referrer 与 7 天趋势。",
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
    conclusions: [
      "流量规模本身没有问题，今天先不要把注意力放在继续冲量上。",
      "应该优先检查高流量落地页的承接与页面内容，避免新增流量继续低效消耗。",
      "若要进一步判断问题来源，直接去图表页看 Storefront 趋势和 referrer 结构。",
    ],
  },
  conversion: {
    key: "conversion",
    title: "转化详情",
    subtitle: "把转化当成独立经营模块，先看结果，再看漏斗掉点和承接对象。",
    intro: "这里延续订单详情页的版式，但主题切到转化模块，重点不看订单履约，而是看漏斗掉点和页面承接效率。",
    accent: "昨日 vs 近 7 日均值",
    chartHref: "/app/settings/shopify-reports?tab=storefront&range=7d",
    chartLabel: "查看转化图表",
    chartHint: "进入 Shopify Reports / Storefront，可继续查看 conversion_rate 与 checkout 漏斗。",
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
    conclusions: [
      "当前问题不是完全没有转化，而是中后段漏斗还不够稳。",
      "需要优先处理商品详情页和结账页的承接问题，而不是继续盲目放大流量。",
      "图表页更适合继续看 7 天 conversion_rate 趋势和 checkout 相关指标。",
    ],
  },
  orders: {
    key: "orders",
    title: "订单详情",
    subtitle: "订单模块先看昨日与 7 日均值，再检查收入、取消和退款是否出现新的异常。",
    intro: "订单页不再承担完整订单监控中心的职责，而是先收敛成 Today 里“订单模块”的对应详情页面。",
    accent: "昨日 vs 近 7 日均值",
    chartHref: "/app/settings/shopify-reports?tab=sales&range=7d",
    chartLabel: "查看订单图表",
    chartHint: "进入 Shopify Reports / Sales，可继续查看 total sales、orders 与商品维度拆解。",
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
    chartPath: "/app/insights/charts?range=7",
    reportPath: "/app/today/insights",
  };
}

export function getTodayMetricDetail(key: TodayBusinessModuleKey): TodayMetricDetail {
  return DETAIL_MAP[key];
}
