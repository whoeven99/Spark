import { buildManagedAiLaunchContextFromSpec } from "../../lib/managedAiLaunchContext";
import { buildTodayAnalysisTodoRefinePrompt } from "../../lib/todayReportAi";
import type {
  TodayAnalysisCard,
  TodayAnalysisOverviewCard,
  TodayAnalysisPageReport,
  TodayMetricCard,
  TodayOverviewReport,
  TodayReasonCard,
  TodayRoiSummaryCard,
} from "../../lib/todayReportTypes";

export function buildTodayAnalysisPages(report: TodayOverviewReport): TodayAnalysisPageReport[] {
  const revenue = findMetric(report.metricCards, "revenue");
  const cost = findMetric(report.metricCards, "cost");
  const profit = findMetric(report.metricCards, "profit");
  const margin = findMetric(report.metricCards, "profit_margin");
  const orders = findMetric(report.metricCards, "orders");
  const aov = findMetric(report.metricCards, "aov");
  const shortTermRoi = findRoi(report.roiSummary.cards, "short_term");
  const lifetimeRoi = findRoi(report.roiSummary.cards, "lifetime");
  const efficiencyShift = findReason(report.reasonCards, "efficiency-shift");
  const profitErosion = findReason(report.reasonCards, "profit-erosion");

  return [
    {
      key: "product",
      title: "产品分析",
      subtitle: "产品分析关注的是定价、单品利润和库存周转，不把产品问题混进广告或健康度里。",
      summary: "产品分析先回答三件事：价格带有没有支撑成交、单品利润有没有留下来、库存周转会不会拖慢经营动作。",
      principles: [
        "定价不是只看卖不卖得动，还要看价格带是否支撑利润留存。",
        "单品利润要和折扣、退款、客单结构一起看，避免把规模增长误判成产品成功。",
        "库存周转更偏执行层，应该继续下钻到库存健康和 SKU 风险对象。",
      ],
      cards: [
        buildCard({
          key: "pricing",
          title: "定价分析",
          question: "当前价格带是不是在支撑成交和利润，而不是只带来短期高客单？",
          conclusion: aov?.summary ?? "先确认当前价格带带来的高客单，是不是可复制的健康样本。",
          metricLabel: aov?.label ?? "客单价",
          metricValue: aov?.value ?? "—",
          evidence: [
            evidence(aov?.label ?? "客单价", aov?.value ?? "—", aov?.delta),
            evidence(revenue?.label ?? "收入", revenue?.value ?? "—", revenue?.delta),
            evidence(orders?.label ?? "订单数", orders?.value ?? "—", orders?.delta),
          ],
          ideas: [
            "先拆高客单样本，确认是不是少数异常订单把均值抬高。",
            "把价格带和利润一起看，避免只涨客单、不留利润。",
            "继续核对折扣订单占比，避免定价被强促销掩盖。",
          ],
          todos: [
            reportTodo(
              "price-band-aov",
              "复核高客单来源",
              "进入收入页确认高客单是不是来自少数样本订单或特定商品组合。",
              "看收入 / 客单价",
              "/app/today/revenue?focus=aov",
            ),
            reportTodo(
              "price-band-profit",
              "联动利润看价格带质量",
              "把客单价和利润页一起看，确认价格带提升是否真的留下利润。",
              "看利润页",
              "/app/today/profit?focus=profit",
            ),
            assistantTodo("产品分析", "定价分析", "把价格带进一步拆成可执行 today todo", [
              aov?.label ? `${aov.label}: ${aov.value} ${aov.delta}` : null,
              revenue?.label ? `${revenue.label}: ${revenue.value} ${revenue.delta}` : null,
            ]),
          ],
        }),
        buildCard({
          key: "unit-profit",
          title: "单品利润分析",
          question: "哪些商品真的留下利润，哪些商品正在吞利润？",
          conclusion: "这里先看单品有没有真正留下利润，再下钻到商品与订单对象，确认是谁在吞利润。",
          metricLabel: profit?.label ?? "利润",
          metricValue: profit?.value ?? "—",
          evidence: [
            evidence(profit?.label ?? "利润", profit?.value ?? "—", profit?.delta),
            evidence(margin?.label ?? "利润率", margin?.value ?? "—", margin?.delta),
            evidence(cost?.label ?? "成本", cost?.value ?? "—", cost?.delta),
          ],
          ideas: [
            "优先排查高流量但利润薄的商品，避免规模继续放大损耗。",
            "把退款和折扣一起纳入单品利润判断，不只看售出收入。",
            "继续找利润被吞掉最明显的商品对象，优先处理头部损耗样本。",
          ],
          todos: [
            reportTodo(
              "unit-profit-report",
              "进入利润页排查吞利润对象",
              "先看利润页，确认今天最需要先处理的是哪类商品或订单。",
              "看利润页",
              "/app/today/profit?focus=profit",
            ),
            reportTodo(
              "unit-profit-margin",
              "复核利润率变化",
              "进入利润率视角确认利润变薄是价格、折扣还是退款导致。",
              "看利润率",
              "/app/today/profit?focus=margin",
            ),
            assistantTodo("产品分析", "单品利润分析", "把单品利润问题拆成 3 条可执行 todo", [
              profit?.label ? `${profit.label}: ${profit.value} ${profit.delta}` : null,
              margin?.label ? `${margin.label}: ${margin.value} ${margin.delta}` : null,
            ]),
          ],
        }),
        buildCard({
          key: "inventory-turnover",
          title: "库存周转分析",
          question: "库存周转会不会拖慢经营动作，或者让产品判断失真？",
          conclusion: "库存周转需要和可售天数、断货风险、慢销 SKU 一起判断，所以这里直接进入库存健康更合适。",
          metricLabel: "库存周转",
          metricValue: "待补库存口径",
          evidence: [
            evidence("当前状态", "库存口径待接入"),
            evidence(profit?.label ?? "利润", profit?.value ?? "—", profit?.delta),
          ],
          ideas: [
            "优先确认断货和慢销 SKU 是否正在拖累经营判断。",
            "把库存健康和利润对象一起看，避免把库存问题误判成产品问题。",
            "后续补齐库存周转统一口径，再把这张卡变成强指标卡。",
          ],
          todos: [
            healthMonitorTodo(
              "inventory-health",
              "进入库存健康页",
              "先确认断货、慢销和库存积压集中在哪些商品对象上。",
              "看库存健康",
              "inventory-health",
            ),
            taskCenterTodo(
              "inventory-task-center",
              "查看库存风险任务",
              "去任务中心只看库存风险相关的经营任务，方便直接开始处理。",
              "看库存任务",
              ["inventory_risk"],
            ),
            assistantTodo("产品分析", "库存周转分析", "输出库存周转待补口径前的排查 todo", [
              "库存周转统一口径待接入",
              profit?.label ? `${profit.label}: ${profit.value} ${profit.delta}` : null,
            ]),
          ],
        }),
      ],
    },
    {
      key: "ads",
      title: "广告分析",
      subtitle: "广告分析按渠道拆开看，不把所有投放平台揉成一个总 ROI。",
      summary: "广告分析应该先回答渠道差异：不同渠道的收入、贡献利润和 ROI 是否支撑继续投放，而不是只看一个总回报数。",
      principles: [
        "高花费平台不一定是高质量平台，必须看广告后利润和 ROI。",
        "同一个渠道的回报变弱，可能是流量质量、创意、承接页或售后损耗共同导致。",
        "适合继续加码的渠道，要继续下钻到具体平台表现与 campaign 结构。",
      ],
      cards: [
        buildCard({
          key: "channel-roi",
          title: "渠道 ROI 分析",
          question: "当前广告预算应该继续给哪些渠道，哪些渠道需要先止损？",
          conclusion:
            efficiencyShift?.summary ?? "广告分析按渠道拆开看，不同渠道分别给出自己的经营判断，再继续下钻到广告详情。",
          metricLabel: shortTermRoi?.label ?? "短期 ROI",
          metricValue: shortTermRoi?.value ?? "—",
          evidence: [
            evidence(shortTermRoi?.label ?? "短期 ROI", shortTermRoi?.value ?? "—"),
            evidence(cost?.label ?? "成本", cost?.value ?? "—", cost?.delta),
            evidence(revenue?.label ?? "收入", revenue?.value ?? "—", revenue?.delta),
          ],
          ideas: [
            "先看各渠道 ROI，再决定是继续加码还是限制投入。",
            "渠道判断不能只看收入，还要看利润和承接质量。",
            "当总 ROI 变弱时，优先拆到平台和 campaign，不继续停留在总览层。",
          ],
          todos: [
            reportTodo(
              "ads-roi-report",
              "进入 ROI 渠道页",
              "先看哪些渠道还能继续投，哪些渠道已经进入低效投入。",
              "看 ROI 渠道页",
              "/app/today/roi?focus=channels",
            ),
            adsInsightsTodo(
              "ads-insights",
              "进入广告表现页",
              "继续下钻到广告表现页，定位具体平台或 campaign。",
              "看广告表现",
              "all",
            ),
            assistantTodo("广告分析", "渠道 ROI 分析", "把渠道判断拆成 today 可执行投放 todo", [
              shortTermRoi?.label ? `${shortTermRoi.label}: ${shortTermRoi.value}` : null,
              cost?.label ? `${cost.label}: ${cost.value} ${cost.delta}` : null,
            ]),
          ],
        }),
      ],
    },
    {
      key: "orders",
      title: "订单分析",
      subtitle: "订单分析关注的是规模、客单和订单质量，不把订单增长直接当成经营改善。",
      summary: "订单分析先确认订单规模是不是健康，再继续看客单结构和成交后风险。",
      principles: [
        "订单数上升，不代表利润质量一定上升。",
        "客单价需要和商品组合、折扣订单、高客单样本一起看。",
        "订单分析和售后分析要连着看，避免把退款或履约问题留到最后才发现。",
      ],
      cards: [
        buildCard({
          key: "order-scale",
          title: "订单规模分析",
          question: "今天的订单增长是不是健康的规模增长？",
          conclusion: orders?.summary ?? "先区分规模增长是否健康，再继续下钻订单对象。",
          metricLabel: orders?.label ?? "订单数",
          metricValue: orders?.value ?? "—",
          evidence: [
            evidence(orders?.label ?? "订单数", orders?.value ?? "—", orders?.delta),
            evidence(revenue?.label ?? "收入", revenue?.value ?? "—", revenue?.delta),
            evidence(profit?.label ?? "利润", profit?.value ?? "—", profit?.delta),
          ],
          ideas: [
            "对比订单、收入和利润，不把纯规模放量误判成经营改善。",
            "先找订单增长快但利润没同步增长的对象。",
            "继续下钻订单页确认到底是哪类订单在拉动今天的结果。",
          ],
          todos: [
            reportTodo(
              "orders-report",
              "进入订单页",
              "先确认订单规模增长来自哪些对象和结构。",
              "看订单页",
              "/app/today/revenue?focus=orders",
            ),
            assistantTodo("订单分析", "订单规模分析", "把订单规模问题拆成可执行 todo", [
              orders?.label ? `${orders.label}: ${orders.value} ${orders.delta}` : null,
              profit?.label ? `${profit.label}: ${profit.value} ${profit.delta}` : null,
            ]),
          ],
        }),
        buildCard({
          key: "aov-quality",
          title: "客单结构分析",
          question: "高客单是不是来自健康结构，而不是异常样本或强促销？",
          conclusion: aov?.summary ?? "先确认高客单是不是可复制的健康样本。",
          metricLabel: aov?.label ?? "客单价",
          metricValue: aov?.value ?? "—",
          evidence: [
            evidence(aov?.label ?? "客单价", aov?.value ?? "—", aov?.delta),
            evidence(revenue?.label ?? "收入", revenue?.value ?? "—", revenue?.delta),
            evidence(orders?.label ?? "订单数", orders?.value ?? "—", orders?.delta),
          ],
          ideas: [
            "拆出高客单订单样本，确认是不是少数异常订单拉高均值。",
            "联动折扣和商品组合判断客单结构质量。",
            "高客单如果不可复制，就不要把它当成稳定增长信号。",
          ],
          todos: [
            reportTodo(
              "aov-report",
              "进入客单价页",
              "继续看客单价结构，确认高客单来源是否健康。",
              "看客单价页",
              "/app/today/revenue?focus=aov",
            ),
            assistantTodo("订单分析", "客单结构分析", "生成客单结构排查 todo", [
              aov?.label ? `${aov.label}: ${aov.value} ${aov.delta}` : null,
              orders?.label ? `${orders.label}: ${orders.value} ${orders.delta}` : null,
            ]),
          ],
        }),
      ],
    },
    {
      key: "after_sales",
      title: "售后分析",
      subtitle: "售后分析关注退单、退款和履约效率，强调的是成交后质量而不是单纯订单结果。",
      summary: "售后分析不是单独看退款率，而是一起判断退款、履约效率和售后响应会不会继续吞掉已经成交的利润。",
      principles: [
        "退款率上升通常不是单一原因，要继续拆商品、物流和售后响应三类根因。",
        "履约效率变慢时，售后压力和退款损耗会一起抬升。",
        "适合继续下钻到退款健康、履约健康和具体异常订单对象。",
      ],
      cards: [
        buildCard({
          key: "refund-risk",
          title: "退单 / 退款分析",
          question: "成交之后，哪些退款或退单问题正在继续侵蚀利润？",
          conclusion:
            profitErosion?.summary ?? "退款问题优先级更高，它会直接吞掉已经成交的利润。",
          metricLabel: profitErosion?.label ?? "退款损耗",
          metricValue: profitErosion?.value ?? "—",
          evidence: [
            evidence(profitErosion?.label ?? "退款损耗", profitErosion?.value ?? "—"),
            evidence(profit?.label ?? "利润", profit?.value ?? "—", profit?.delta),
            evidence(orders?.label ?? "订单数", orders?.value ?? "—", orders?.delta),
          ],
          ideas: [
            "先分清问题发生在商品、物流还是售后处理链路。",
            "退款问题要和利润一起看，确认今天最该先止血的对象。",
            "如果退款集中在少数对象上，就直接进入对象排查，而不是停留在总览。",
          ],
          todos: [
            reportTodo(
              "after-sales-profit",
              "进入利润页看损耗",
              "联动利润页确认退款和损耗正在吞掉哪些利润样本。",
              "看利润损耗",
              "/app/today/profit?focus=profit",
            ),
            healthMonitorTodo(
              "after-sales-refund-health",
              "进入退款健康页",
              "继续看退款健康明细，确认异常集中在哪些对象上。",
              "看退款健康",
              "refund-health",
            ),
            taskCenterTodo(
              "after-sales-task-center",
              "查看退款和售后任务",
              "去任务中心只看退款异常和售后超时相关任务。",
              "看售后任务",
              ["refund_spike", "after_sales_timeout"],
            ),
            assistantTodo("售后分析", "退单 / 退款分析", "把退款损耗问题拆成可执行 todo", [
              profitErosion?.label ? `${profitErosion.label}: ${profitErosion.value}` : null,
              profit?.label ? `${profit.label}: ${profit.value} ${profit.delta}` : null,
            ]),
          ],
        }),
        buildCard({
          key: "fulfillment-efficiency",
          title: "履约效率分析",
          question: "履约效率会不会继续把今天的订单成果变成后续售后问题？",
          conclusion: "履约效率影响的不只是发货速度，它会继续传导到退款、体验和后续复购。",
          metricLabel: "履约效率",
          metricValue: "履约 / 发货",
          evidence: [
            evidence("关注对象", "履约速度 / 延迟发货"),
            evidence(orders?.label ?? "订单数", orders?.value ?? "—", orders?.delta),
          ],
          ideas: [
            "订单放量后先看履约是否同步跟上，避免后续集中爆售后。",
            "履约问题优先去健康页看异常对象，不只停留在结论层。",
            "如果履约异常集中在少数国家或商品，要把处理优先级前置。",
          ],
          todos: [
            healthMonitorTodo(
              "fulfillment-health",
              "进入履约健康页",
              "继续查看履约异常对象和延迟风险。",
              "看履约健康",
              "fulfillment-health",
            ),
            taskCenterTodo(
              "fulfillment-task-center",
              "查看履约任务",
              "去任务中心只看履约超时相关任务，便于直接跟进。",
              "看履约任务",
              ["fulfillment_overdue", "logistics_stale"],
            ),
          ],
        }),
      ],
    },
    {
      key: "customer_value",
      title: "客户生命价值分析",
      subtitle: "客户生命价值分析关注的是客户质量划分、segment 结构和长期价值，而不是只看一个平均数。",
      summary: "客户生命价值页先回答两件事：客户质量怎么分层，哪些 segment 值得继续经营，哪些 segment 已经在流失。",
      principles: [
        "客户质量不能只看成交金额，还要结合复购、退款风险和价值分数。",
        "segment 的目标不是分类本身，而是帮助后续做投放、CRM 和权益策略。",
        "高价值客户占比和复购率，是判断长期经营质量是否稳定的关键。",
      ],
      cards: [
        buildCard({
          key: "quality-segmentation",
          title: "客户质量划分",
          question: "现在的经营结果里，有多少来自真正的高质量客户？",
          conclusion: "客户质量不能只看成交金额，还要结合复购、退款风险和价值分数一起判断。",
          metricLabel: "动态 LTV",
          metricValue: lifetimeRoi?.value ?? "待补",
          evidence: [
            evidence(lifetimeRoi?.label ?? "长期 ROI", lifetimeRoi?.value ?? "待补"),
            evidence(revenue?.label ?? "收入", revenue?.value ?? "—", revenue?.delta),
            evidence(profit?.label ?? "利润", profit?.value ?? "—", profit?.delta),
          ],
          ideas: [
            "先把客户质量分层，别把所有成交客户当成同一类样本。",
            "高价值客户占比和复购率应该成为长期经营判断的一层固定证据。",
            "后续需要让投放、CRM 和权益策略都能读到同一套 segment。",
          ],
          todos: [
            reportTodo(
              "customer-value-roi",
              "进入 ROI 价值层",
              "先从价值层看动态 LTV 和高价值客户结构。",
              "看 ROI 价值层",
              "/app/today/roi",
            ),
            assistantTodo("客户生命价值分析", "客户质量划分", "输出客户质量划分的 todo", [
              lifetimeRoi?.label ? `${lifetimeRoi.label}: ${lifetimeRoi.value}` : null,
              profit?.label ? `${profit.label}: ${profit.value} ${profit.delta}` : null,
            ]),
          ],
        }),
        buildCard({
          key: "segment-structure",
          title: "客户 Segment 划分",
          question: "应该怎么把客户分成可经营的 segment，而不是只看总客户池？",
          conclusion: "segment 的重点是把新客、活跃、VIP、风险客户拆开管理，不同 segment 应该承接不同策略。",
          metricLabel: "客户 Segment",
          metricValue: "新客 / 活跃 / VIP / 风险",
          evidence: [
            evidence("当前目标", "建立统一 segment 结构"),
            evidence(lifetimeRoi?.label ?? "长期 ROI", lifetimeRoi?.value ?? "待补"),
          ],
          ideas: [
            "先把 segment 定成统一规则，后续页面和任务才能共用。",
            "不同 segment 应承接不同经营动作，不只停留在分析结论。",
            "把高价值、风险、流失倾向客户明确拆开，后续 todo 才能执行。",
          ],
          todos: [
            reportTodo(
              "customer-value-roi-segment",
              "进入 ROI 价值层继续看 segment",
              "继续查看价值层里的客户结构和长期质量。",
              "看 ROI 价值层",
              "/app/today/roi",
            ),
            assistantTodo("客户生命价值分析", "客户 Segment 划分", "生成客户 segment 经营 todo", [
              lifetimeRoi?.label ? `${lifetimeRoi.label}: ${lifetimeRoi.value}` : null,
            ]),
          ],
        }),
      ],
    },
  ];
}

