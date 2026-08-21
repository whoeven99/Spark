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

type SnapshotStatus = "healthy" | "watch" | "risk";
type SnapshotSource = "real" | "estimated" | "pending";

type HealthMonitorSnapshotEnvironment = {
  key:
    | "new-arrivals"
    | "inventory"
    | "fulfillment"
    | "payments"
    | "risk-control"
    | "after-sales"
    | "conversion";
  status: SnapshotStatus;
  source: SnapshotSource;
  summary: string;
  metrics: Record<string, number | string | boolean | null>;
};

type HealthMonitorSnapshotItem = {
  key: string;
  name: string;
  status: SnapshotStatus;
  metrics: Record<string, number | string | boolean | null>;
  evidence: string[];
  reasoning: string[];
};

type HealthMonitorSnapshotMetrics = Record<string, number | string | boolean | null>;

type HealthMonitorSnapshotOverview = {
  salesGrowthRate: number | null;
  sessions7d: number | null;
  conversionRate7d: number | null;
};

export type HealthMonitorSnapshotInput = {
  metrics?: HealthMonitorSnapshotMetrics;
  overview?: HealthMonitorSnapshotOverview;
  environments?: HealthMonitorSnapshotEnvironment[];
  items?: HealthMonitorSnapshotItem[];
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
    id: "payment-health",
    group: "可信度健康",
    relatedModule: "收入与订单",
    title: "支付成功率",
    value: "成功率 93.8%",
    status: "watch",
    summary: "支付链路还没有失控，但已经开始影响订单完成率，需要继续盯住。",
    issue: "支付成功率低于稳态区间，结账链路可能已经在吞掉本应完成的订单。",
    evidence: [
      { label: "支付成功率", value: "近 7 天支付成功率 93.8%，低于稳态目标 97% 以上。" },
      { label: "失败订单", value: "失败订单主要集中在移动端结账与特定支付方式。" },
      { label: "业务传导", value: "支付失败会直接拖累订单完成率，并放大转化漏斗后段流失。" },
    ],
    actions: [
      { title: "先锁定失败场景", detail: "按设备、支付方式和地区拆开看，不把支付异常当成一个总问题。" },
      { title: "复核结账链路", detail: "优先检查移动端结账页、回跳链路和常见失败原因。" },
      { title: "保留监测阈值", detail: "把支付成功率放进固定监测，避免问题短期恢复后又反复。" },
    ],
    aiPrompt:
      "请基于这份支付成功率监测结果，判断当前更像支付配置问题、结账流程问题还是设备端问题，并给出最小排查路径。",
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
    id: "product-readiness-health",
    group: "目标健康",
    relatedModule: "收入与订单",
    title: "商品就绪度",
    value: "5 个商品待补齐",
    status: "watch",
    summary: "上新链路没有卡死，但商品信息完整度已经开始拖慢后续转化承接。",
    issue: "部分商品仍处于信息不完整或待上架状态，会影响上新节奏和经营结果放大。",
    evidence: [
      { label: "待处理对象", value: "仍有商品草稿、缺图商品和缺描述商品需要补齐。" },
      { label: "影响范围", value: "问题主要集中在新上架与计划主推商品。" },
      { label: "经营关联", value: "商品未就绪会直接影响流量承接、转化与广告放量节奏。" },
    ],
    actions: [
      { title: "先处理主推商品", detail: "不要平均补齐所有商品，优先处理近期要承接流量的对象。" },
      { title: "按缺口拆动作", detail: "把缺图、缺描述、待上架拆成不同任务，避免执行含混。" },
      { title: "纳入任务中心", detail: "把待补齐商品直接转进 Tasks，而不是停留在诊断结论层。" },
    ],
    aiPrompt:
      "请基于这份商品就绪度结果，帮我按经营影响排序当前最该先补齐的对象，并拆成可以直接执行的任务。",
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
    id: "refund-health",
    group: "目标健康",
    relatedModule: "收入与订单",
    title: "退款健康度",
    value: "退款率 3.8%",
    status: "watch",
    summary: "退款问题还没恶化成经营事故，但已经在持续侵蚀利润与用户体验。",
    issue: "退款率高于理想区间，售后与履约问题已经开始吃掉真实收入质量。",
    evidence: [
      { label: "退款率", value: "近 30 天退款率 3.8%，高于当前控制目标。" },
      { label: "问题集中", value: "退款主要集中在少数 SKU 和履约体验较差的订单。" },
      { label: "结果影响", value: "退款率抬升会直接吞掉利润，并影响复购与评价。" },
    ],
    actions: [
      { title: "先找高影响退款对象", detail: "按 SKU、订单来源和退款原因拆开看，先处理最集中的问题。" },
      { title: "联动履约与商品", detail: "不要只在售后侧找原因，要同步检查履约异常与商品表达。" },
      { title: "把治理动作转任务", detail: "把高频退款对象直接送进 Tasks，避免停留在报告层。" },
    ],
    aiPrompt:
      "请基于这份退款健康度结果，帮我先判断问题更偏商品、履约还是售后流程，并给出优先处理顺序。",
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
    id: "risk-control-health",
    group: "可信度健康",
    relatedModule: "全局",
    title: "风控链路",
    value: "待接入",
    status: "watch",
    summary: "风控链路还没有足够数据形成正式判断，当前需要先补齐监测输入。",
    issue: "风控相关监测尚未完整接入，当前无法稳定判断是否存在误杀或高风险订单阻塞。",
    evidence: [
      { label: "当前状态", value: "误杀率、拒付率和高风险订单占比还未形成稳定监测。" },
      { label: "风险点", value: "一旦风控配置异常，可能直接干扰支付成功率与订单转化。" },
      { label: "当前判断", value: "现在更需要补齐数据输入，而不是对结果做过度解读。" },
    ],
    actions: [
      { title: "先补齐监测输入", detail: "明确需要的风控事件、订单标签和拒付数据来源。" },
      { title: "和支付链路联动看", detail: "后续把风控与支付成功率放到同一条诊断链路里看。" },
    ],
    aiPrompt:
      "请基于这份风控链路结果，告诉我当前缺什么输入才能形成稳定诊断，以及接入顺序应该怎么排。",
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

export function getHealthMonitorGroupsFromRecords(records: HealthMonitorRecord[]) {
  return GROUP_ORDER.map((group) => ({
    title: group,
    items: records.filter((item) => item.group === group),
  }));
}

export function getHealthMonitorSummary(records: HealthMonitorRecord[] = HEALTH_MONITORS) {
  const riskCount = records.filter((item) => item.status === "risk").length;
  const watchCount = records.filter((item) => item.status === "watch").length;
  const goodCount = records.filter((item) => item.status === "good").length;

  return {
    total: records.length,
    completed: records.length,
    progress: 100,
    riskCount,
    watchCount,
    goodCount,
    groups: getHealthMonitorGroupsFromRecords(records).map((group) => {
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

export function buildHealthMonitorRecords(
  snapshot?: HealthMonitorSnapshotInput,
): HealthMonitorRecord[] {
  if (!snapshot) return HEALTH_MONITORS;

  const metrics = snapshot.metrics ?? {};
  const overview = snapshot.overview;
  const environmentByKey = new Map(
    (snapshot.environments ?? []).map((environment) => [environment.key, environment]),
  );
  const itemByKey = new Map((snapshot.items ?? []).map((item) => [item.key, item]));

  return HEALTH_MONITORS.map((record) => {
    switch (record.id) {
      case "payment-health": {
        const environment = environmentByKey.get("payments");
        if (!environment) return record;
        const rate = toNumber(environment.metrics["paymentSuccessRate7d"]);
        const attempts = toNumber(environment.metrics["paymentAttempts7d"]);
        const success = toNumber(environment.metrics["paymentSuccessful7d"]);
        const failure = toNumber(environment.metrics["paymentFailureCount7d"]);
        return {
          ...record,
          value:
            rate !== null
              ? `成功率 ${formatPercent(rate)}`
              : environment.source === "pending"
                ? "待补数据"
                : record.value,
          status: toHealthMonitorStatus(environment.status),
          summary: environment.summary,
          issue: environment.summary,
          evidence: mergeEvidence(record.evidence, [
            rate !== null ? `近 7 天支付成功率 ${formatPercent(rate)}。` : null,
            attempts !== null && success !== null
              ? `近 7 天共 ${formatInteger(attempts)} 次支付尝试，成功 ${formatInteger(success)} 次。`
              : null,
            failure !== null && failure > 0
              ? `近 7 天仍有 ${formatInteger(failure)} 笔未成功支付。`
              : null,
          ]),
        };
      }
      case "product-readiness-health": {
        const environment = environmentByKey.get("new-arrivals");
        if (!environment) return record;
        const draftCount = toNumber(environment.metrics["draftProductCount"]) ?? 0;
        const noImagesCount = toNumber(environment.metrics["noImagesProductCount"]) ?? 0;
        const noDescriptionCount = toNumber(environment.metrics["noDescriptionProductCount"]) ?? 0;
        const total = draftCount + noImagesCount + noDescriptionCount;
        return {
          ...record,
          value:
            draftCount > 0
              ? `${formatInteger(draftCount)} 个商品待复盘`
              : total > 0
                ? `${formatInteger(total)} 个商品待补齐`
                : environment.source === "pending"
                  ? "待接入"
                  : "已就绪",
          status: toHealthMonitorStatus(environment.status),
          summary: environment.summary,
          issue: environment.summary,
          evidence: mergeEvidence(record.evidence, [
            draftCount > 0 ? `${formatInteger(draftCount)} 个商品草稿待上架，建议优先复盘上新卡点。` : null,
            noImagesCount > 0 ? `${formatInteger(noImagesCount)} 个商品缺少图片。` : null,
            noDescriptionCount > 0 ? `${formatInteger(noDescriptionCount)} 个商品缺少描述。` : null,
          ]),
        };
      }
      case "conversion-health": {
        const environment = environmentByKey.get("conversion");
        const item = itemByKey.get("conversion_health");
        if (!environment) return record;
        const rate = toNumber(environment.metrics["conversionRate7d"]);
        const trafficChangeRate = toNumber(environment.metrics["trafficChangeRate"]);
        return {
          ...record,
          value:
            rate !== null
              ? `CVR ${formatPercent(rate)}`
              : environment.source === "pending"
                ? "待补数据"
                : record.value,
          status: toHealthMonitorStatus(item?.status ?? environment.status),
          summary: item?.reasoning[0] ?? environment.summary,
          issue: item?.reasoning[0] ?? environment.summary,
          evidence: mergeEvidence(record.evidence, [
            rate !== null ? `近 7 天转化率 ${formatPercent(rate)}。` : null,
            trafficChangeRate !== null
              ? `近 7 天流量环比 ${formatSignedPercent(trafficChangeRate)}。`
              : null,
            item?.evidence[0] ?? null,
          ]),
        };
      }
      case "refund-health": {
        const environment = environmentByKey.get("after-sales");
        const item = itemByKey.get("refund_health");
        if (!environment) return record;
        const rate = toNumber(environment.metrics["refundRate30d"]);
        const delta = toNumber(environment.metrics["refundRateDelta"]);
        return {
          ...record,
          value: rate !== null ? `退款率 ${formatPercent(rate)}` : record.value,
          status: toHealthMonitorStatus(item?.status ?? environment.status),
          summary: item?.reasoning[0] ?? environment.summary,
          issue: item?.reasoning[0] ?? environment.summary,
          evidence: mergeEvidence(record.evidence, [
            rate !== null ? `近 30 天退款率 ${formatPercent(rate)}。` : null,
            delta !== null ? `相较上一观察窗口变化 ${formatSignedPercent(delta, "pp")}。` : null,
            item?.evidence[0] ?? null,
          ]),
        };
      }
      case "inventory-health": {
        const environment = environmentByKey.get("inventory");
        const item = itemByKey.get("inventory_health");
        if (!environment) return record;
        const riskSkuCount = toNumber(environment.metrics["riskSkuCount"]) ?? 0;
        const estimatedLoss = toNumber(environment.metrics["estimatedInventoryLoss"]);
        const currency = toStringValue(environment.metrics["currency"]) ?? "USD";
        return {
          ...record,
          value: `${formatInteger(riskSkuCount)} 个 SKU < 7天`,
          status: toHealthMonitorStatus(item?.status ?? environment.status),
          summary: item?.reasoning[0] ?? environment.summary,
          issue: item?.reasoning[0] ?? environment.summary,
          evidence: mergeEvidence(record.evidence, [
            riskSkuCount > 0 ? `${formatInteger(riskSkuCount)} 个高动销 SKU 已进入缺货风险区。` : "当前未发现高风险库存 SKU。",
            estimatedLoss !== null
              ? `预计未来 7 天库存风险损失 ${formatMoney(estimatedLoss, currency)}。`
              : null,
            item?.evidence[0] ?? null,
          ]),
        };
      }
      case "fulfillment-health": {
        const environment = environmentByKey.get("fulfillment");
        const item = itemByKey.get("fulfillment_health");
        if (!environment) return record;
        const overdueOrderCount = toNumber(environment.metrics["overdueOrderCount"]) ?? 0;
        const carrierIssueCount = toNumber(environment.metrics["carrierIssueCount"]) ?? 0;
        const fulfillmentRate30d = toNumber(environment.metrics["fulfillmentRate30d"]);
        return {
          ...record,
          value:
            overdueOrderCount > 0
              ? `超时单 ${formatInteger(overdueOrderCount)} 单`
              : fulfillmentRate30d !== null
                ? `履约率 ${formatPercent(fulfillmentRate30d)}`
                : record.value,
          status: toHealthMonitorStatus(item?.status ?? environment.status),
          summary: item?.reasoning[0] ?? environment.summary,
          issue: item?.reasoning[0] ?? environment.summary,
          evidence: mergeEvidence(record.evidence, [
            overdueOrderCount > 0 ? `当前有 ${formatInteger(overdueOrderCount)} 单超时未发货。` : null,
            carrierIssueCount > 0 ? `当前有 ${formatInteger(carrierIssueCount)} 单物流轨迹异常。` : null,
            fulfillmentRate30d !== null ? `近 30 天履约率 ${formatPercent(fulfillmentRate30d)}。` : null,
          ]),
        };
      }
      case "risk-control-health": {
        const environment = environmentByKey.get("risk-control");
        if (!environment) return record;
        return {
          ...record,
          value: environment.source === "pending" ? "待接入" : record.value,
          status: toHealthMonitorStatus(environment.status),
          summary: environment.summary,
          issue: environment.summary,
        };
      }
      case "revenue-health": {
        const item = itemByKey.get("sales_trend");
        const salesGrowthRate =
          overview?.salesGrowthRate ?? toNumber(metrics["salesGrowthRate"]);
        const salesAmount7d = toNumber(metrics["salesAmount7d"]);
        const currency = toStringValue(metrics["currency"]) ?? "USD";
        if (!item && salesGrowthRate === null) return record;
        return {
          ...record,
          value:
            salesGrowthRate !== null
              ? `近 7 天 ${formatSignedPercent(salesGrowthRate)}`
              : record.value,
          status: item ? toHealthMonitorStatus(item.status) : record.status,
          summary: item?.reasoning[0] ?? record.summary,
          issue: item?.reasoning[0] ?? record.issue,
          evidence: mergeEvidence(record.evidence, [
            salesAmount7d !== null
              ? `近 7 天销售额 ${formatMoney(salesAmount7d, currency)}。`
              : null,
            salesGrowthRate !== null
              ? `近 7 天销售额环比 ${formatSignedPercent(salesGrowthRate)}。`
              : null,
            item?.evidence[0] ?? null,
          ]),
        };
      }
      case "traffic-health": {
        const item = itemByKey.get("traffic_anomaly");
        const sessions7d = overview?.sessions7d ?? toNumber(metrics["sessions7d"]);
        const trafficChangeRate = toNumber(metrics["trafficChangeRate"]);
        if (!item && sessions7d === null && trafficChangeRate === null) return record;
        return {
          ...record,
          value:
            trafficChangeRate !== null
              ? `Sessions ${formatSignedPercent(trafficChangeRate)}`
              : sessions7d !== null
                ? `Sessions ${formatInteger(sessions7d)}`
                : record.value,
          status: item ? toHealthMonitorStatus(item.status) : record.status,
          summary: item?.reasoning[0] ?? record.summary,
          issue: item?.reasoning[0] ?? record.issue,
          evidence: mergeEvidence(record.evidence, [
            sessions7d !== null ? `近 7 天会话数 ${formatInteger(sessions7d)}。` : null,
            trafficChangeRate !== null
              ? `近 7 天流量环比 ${formatSignedPercent(trafficChangeRate)}。`
              : null,
            item?.evidence[0] ?? null,
          ]),
        };
      }
      default:
        return record;
    }
  });
}

function mergeEvidence(
  fallback: Array<{ label: string; value: string }>,
  evidence: Array<string | null>,
): Array<{ label: string; value: string }> {
  const normalized = evidence
    .filter((entry): entry is string => Boolean(entry && entry.trim()))
    .slice(0, 3)
    .map((entry, index) => ({
      label: index === 0 ? "当前数据" : index === 1 ? "补充判断" : "联动证据",
      value: entry,
    }));

  if (normalized.length >= 2) return normalized;
  return [...normalized, ...fallback].slice(0, 3);
}

function toHealthMonitorStatus(status: SnapshotStatus): HealthMonitorStatus {
  return status === "healthy" ? "good" : status;
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number): string {
  return `${stripTrailingZero(value)}%`;
}

function formatSignedPercent(value: number, suffix = "%"): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${stripTrailingZero(value)}${suffix}`;
}

function formatMoney(value: number, currency: string): string {
  return `${stripTrailingZero(value)} ${currency}`;
}

function stripTrailingZero(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
