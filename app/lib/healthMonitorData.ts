export type HealthMonitorStatus = "good" | "watch" | "risk";

export type HealthMonitorRecord = {
  id: string;
  group: "可信度健康" | "目标健康";
  relatedModule: "ROI" | "收入与订单" | "流量质量" | "转化承接" | "全局";
  title: string;
  value: string;
  status: HealthMonitorStatus;
  summary: string;
  issue: string;
  evidence: Array<{ label: string; value: string }>;
  actions: Array<{ title: string; detail: string }>;
  aiPrompt: string;
};

export const HEALTH_MONITORS: HealthMonitorRecord[] = [
  {
    id: "page-performance",
    group: "可信度健康",
    relatedModule: "转化承接",
    title: "页面性能",
    value: "LCP 4.8s",
    status: "watch",
    summary: "首页与核心落地页仍偏慢，但问题已收敛到少数关键页面。",
    issue: "移动端核心页面加载偏慢，已经开始影响落地页承接效率。",
    evidence: [
      { label: "核心指标", value: "移动端 LCP 4.8s，仍高于建议阈值 2.5s。" },
      { label: "影响页面", value: "首页、爆款集合页、广告主落地页表现最弱。" },
      { label: "业务关联", value: "这些页面对应的 CVR 比站内均值低 0.5 个百分点。" },
    ],
    actions: [
      { title: "先缩小问题范围", detail: "只盯首页、爆款页和广告落地页，不先做全站优化。" },
      { title: "优先处理首屏资源", detail: "检查大图、轮播和第三方脚本，先压缩会拖慢 LCP 的部分。" },
      { title: "建立固定监测对象", detail: "把关键页面纳入每日健康度监测，避免修完后再次回退。" },
    ],
    aiPrompt:
      "请基于这份页面性能监测结果，判断它是否已经构成今日需要优先处理的问题，并给出 3 条按优先级排序的修复动作。",
  },
  {
    id: "seo-health",
    group: "可信度健康",
    relatedModule: "流量质量",
    title: "SEO 情况",
    value: "CTR 3.4%",
    status: "good",
    summary: "自然流量整体稳定，当前不是今天最优先的问题。",
    issue: "SEO 侧整体稳定，没有出现需要立刻进入处理流程的异常。",
    evidence: [
      { label: "曝光趋势", value: "近 7 天 Search Console 曝光量基本持平。" },
      { label: "点击率", value: "核心查询 CTR 3.4%，与近 30 天均值接近。" },
      { label: "异常信号", value: "未发现大量索引丢失或排名突然下滑。" },
    ],
    actions: [
      { title: "保持周频复盘", detail: "SEO 更适合看趋势，不需要日内频繁动作。" },
      { title: "聚焦高意图页", detail: "继续补强商品页与集合页的标题和结构化信息。" },
    ],
    aiPrompt:
      "请基于这份 SEO 监测结果，帮我判断当前是否需要动作，若不需要，也请说明接下来应持续观察什么。",
  },
  {
    id: "roi-health",
    group: "目标健康",
    relatedModule: "ROI",
    title: "ROI 情况（短期和长期）",
    value: "1.9x / 2.8x",
    status: "risk",
    summary: "短期 ROI 仍承压，虽然长期表现还在安全区，但今天需要优先处理。",
    issue: "短期 ROI 已低于目标线，且拖累来源集中在投放承接与转化两端。",
    evidence: [
      { label: "短期 ROI", value: "近 7 天 ROI 1.9x，低于目标线 2.3x。" },
      { label: "长期 ROI", value: "近 30 天 ROI 2.8x，尚未跌出健康区间。" },
      { label: "拖累来源", value: "广告投放效率偏弱，转化率也在同步下滑。" },
    ],
    actions: [
      { title: "先止损短期 ROI", detail: "聚焦最近 7 天回报最差的广告与落地页，优先收口。" },
      { title: "不要只看广告侧", detail: "把转化率页一起联动，避免只在投放上做错误归因。" },
      { title: "保留长期视角", detail: "短期止损的同时，注意不要误伤长期有效的投放组合。" },
    ],
    aiPrompt:
      "请把这份 ROI 监测结果整理成可执行的排查顺序，先判断问题更偏投放、站点承接，还是转化漏斗。",
  },
  {
    id: "revenue-health",
    group: "目标健康",
    relatedModule: "收入与订单",
    title: "收入健康度",
    value: "近 7 天 +2%",
    status: "watch",
    summary: "收入没有明显下滑，但增速已经放缓，需要继续盯紧。",
    issue: "收入还未转为负增长，但当前增长动能偏弱，已进入关注状态。",
    evidence: [
      { label: "收入趋势", value: "近 7 天收入仅同比增长 2%。" },
      { label: "结构变化", value: "高客单商品贡献下降，低客单补量较多。" },
      { label: "联动指标", value: "转化率与广告效率偏弱，限制了收入放大。" },
    ],
    actions: [
      { title: "先判断收入弱在哪", detail: "区分是流量不够、转化不够，还是客单价下降。" },
      { title: "拆解贡献来源", detail: "按渠道和商品层级看清楚是谁在拖慢收入。" },
    ],
    aiPrompt:
      "请基于这份收入健康度结果，判断最可能的拖累来源，并给出接下来该先看的两个对象。",
  },
  {
    id: "traffic-health",
    group: "目标健康",
    relatedModule: "流量质量",
    title: "流量健康度",
    value: "Sessions +11%",
    status: "good",
    summary: "流量侧整体健康，当前不是主要矛盾。",
    issue: "流量总体稳定并有增长，当前问题更可能出在承接和转化质量。",
    evidence: [
      { label: "总流量", value: "近 7 天 Sessions 增长 11%。" },
      { label: "渠道分布", value: "Paid 与 Organic 都没有出现明显断崖。" },
      { label: "风险判断", value: "流量不是今天最需要优先处理的异常。" },
    ],
    actions: [
      { title: "继续保持趋势监控", detail: "不用额外开专题处理，但要继续保留监测。" },
    ],
    aiPrompt:
      "请基于这份流量健康度结果，说明为什么它当前不是主要问题，并提醒我接下来该联动看哪些指标。",
  },
  {
    id: "ads-health",
    group: "目标健康",
    relatedModule: "ROI",
    title: "广告投放健康度",
    value: "ROAS 1.7x",
    status: "watch",
    summary: "投放侧在拉低短期回报，但目前更像效率问题，不是彻底失控。",
    issue: "广告投放效率偏弱，已开始拖累短期 ROI，需要继续跟进。",
    evidence: [
      { label: "投放效率", value: "ROAS 1.7x，低于近 30 天均值 2.1x。" },
      { label: "问题集中", value: "主要集中在少数高花费广告组。" },
      { label: "结合转化", value: "落地页 CVR 同步偏低，说明不能只归因给广告本身。" },
    ],
    actions: [
      { title: "先找高花费低回报对象", detail: "按广告组和落地页组合看，而不是只看平台总览。" },
      { title: "同步检查承接页", detail: "确认问题到底出在买量质量，还是站内承接。" },
    ],
    aiPrompt:
      "请基于这份广告投放健康度结果，判断当前更像投放问题还是承接问题，并给出最小排查路径。",
  },
  {
    id: "conversion-health",
    group: "目标健康",
    relatedModule: "转化承接",
    title: "转化率健康度",
    value: "CVR 1.4%",
    status: "risk",
    summary: "转化率已经明显低于基准，是今天最值得先处理的经营问题之一。",
    issue: "转化率低于基准线，且正在与 ROI 下滑形成叠加影响。",
    evidence: [
      { label: "核心指标", value: "CVR 1.4%，低于近 30 天均值 1.9%。" },
      { label: "影响范围", value: "广告主落地页与商品详情页跌幅最明显。" },
      { label: "结果传导", value: "转化率走弱正在直接拖累短期 ROI 和收入效率。" },
    ],
    actions: [
      { title: "先抓高流量低转化页面", detail: "不要平均看所有页面，先找承接最差且流量最大的对象。" },
      { title: "复核关键说服信息", detail: "优先检查价格、发货承诺、评价与 CTA 是否清楚。" },
      { title: "直接生成任务", detail: "把需要修改的页面与对象直接转成现有 Tasks。" },
    ],
    aiPrompt:
      "请基于这份转化率健康度结果，帮我先判断是页面承接、商品表达还是价格策略的问题，并给出可直接进任务系统的动作。",
  },
  {
    id: "inventory-health",
    group: "目标健康",
    relatedModule: "收入与订单",
    title: "库存健康度",
    value: "3 个 SKU < 7天",
    status: "watch",
    summary: "库存问题还可控，但已经有几项高动销 SKU 接近安全线。",
    issue: "部分高动销 SKU 即将触及库存安全线，需要提前处理。",
    evidence: [
      { label: "风险 SKU", value: "3 个高动销 SKU 预计可售天数不足 7 天。" },
      { label: "影响对象", value: "其中 2 个 SKU 同时是广告主推商品。" },
      { label: "当前判断", value: "尚未形成经营事故，但已进入关注区。" },
    ],
    actions: [
      { title: "先看高动销 SKU", detail: "按销量与投放权重排序，先保主推商品不断货。" },
      { title: "联动广告节奏", detail: "必要时先控制引流节奏，避免库存风险被放大。" },
    ],
    aiPrompt:
      "请基于这份库存健康度结果，帮我设计一个优先处理顺序，避免主推 SKU 缺货影响投放和收入。",
  },
  {
    id: "fulfillment-health",
    group: "目标健康",
    relatedModule: "收入与订单",
    title: "履约健康度",
    value: "超时单 4.6%",
    status: "watch",
    summary: "履约异常还没演变成大问题，但已经开始向退款和差评传导。",
    issue: "超时未发货订单占比偏高，已开始对用户体验和退款率产生影响。",
    evidence: [
      { label: "履约指标", value: "超时未发货订单占比 4.6%。" },
      { label: "结果联动", value: "相关订单退款率 9.2%，明显高于整体水平。" },
      { label: "基准比较", value: "正常控制目标应在 2% 以内。" },
    ],
    actions: [
      { title: "按仓库和渠道拆开", detail: "不要把履约问题当成一个总问题，先定位来源。" },
      { title: "先处理异常订单", detail: "把超时订单直接推送到 Tasks，避免只看报告不行动。" },
    ],
    aiPrompt:
      "请基于这份履约健康度结果，判断问题更像仓库、承运商还是内部流程异常，并给出优先处理顺序。",
  },
  {
    id: "pricing-health",
    group: "目标健康",
    relatedModule: "ROI",
    title: "商品成本和定价健康度",
    value: "毛利率 46%",
    status: "good",
    summary: "当前毛利结构稳定，暂未发现需要立刻调整定价的异常。",
    issue: "定价与毛利结构整体稳定，目前不是今天要优先深入的问题。",
    evidence: [
      { label: "毛利率", value: "整体毛利率 46%，处于可接受区间。" },
      { label: "异常检查", value: "未发现大规模低毛利或赔钱成交的商品群。" },
      { label: "联动判断", value: "当前经营压力并不主要来自定价策略。" },
    ],
    actions: [
      { title: "保持例行监测", detail: "继续保留定价健康度监测，无需今天单独开专题。" },
    ],
    aiPrompt:
      "请基于这份商品成本和定价健康度结果，说明为什么当前不是优先问题，并提醒我什么情况下需要重新看它。",
  },
];