export function buildTodayAnalysisOverviewCards(pages: TodayAnalysisPageReport[]): TodayAnalysisOverviewCard[] {
  return pages.map((page) => {
    const leadCard = page.cards[0];
    return {
      key: page.key,
      title: page.title,
      question: leadCard.question,
      conclusion: leadCard.conclusion,
      metricLabel: leadCard.metricLabel,
      metricValue: leadCard.metricValue,
      todoCount: page.cards.reduce((sum, card) => sum + card.todos.length, 0),
      href: analysisPageHref(page.key),
    };
  });
}

function buildCard(card: TodayAnalysisCard): TodayAnalysisCard {
  return {
    ...card,
    evidence: card.evidence.filter((item) => item.value.trim().length > 0).slice(0, 3),
    ideas: card.ideas.slice(0, 3),
    todos: card.todos.slice(0, 3),
  };
}

function evidence(label: string, value: string, change?: string) {
  return { label, value, change };
}

function findMetric(cards: TodayMetricCard[], key: TodayMetricCard["key"]) {
  return cards.find((card) => card.key === key) ?? null;
}

function findReason(cards: TodayReasonCard[], key: string) {
  return cards.find((card) => card.key === key) ?? null;
}

function findRoi(cards: TodayRoiSummaryCard[], key: TodayRoiSummaryCard["key"]) {
  return cards.find((card) => card.key === key) ?? null;
}

function reportTodo(
  key: string,
  title: string,
  detail: string,
  actionLabel: string,
  path: string,
) {
  return {
    key,
    title,
    detail,
    actionLabel,
    actionType: "open_report" as const,
    payload: { path },
  };
}

function healthMonitorTodo(
  key: string,
  title: string,
  detail: string,
  actionLabel: string,
  monitor: string,
) {
  return {
    key,
    title,
    detail,
    actionLabel,
    actionType: "open_health_monitor" as const,
    payload: { view: "detail" as const, monitor },
  };
}

function adsInsightsTodo(
  key: string,
  title: string,
  detail: string,
  actionLabel: string,
  platform: "all" | "meta" | "google" | "tiktok",
) {
  return {
    key,
    title,
    detail,
    actionLabel,
    actionType: "open_ads_insights" as const,
    payload: { platform },
  };
}

function taskCenterTodo(
  key: string,
  title: string,
  detail: string,
  actionLabel: string,
  operationSourceFilter: string[],
) {
  return {
    key,
    title,
    detail,
    actionLabel,
    actionType: "open_task_center" as const,
    payload: {
      view: "current" as const,
      typeFilter: "operation_task" as const,
      operationSourceFilter,
    },
  };
}

function assistantTodo(pageTitle: string, cardTitle: string, title: string, evidenceLines: Array<string | null>) {
  const card: TodayAnalysisCard = {
    key: `${pageTitle}-${cardTitle}`,
    title: cardTitle,
    question: `${cardTitle} 当前最值得先处理的经营问题是什么？`,
    conclusion: "请基于当前分析卡继续拆解成轻量、可执行的 today todo。",
    metricLabel: "分析卡",
    metricValue: pageTitle,
    evidence: evidenceLines.filter(Boolean).map((line, index) => ({
      label: `证据 ${index + 1}`,
      value: line as string,
    })),
    ideas: ["把分析结论继续拆成今天就能执行的动作。"],
    todos: [],
  };
  const prompt = buildTodayAnalysisTodoRefinePrompt(pageTitle, card);

  return {
    key: `${cardTitle}-assistant`,
    title,
    detail: "把当前卡片交给 AI 进一步细化成可执行的 today todo。",
    actionLabel: "让 AI 细化 todo",
    actionType: "open_assistant" as const,
    payload: {
      prompt: prompt.chatPrompt,
      managedAiContext: buildManagedAiLaunchContextFromSpec(prompt.spec),
    },
  };
}

function analysisPageHref(key: TodayAnalysisPageReport["key"]) {
  switch (key) {
    case "product":
      return "/app/today/product";
    case "ads":
      return "/app/today/ads";
    case "orders":
      return "/app/today/order-analysis";
    case "after_sales":
      return "/app/today/after-sales";
    case "customer_value":
      return "/app/today/customer-value";
  }
}