const GROUP_ORDER: HealthMonitorRecord["group"][] = ["可信度健康", "目标健康"];

export function getHealthMonitorGroups() {
  return GROUP_ORDER.map((group) => ({
    title: group,
    items: HEALTH_MONITORS.filter((item) => item.group === group),
  }));
}

export function getHealthMonitorSummary() {
  const riskCount = HEALTH_MONITORS.filter((item) => item.status === "risk").length;
  const watchCount = HEALTH_MONITORS.filter((item) => item.status === "watch").length;
  const goodCount = HEALTH_MONITORS.filter((item) => item.status === "good").length;

  return {
    total: HEALTH_MONITORS.length,
    completed: HEALTH_MONITORS.length,
    progress: 100,
    riskCount,
    watchCount,
    goodCount,
    groups: getHealthMonitorGroups().map((group) => {
      const groupRiskCount = group.items.filter((item) => item.status === "risk").length;
      const groupWatchCount = group.items.filter((item) => item.status === "watch").length;
      const groupGoodCount = group.items.filter((item) => item.status === "good").length;
      const status =
        groupRiskCount > 0 ? "risk" : groupWatchCount > 0 ? "watch" : "good";

      return {
        title: group.title,
        status,
        riskCount: groupRiskCount,
        watchCount: groupWatchCount,
        goodCount: groupGoodCount,
      };
    }),
  };
}

export function getPriorityHealthMonitors(limit = 3) {
  return [...HEALTH_MONITORS]
    .sort((a, b) => statusRank(b.status) - statusRank(a.status))
    .slice(0, limit);
}

function statusRank(status: HealthMonitorStatus) {
  if (status === "risk") return 2;
  if (status === "watch") return 1;
  return 0;
}
