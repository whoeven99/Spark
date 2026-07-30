# Spark 每日经营诊断与待办工作流设计

## 1. 文档目标

本文档用于将“每日诊断报告 + 每日待办任务 + 风险环境监控 + AI 任务生成”统一收敛为一套可落地的产品设计与数据设计文档，并作为 `daily-operations` 的主文档。

本文档重点回答 7 个问题：

- 页面应该如何组织 `今日洞察 / 所有洞察` 的工作模式
- 页面应该如何按 `紧急 / 重要` 四象限组织任务优先级
- 每一个业务点如何抽象为一个 `1 / 2 / 3` 的标准工作流
- 每一个诊断点如何定义输入数据、计算口径、推理逻辑和输出任务
- 除了结果型指标外，电商经营还应监控哪些环境型风险与失败率
- AI 应该基于什么上下文生成猜测、解释和候选任务
- 第一阶段应优先实现哪些数据、规则与风险域，避免功能过早发散

本文档适用于：

- 每日经营诊断页
- 每日待办任务页
- 自动巡检任务
- 异常告警与增长机会发现
- 风险环境监控与失败率解释
- AI 洞察与任务建议生成
- 任务执行上下文设计

本文档不负责：

- 视觉样式
- 页面组件细节
- 后端表结构的最终实现代码

相关文档：

- [PROJECT_CONTEXT.md](file:///Users/cedric/Documents/GitHub/Spark/docs/PROJECT_CONTEXT.md)
- [INTERACTION_DESIGN.md](file:///Users/cedric/Documents/GitHub/Spark/docs/INTERACTION_DESIGN.md)
- [DESIGN.md](file:///Users/cedric/Documents/GitHub/Spark/docs/DESIGN.md)
- [ROADMAP.md](file:///Users/cedric/Documents/GitHub/Spark/docs/ROADMAP.md)

## 2. 产品定位

建议将这块能力正式定义为：

`每日经营诊断、风险环境与待办`

其核心闭环不是“展示一份报告”，而是：

`数据采集 -> 指标计算 -> 风险环境评估 -> 异常诊断 -> AI 猜测与任务生成 -> 执行跟踪 -> 次日复盘`

因此页面不应只展示 KPI，而应同时承载：

- 经营状态判断
- 风险环境预警
- 今日必须处理的任务
- 本周应推进的重要事项
- 低优先级探索项
- 可交给 AI 执行的任务上下文

## 3. 四象限框架

### 3.1 四象限定义

| 象限 | 定义 | 产品目标 | 默认动作 |
|------|------|----------|----------|
| 紧急重要 | 今天不处理会直接影响 GMV、客户体验、履约、退款或成本 | 立即止损 | 生成 `P0/P1` 任务 |
| 紧急不重要 | 有时效性，但更偏执行杂务或流程动作 | 批处理提效 | 生成例行任务 |
| 不紧急重要 | 不做不会今天出事故，但会影响中长期增长 | 固定推进 | 进入本周计划 |
| 不紧急不重要 | 短期无明确收益，且无法形成动作闭环 | 降低噪音 | 默认折叠或进入探索池 |

### 3.2 象限判定规则

每个候选任务都计算两个分值：

- `urgency_score`：紧急度，范围 `1-5`
- `importance_score`：重要度，范围 `1-5`

推荐映射规则：

```text
if urgency_score >= 4 and importance_score >= 4:
  quadrant = "紧急重要"
elif urgency_score >= 4 and importance_score < 4:
  quadrant = "紧急不重要"
elif urgency_score < 4 and importance_score >= 4:
  quadrant = "不紧急重要"
else:
  quadrant = "不紧急不重要"
```

推荐评分口径：

`urgency_score` 参考以下信号：

- 是否有明确时限
- 是否会在 24 小时内造成损失
- 是否处于持续恶化中
- 是否已影响订单履约或广告花费
- 是否存在用户投诉、退款、差评升级风险

`importance_score` 参考以下信号：

- 是否影响 GMV
- 是否影响利润或广告 ROI
- 是否影响客户体验
- 是否影响品牌口碑与复购
- 是否影响中长期增长能力

## 4. 页面信息架构

页面应升级为双模式工作台：

1. `今日洞察`
2. `所有洞察`

### 4.1 今日洞察

今日洞察建议按以下顺序展示：

1. `经营摘要`
2. `关键风险环境`
3. `AI 数据洞察`
4. `待办事项`

首页原则不是“把所有解释都铺开”，而是：

- 首页做 `索引与优先级判断`
- 详情页做 `证据、对象与动作展开`
- 首页少描述、多状态、多数量、多入口
- 详情页少摘要、多对象列表、多异常证据、多关联任务

#### 4.1.1 经营摘要

首页只保留一个统一的 `经营摘要` 模块，不再同时出现“每日经营待办总览”“快照信息块”“上次快照对比块”等重复摘要层。

经营摘要建议聚合以下内容：

- 近 7 天销售额
- 增长率或异常方向
- 风险环境数量
- 洞察数量
- 进行中任务数量
- 快照日期与生成时间
- 对比上次快照的简短结论

经营摘要不负责完整解释，只负责回答：

- 今天整体经营是否异常
- 今天需要优先进入哪一类详情页
- 今天是否有明显恶化或改善

#### 4.1.2 关键风险环境

关键风险环境首页建议改为 `风险列表`，而不是一组解释型卡片。

每一行建议只保留：

- 当前状态：`健康 / 关注 / 风险`
- 1 个核心失败率或异常率
- 1 个受影响对象数
- 1 句简短结果判断
- `查看详情`

例如：

- `库存管理 | 风险 | 低库存 SKU 12 个 | 预计影响未来 7 天销售 | 查看详情`
- `物流履约 | 关注 | 超时发货 8 单 | 2 个承运商异常 | 查看详情`
- `售后退款 | 风险 | 退款率 6.8% | 异常订单 14 笔 | 查看详情`

首页不展开大量解释文案，详细的原因、证据和异常对象都放到详情页。

#### 4.1.3 AI 数据洞察

AI 洞察区首页建议改为 `洞察列表`，不再展示大段 evidence 与 reasoning。

每条洞察首页只展示：

- 可验证的猜测
- 置信度
- 关联指标
- 关联任务数
- `查看详情`

例如：

- `退款上升主要集中在 3 个 SKU | 高置信 | 退款率 | 关联任务 2`
- `转化下滑可能与支付异常有关 | 中置信 | 转化率 / 支付失败率 | 关联任务 1`

首页优先展示“结论级信息”，完整证据链、推理链与关联对象放到详情页或 risk detail 的指定锚点中查看。

#### 4.1.4 待办事项

待办事项首页建议改为 `任务列表`，不再默认展示重卡片和大量说明文字。

建议 tab：

- 全部
- 重要紧急
- 重要不紧急
- 进行中
- 已完成

排序规则：

1. `in_progress`
2. `open`
3. `done`
4. `ignored / auto_closed`

同状态下再按时间排序。

每条任务首页只展示：

- 任务标题
- 当前状态
- 目标指标
- 预估收益
- 优先级或截止窗口
- `交给 AI`
- `查看详情`

首页不需要展开完整的触发原因、推理链、建议动作和 ROI 说明，这些内容应进入任务详情页查看。

### 4.2 所有洞察

所有洞察以列表形式呈现完整任务池，支持筛选器：

- 状态
- 象限
- 优先级
- 风险环境
- 影响指标
- 预估效果

所有洞察页仍以列表为主，但也应遵循“列表负责索引，详情负责展开”的原则，不在列表页承载过多解释性内容。

### 4.3 四象限在页面中的角色

四象限仍然是任务优先级的基础模型，但默认不再作为页面主视图，而是：

- 用于任务排序与分桶
- 用于筛选器与统计概览
- 用于解释为什么某项任务需要今天处理

### 4.4 首页与详情页分工

后续改版建议统一采用：

- `首页 list-first`
- `详情页 object-first`

两者的职责拆分如下：

#### 首页负责

- 告诉用户今天哪里有问题
- 告诉用户哪些事情值得马上点进去
- 用状态、数量、核心指标组织优先级
- 控制信息密度，减少解释性段落

#### 详情页负责

- 展开异常对象列表
- 展开证据与推理
- 展开指标变化和时间分布
- 展开关联任务与建议动作
- 提供继续交给 AI 的上下文

#### 首页不应该承载

- 大段 evidence / reasoning
- 完整对象清单
- 多层解释性文案
- 大量历史对比细节

#### 详情页必须承载

- `对象列表`
- `异常证据`
- `关联任务`
- `建议动作`
- `进一步分析入口`

### 4.5 风险环境详情页

每个风险环境详情页建议统一结构：

1. `顶部摘要`
2. `异常对象列表`
3. `指标变化`
4. `原因判断`
5. `建议动作`
6. `关联任务`

重点不是继续堆抽象指标，而是从“率”进入“对象”。

例如退款详情页至少应能看到：

- 异常退款订单列表
- 退款金额
- 退款原因聚类
- 涉及商品
- 是否与物流、质量、描述不符有关

例如物流详情页至少应能看到：

- 超时未发货订单
- 轨迹停滞订单
- 承运商聚类
- 区域分布
- 是否正在推高售后与退款

例如库存详情页至少应能看到：

- 风险 SKU 列表
- 可售天数
- 预计销售损失
- 在途库存与补货建议

### 4.6 洞察详情页

洞察详情页可以先不独立做成很多页面，第一阶段建议复用 risk detail，通过：

- `detail=risk`
- `tab=insights`
- `insight=<insightKey>`

来定位到某条洞察。

每条洞察详情至少应展开：

- 洞察摘要
- 关键证据
- 推理链
- 影响指标
- 关联风险环境
- 关联任务
- 交给 AI 分析

### 4.7 任务详情页

任务详情页建议统一承载：

- 任务目标
- 来源问题
- 影响指标
- 预估收益
- ROI 影响
- 建议动作步骤
- 相关对象列表
- 执行记录
- AI 上下文入口

首页任务列表只做任务索引，任务详情页才负责完整说明。

### 4.8 第一阶段优先详情页

为了避免范围过大，建议第一阶段优先补齐以下详情页对象视图：

1. `退款详情`
2. `物流详情`
3. `库存详情`
4. `任务详情`

原因：

- 这三类问题最容易直接落到订单或 SKU 对象
- 也最能体现“首页看索引，详情看对象”的改版价值
- 能为 AI 提供最具体的上下文

### 4.9 详情页字段设计

本节定义第一阶段详情页建议采用的字段结构。目标不是约束最终数据库表结构，而是统一前后端在详情页层的 `view model`。

统一原则：

- 字段按 `summary / metrics / objects / reasoning / tasks / actions` 六层组织
- 列表字段优先返回可直接渲染的展示值，减少前端二次拼装
- 对象列表必须支持分页、筛选和排序
- AI 上下文必须来自详情页 view model，而不是来自散乱字段拼接

#### 4.9.1 通用详情页结构

```ts
type DetailPageBase<TObject, TMetric, TTaskRef> = {
  key: string;
  title: string;
  status: "healthy" | "watch" | "risk";
  source: "real" | "estimated" | "pending";
  snapshotDate: string;
  generatedAt: string;
  summary: {
    primaryValue: string;
    secondaryValue?: string;
    affectedCount?: number;
    summaryText: string;
  };
  metrics: TMetric[];
  objects: TObject[];
  reasoning: {
    evidence: string[];
    reasoning: string[];
    confidence?: "high" | "medium" | "low";
  };
  relatedTasks: TTaskRef[];
  actions: Array<{
    key: string;
    label: string;
    type: "detail" | "task" | "ai" | "external";
  }>;
};
```

说明：

- `summary` 用于详情页顶部摘要
- `metrics` 用于趋势、口径和对比
- `objects` 用于异常对象列表
- `reasoning` 用于规则解释和 AI 猜测
- `relatedTasks` 用于承接现有任务系统
- `actions` 用于跳转、批量处理和交给 AI

#### 4.9.2 退款详情页字段

退款详情页建议视图模型：

```ts
type RefundDetailMetric = {
  key: string;
  label: string;
  current: number | string | null;
  previous?: number | string | null;
  delta?: number | null;
  unit?: "%" | "count" | "currency";
};

type RefundIssueOrder = {
  orderId: string;
  orderName: string;
  createdAt: string;
  customerName?: string | null;
  productTitles: string[];
  skuIds: string[];
  refundAmount: number;
  refundReasonLabel?: string | null;
  refundStatus: string;
  fulfillmentStatus?: string | null;
  logisticsStatus?: string | null;
  riskTags: string[];
};

type RefundDetailView = DetailPageBase<
  RefundIssueOrder,
  RefundDetailMetric,
  TaskReference
> & {
  clusters: Array<{
    key: string;
    label: string;
    orderCount: number;
    refundAmount: number;
  }>;
  relatedProducts: Array<{
    productId: string;
    title: string;
    refundOrderCount: number;
    refundAmount: number;
  }>;
};
```

退款详情页至少需要支持以下筛选：

- 退款原因
- 商品 / SKU
- 时间范围
- 退款状态
- 是否伴随物流异常

退款详情页首页对象区建议默认展示：

- 退款金额最高的订单
- 最近 24 小时新增退款订单
- 重复出现的高风险 SKU

#### 4.9.3 物流详情页字段

物流详情页建议视图模型：

```ts
type LogisticsDetailMetric = {
  key: string;
  label: string;
  current: number | string | null;
  previous?: number | string | null;
  delta?: number | null;
  unit?: "%" | "count" | "hours";
};

type LogisticsIssueOrder = {
  orderId: string;
  orderName: string;
  fulfillmentCreatedAt?: string | null;
  trackingNumber?: string | null;
  carrierName?: string | null;
  destinationRegion?: string | null;
  issueType: "overdue_fulfillment" | "tracking_stale" | "delivery_failed" | "returned";
  issueAgeHours?: number | null;
  logisticsStatus?: string | null;
  refundLinked?: boolean;
  riskTags: string[];
};

type LogisticsDetailView = DetailPageBase<
  LogisticsIssueOrder,
  LogisticsDetailMetric,
  TaskReference
> & {
  carrierBreakdown: Array<{
    carrierName: string;
    issueOrderCount: number;
    staleRate?: number | null;
    deliveryFailRate?: number | null;
  }>;
  regionBreakdown: Array<{
    region: string;
    issueOrderCount: number;
  }>;
};
```

物流详情页至少需要支持以下筛选：

- 问题类型
- 承运商
- 区域
- 是否已退款
- 异常时长

物流详情页对象区建议默认展示：

- 超时最久的订单
- 最近新出现的轨迹停滞订单
- 同一承运商集中异常的订单组

#### 4.9.4 库存详情页字段

库存详情页建议视图模型：

```ts
type InventoryDetailMetric = {
  key: string;
  label: string;
  current: number | string | null;
  previous?: number | string | null;
  delta?: number | null;
  unit?: "days" | "count" | "currency";
};

type InventoryRiskSku = {
  skuId: string;
  productId?: string | null;
  title: string;
  skuCode?: string | null;
  onHand: number;
  available: number;
  reserved?: number | null;
  inbound?: number | null;
  dailySalesVelocity?: number | null;
  sellableDays?: number | null;
  estimatedRevenueLoss?: number | null;
  riskTags: string[];
};

type InventoryDetailView = DetailPageBase<
  InventoryRiskSku,
  InventoryDetailMetric,
  TaskReference
> & {
  warehouseBreakdown?: Array<{
    warehouseName: string;
    riskSkuCount: number;
    lowStockCount: number;
  }>;
  replenishmentSuggestions: Array<{
    skuId: string;
    title: string;
    suggestedQuantity?: number | null;
    suggestedAction: "replenish" | "transfer" | "pause_ads" | "limit_sales";
  }>;
};
```

库存详情页至少需要支持以下筛选：

- 低库存 / 缺货 / 滞销
- 仓库
- 商品分类
- 可售天数范围
- 是否存在在途库存

库存详情页对象区建议默认展示：

- 可售天数最低的 SKU
- 预计损失最高的 SKU
- 有补货建议的 SKU

#### 4.9.5 任务详情页字段

任务详情页建议视图模型：

```ts
type TaskReferenceObject = {
  type: "order" | "sku" | "product" | "channel" | "customer_segment" | "carrier";
  id: string;
  label: string;
  meta?: string;
};

type TaskExecutionRecord = {
  at: string;
  actor: string;
  action: string;
  note?: string;
};

type TaskDetailView = {
  id: string;
  title: string;
  status: "open" | "in_progress" | "done" | "ignored" | "auto_closed";
  priority: "P0" | "P1" | "P2";
  quadrant: "q1" | "q2" | "q3" | "q4";
  sourceType: "rule" | "ai" | "hybrid";
  sourceKey: string;
  sourceTitle: string;
  objective: string;
  impactMetrics: string[];
  estimatedLiftPercent?: number | null;
  roiImpactSummary?: string | null;
  whyNow?: string | null;
  triggerReason: string;
  suggestedActions: string[];
  ownerRole?: string | null;
  dueWindow?: "today" | "48h" | "this_week" | "backlog" | null;
  relatedObjects: TaskReferenceObject[];
  evidence: string[];
  reasoning: string[];
  executionRecords: TaskExecutionRecord[];
  aiContextPayload?: unknown;
};
```

任务详情页建议分成以下区块：

- `任务摘要`
- `来源问题`
- `影响指标与预估收益`
- `建议动作步骤`
- `关联对象`
- `执行记录`
- `交给 AI`

#### 4.9.6 TaskReference 统一结构

为了保证风险详情页和任务详情页之间可以稳定联动，建议统一任务引用结构：

```ts
type TaskReference = {
  id: string;
  title: string;
  status: "open" | "in_progress" | "done";
  priority: "P0" | "P1" | "P2";
  quadrant: "q1" | "q2" | "q3" | "q4";
  objective?: string | null;
};
```

#### 4.9.7 详情页对象列表通用字段

所有详情页的对象列表建议统一具备以下展示能力：

- 主键标识
- 展示名称
- 主异常标签
- 影响值
- 当前状态
- 最近更新时间
- 进入对象详情或后台链接的入口

这样可以减少前端在不同详情页重复发明表格结构。

#### 4.9.8 详情页与 AI 上下文映射

详情页 view model 应天然可序列化为 AI 上下文，建议统一映射为：

```ts
type DetailAiContext = {
  detailKey: string;
  summary: string;
  metrics: Array<{ key: string; value: string | number | null }>;
  topObjects: Array<{ id: string; label: string; issue: string }>;
  evidence: string[];
  reasoning: string[];
  relatedTasks: Array<{ id: string; title: string; status: string }>;
};
```

这样从退款详情、物流详情、库存详情进入 AI 时，可以直接把：

- 顶部摘要
- 核心指标
- Top N 异常对象
- 证据与推理
- 关联任务

统一传给 AI，而不需要每个详情页单独重新组织 prompt。

### 4.10 详情页交互设计

详情页交互不应再做成“另一份长报告页”，而应做成：

- `summary-first`
- `tab-driven`
- `object-centric`
- `action-oriented`

换句话说，详情页要优先帮助用户：

1. 快速看懂问题
2. 快速定位对象
3. 快速转成动作

#### 4.10.1 进入方式

详情页建议支持以下进入方式：

- 从首页风险列表进入
- 从首页洞察列表进入
- 从首页任务列表进入
- 从任务详情反向进入来源问题详情
- 从 AI 结果或工作台消息进入对应详情

推荐 URL 结构：

```text
/app/daily-operations?detail=refund
/app/daily-operations?detail=logistics
/app/daily-operations?detail=inventory
/app/daily-operations?detail=task&id=<taskId>
```

如果需要深链接定位，建议继续附加：

```text
&tab=objects
&insight=<insightKey>
&object=<objectId>
&task=<taskId>
```

这样可以支持：

- 首页点某一行后直接进入对应 tab
- 从任务详情反向高亮来源问题
- 从洞察跳转后直接定位对应对象或洞察块

#### 4.10.2 顶部摘要区

每个详情页顶部建议使用紧凑摘要区，固定展示：

- 标题
- 当前状态
- 核心指标
- 受影响对象数
- 快照日期 / 生成时间
- 主动作按钮

主动作按钮建议最多 2 个：

- `生成任务` 或 `查看已有任务`
- `交给 AI`

摘要区目标是让用户在 3 秒内知道：

- 现在看的是什么问题
- 严重程度如何
- 影响范围多大
- 下一步能做什么

#### 4.10.3 页内导航

详情页内部建议采用轻量 tabs，而不是默认铺满整个长页面。

推荐统一 tab 结构：

- `对象`
- `指标`
- `原因`
- `任务`

不同详情页可按业务稍作变化：

- 退款详情：`异常订单 / 指标变化 / 原因分析 / 关联任务`
- 物流详情：`异常订单 / 承运商与区域 / 原因分析 / 关联任务`
- 库存详情：`风险 SKU / 库存指标 / 补货建议 / 关联任务`
- 任务详情：`任务摘要 / 关联对象 / 执行记录 / AI 上下文`

交互原则：

- 默认落在 `对象` tab
- 点击 tab 不重置已选择的对象和筛选器
- URL 应同步当前 tab，便于刷新和分享

#### 4.10.4 对象列表区

对象列表区是详情页的主区域，而不是附属区域。

对象列表建议支持：

- 搜索
- 筛选
- 排序
- 行点击展开
- 批量选择
- 批量动作

推荐使用 `master-detail` 模式：

- 主区展示对象列表
- 点击对象后，在下方或侧边展示对象详情

不建议第一阶段为每一条对象都跳出独立页面。

对象列表默认排序原则：

- 风险程度高优先
- 影响值大优先
- 最近新增优先

对象列表默认筛选状态应保留在 URL 或页面状态中，避免用户返回后重新筛选。

#### 4.10.5 原因与证据区

证据与推理区建议采用折叠式或分组式结构，不做成长篇文案。

推荐拆成两段：

- `看到什么`
- `为什么这样判断`

其中：

- `看到什么` 只放事实
- `为什么这样判断` 放规则推理与 AI 猜测

建议字段映射如下：

- `看到什么` -> metrics + clusters + top objects
- `为什么这样判断` -> evidence + reasoning + confidence

第一阶段建议支持：

- 展开更多证据
- 展开更多推理
- 一键复制给 AI

#### 4.10.6 关联任务与动作区

详情页必须直接承接动作，而不是停留在分析结果上。

动作区建议支持：

- `创建任务`
- `查看已有任务`
- `交给 AI`
- `标记已处理` 或 `加入待办`

如果已经有关联任务，建议优先显示：

- 进行中的任务
- 高优先级任务
- 最近更新任务

每条关联任务至少展示：

- 标题
- 状态
- 优先级
- 最近更新时间
- 进入任务详情入口

#### 4.10.7 交给 AI 的交互

详情页比首页更适合作为 `交给 AI` 的触发点，因为上下文更完整。

点击 `交给 AI` 后建议执行：

1. 读取当前详情页 `DetailAiContext`
2. 附带当前筛选器状态
3. 取 Top N 对象
4. 附加 evidence / reasoning / relatedTasks
5. 打开新对话并预填草稿，不自动发送

默认预填内容建议包含：

- 当前详情页摘要
- 核心指标
- 已选对象或 Top N 对象
- 证据与推理摘要
- 已有任务摘要
- 用户当前筛选条件

这样 AI 能直接回答：

- 如何判断根因
- 如何拆任务
- 如何排序处理
- 是否需要批量动作

#### 4.10.8 返回与联动

详情页与首页应保持双向联动。

建议支持：

- 从首页进入详情页时保留来源上下文
- 从详情页返回首页时保留滚动位置
- 从详情页进入任务详情后，可再回到原详情页位置
- 从任务详情反向回到来源问题详情

建议保留的状态包括：

- 当前 detail
- 当前 tab
- 当前筛选器
- 当前高亮对象
- 当前高亮洞察 / 任务

#### 4.10.9 第一阶段交互范围

为了控制复杂度，第一阶段详情页交互建议只做：

- 顶部摘要区
- 页内 tabs
- 对象列表
- 基础筛选 / 排序
- 证据与推理展开
- 关联任务区
- `交给 AI`

第二阶段再补：

- 批量选择
- 批量动作
- 侧边详情面板
- URL 深链接高亮
- 更复杂的复合筛选器

### 4.11 任务卡信息要求

每个任务卡建议至少包含：

- 任务标题
- 任务来源
- 所属象限
- 触发原因
- 关联对象
- 建议动作
- 推荐处理人
- 截止时间
- 状态
- 影响指标
- 预估改善幅度
- ROI 影响说明

## 5. 标准工作流模板

所有业务点统一抽象为 3 步工作流：

### 5.1 通用三步法

1. `发现`
   从订单、库存、流量、广告、竞品等数据中识别异常或机会。
2. `判断`
   使用指标、阈值、趋势对比和归因规则，判断问题级别、象限和推荐动作。
3. `执行与复盘`
   生成任务，进入处理流程，并在固定窗口内评估处理效果。

### 5.2 通用输出结构

每个工作流都应产出统一对象：

```ts
type WorkflowOutput = {
  workflowKey: string;
  workflowName: string;
  triggerType: "risk" | "routine" | "opportunity" | "analysis";
  quadrant: "紧急重要" | "紧急不重要" | "不紧急重要" | "不紧急不重要";
  diagnosis: {
    title: string;
    status: "健康" | "关注" | "风险";
    evidence: string[];
    reasoning: string[];
    formulas: string[];
  };
  task: {
    title: string;
    priority: "P0" | "P1" | "P2";
    ownerRole: string;
    suggestedActions: string[];
    dueWindow: "today" | "48h" | "this_week" | "backlog";
  };
};
```

## 6. 四象限工作流清单

## 6.1 Q1 紧急重要

### 工作流 1：待发货与超时履约处理

适用象限：`紧急重要`

1. `发现`
   系统识别待发货订单、超时未发货订单、接近 SLA 边界订单。
2. `判断`
   按订单年龄、是否高客单、是否已投诉、是否为加急订单确定优先级。
3. `执行与复盘`
   生成履约处理任务，处理后观察发货率、投诉率和退款率是否回落。

### 工作流 2：物流轨迹异常处理

适用象限：`紧急重要`

1. `发现`
   系统扫描已发货订单的轨迹，识别停滞、退回、投递失败、超时未签收。
2. `判断`
   根据异常时长、订单金额、用户地区、历史异常率判断风险等级。
3. `执行与复盘`
   生成物流跟进任务，处理后观察妥投率、售后咨询量和退款率变化。

### 工作流 3：退款与差评止损

适用象限：`紧急重要`

1. `发现`
   系统识别退款率异常上升、单 SKU 退款集中、差评集中爆发。
2. `判断`
   判断问题更像商品质量、描述不符、物流时效还是售后响应问题。
3. `执行与复盘`
   生成退款复核、商品修正、客服回复和质检排查任务。

### 工作流 4：高动销 SKU 库存止损

适用象限：`紧急重要`

1. `发现`
   系统识别高销量 SKU 低库存、缺货、可售天数不足。
2. `判断`
   结合销量速度、在途库存、仓间库存，判断是否会影响未来 7 天销售。
3. `执行与复盘`
   生成补货、调拨、暂停投放或替代 SKU 推广任务。

### 工作流 5：流量/转化异常止损

适用象限：`紧急重要`

1. `发现`
   系统识别 GMV、会话数、转化率、支付率的突然下降。
2. `判断`
   先判断是流量问题还是站内转化问题，再判断是渠道、商品还是支付链路问题。
3. `执行与复盘`
   生成广告排查、页面排查、商品页优化或支付链路排查任务。

### 工作流 6：广告异常烧钱止损

适用象限：`紧急重要`

1. `发现`
   系统识别高花费低产出、ROI 连续下滑、预算消耗异常快的广告计划。
2. `判断`
   判断问题来自素材疲劳、受众偏移、落地页问题还是归因延迟。
3. `执行与复盘`
   生成暂停、降预算、换素材、换落地页等动作任务。

## 6.2 Q2 紧急不重要

### 工作流 7：常规发货与物流跟进

适用象限：`紧急不重要`

1. `发现`
   系统聚合普通待发货订单、普通在途订单、已签收订单。
2. `判断`
   按时效和批量规则组织为可处理列表。
3. `执行与复盘`
   支持批量发货、批量确认、批量归档。

### 工作流 8：商品上架与信息维护

适用象限：`紧急不重要`

1. `发现`
   系统识别待上架商品、待补素材商品、待更新价格商品。
2. `判断`
   判断哪些是机械性执行任务，哪些需升级为增长或风险任务。
3. `执行与复盘`
   进入批量上架、素材替换、价格更新流程。

### 工作流 9：社媒与评价日常运营

适用象限：`紧急不重要`

1. `发现`
   系统识别待发布内容、待回复评论、待回复私信、待处理评价。
2. `判断`
   区分普通互动和高风险舆情。
3. `执行与复盘`
   普通项进入例行清单，高风险项升级到 `紧急重要`。

## 6.3 Q3 不紧急重要

### 工作流 10：选品与同款找货

适用象限：`不紧急重要`

1. `发现`
   系统基于热销、竞品、趋势榜单发现候选品。
2. `判断`
   判断是否与当前店铺品类、价格带、毛利空间匹配。
3. `执行与复盘`
   进入供应链搜索、成本核算、候选池管理。

### 工作流 11：新品挖掘

适用象限：`不紧急重要`

1. `发现`
   聚合 TikTok、SellerCenter、竞品、新品趋势数据。
2. `判断`
   判断趋势持续性、竞争强度、落地可行性。
3. `执行与复盘`
   进入新品候选评审和上新计划。

### 工作流 12：渠道经营复盘

适用象限：`不紧急重要`

1. `发现`
   周期性拉取广告、自然流量、社媒和合作渠道数据。
2. `判断`
   判断不同渠道在获客、转化、支付和复购上的贡献与浪费。
3. `执行与复盘`
   输出预算调整、素材策略调整和投放结构优化任务。

### 工作流 13：SEO 与自然流量优化

适用象限：`不紧急重要`

1. `发现`
   拉取 Search Console、Semrush 和站内页面数据。
2. `判断`
   判断哪些关键词、落地页、技术问题最影响自然流量增长。
3. `执行与复盘`
   进入关键词优化、页面优化、技术 SEO 修复清单。

### 工作流 14：竞品监控与策略分析

适用象限：`不紧急重要`

1. `发现`
   拉取 Similarweb、竞品站点页面、素材和商品变化。
2. `判断`
   判断竞品最近在哪些渠道、商品、促销上发力。
3. `执行与复盘`
   形成竞品策略摘要，并转化为选品、定价、素材任务。

## 6.4 Q4 不紧急不重要

### 工作流 15：探索池

适用象限：`不紧急不重要`

1. `发现`
   聚合暂时无法闭环的外部数据和零散线索。
2. `判断`
   判断是否具有明确动作价值和收益路径。
3. `执行与复盘`
   不进入主任务流，默认沉淀到探索池，待后续升级。

## 7. 诊断点定义与计算公式

本节定义每日经营诊断中建议优先落地的核心诊断点。

每个诊断点都包含：

- 数据来源
- 核心指标
- 计算公式
- 数据层推理逻辑
- 任务映射

## 7.1 销售趋势诊断

### 数据来源

- Shopify Orders
- Line Items
- 订单时间窗口

### 核心指标

- `sales_amount_7d`
- `sales_amount_prev_7d`
- `order_count_7d`
- `aov_7d`

### 计算公式

```text
sales_amount_7d = sum(current_period.orders.total_paid_amount)

sales_amount_prev_7d = sum(previous_period.orders.total_paid_amount)

sales_growth_rate =
  if sales_amount_prev_7d > 0
  then (sales_amount_7d - sales_amount_prev_7d) / sales_amount_prev_7d * 100
  else 0

aov_7d =
  if order_count_7d > 0
  then sales_amount_7d / order_count_7d
  else 0
```

### 数据推理逻辑

```text
如果 sales_growth_rate < -5%
  且 order_count_7d 下滑幅度 > aov_7d 下滑幅度
则判断销售下滑主要由订单量减少驱动

如果 sales_growth_rate < -5%
  且 aov_7d 下滑明显
则判断销售下滑主要由客单价下降驱动

如果 sales_growth_rate >= 5%
则判断销售趋势健康
```

### 任务映射

- 流量排查任务
- 商品页优化任务
- 价格策略调整任务

## 7.2 流量波动诊断

### 数据来源

- Shopify Web Pixels
- 广告平台点击/会话数据
- 外部分析平台会话数据

### 核心指标

- `sessions_1d`
- `sessions_prev_1d`
- `channel_sessions`
- `channel_share`

### 计算公式

```text
traffic_change_rate =
  if sessions_prev_1d > 0
  then (sessions_1d - sessions_prev_1d) / sessions_prev_1d * 100
  else 0

channel_share(channel) =
  channel_sessions(channel) / total_sessions
```

### 数据推理逻辑

```text
如果 total_sessions 明显下降
  且某单一渠道的 channel_share 同时下降
则优先归因为该渠道流量异常

如果 total_sessions 基本稳定
  但销售和转化同步下降
则问题更可能发生在站内转化环节
```

### 任务映射

- 渠道波动排查任务
- 广告预算调整任务
- SEO 排查任务

## 7.3 转化率诊断

### 数据来源

- Shopify Orders
- Abandoned Checkouts
- Web Pixels 会话与结账事件

### 核心指标

- `conversion_rate`
- `add_to_cart_rate`
- `checkout_rate`
- `payment_rate`

### 计算公式

```text
conversion_rate =
  if sessions > 0
  then orders / sessions * 100
  else 0

checkout_conversion_rate =
  if checkouts_started > 0
  then paid_orders / checkouts_started * 100
  else 0

payment_rate =
  if payment_attempts > 0
  then successful_payments / payment_attempts * 100
  else 0
```

在仅有基础数据时，可先使用兼容口径：

```text
proxy_conversion_rate =
  if orders + abandoned_checkouts > 0
  then orders / (orders + abandoned_checkouts) * 100
  else 0
```

### 数据推理逻辑

```text
如果 sessions 正常但 conversion_rate 下滑
则优先判断为站内转化问题

如果 checkout_rate 正常但 payment_rate 下滑
则优先判断为支付环节问题

如果 add_to_cart_rate 下滑
则优先判断为商品页、价格、运费或信任问题
```

### 任务映射

- 商品页优化任务
- 支付链路排查任务
- 运费策略调整任务

## 7.4 履约健康诊断

### 数据来源

- Shopify Orders
- Fulfillments
- 订单创建时间与发货时间

### 核心指标

- `pending_orders`
- `overdue_orders`
- `fulfillment_rate`
- `average_fulfillment_hours`

### 计算公式

```text
fulfillment_rate =
  if non_cancelled_orders > 0
  then fulfilled_orders / non_cancelled_orders * 100
  else 0

average_fulfillment_hours =
  avg(hours_between(order_created_at, first_shipped_at))

overdue_orders =
  count(orders where now - created_at > sla_hours and not fulfilled)
```

### 数据推理逻辑

```text
如果 overdue_orders > 0
则至少触发 "关注"

如果 overdue_orders 占比持续升高
  或 average_fulfillment_hours 明显变差
则升级为 "风险"

如果履约恶化与退款率同时上升
则优先归因为履约体验问题
```

### 任务映射

- 待发货处理任务
- 超时履约处理任务
- 仓库流程排查任务

## 7.5 物流轨迹异常诊断

### 数据来源

- Fulfillments
- 承运商轨迹事件

### 核心指标

- `stale_tracking_orders`
- `delivery_failure_orders`
- `delivered_rate`

### 计算公式

```text
stale_tracking_orders =
  count(orders where shipment_status = "in_transit"
    and days_since_last_tracking_event > carrier_stale_days)

delivery_failure_orders =
  count(orders where shipment_status in ["failure", "returned"])

delivered_rate =
  if shipped_orders > 0
  then delivered_orders / shipped_orders * 100
  else 0
```

### 数据推理逻辑

```text
如果 stale_tracking_orders 增长
则判断承运商时效或轨迹同步存在风险

如果 delivery_failure_orders 增长
则判断客户体验风险显著上升

如果物流异常与退款/差评同步增长
则将物流问题视为一类根因
```

### 任务映射

- 物流异常跟进任务
- 承运商问题复盘任务

## 7.6 退款与售后诊断

### 数据来源

- Refunds
- Refund Line Items
- 订单金额
- 评价/客服系统数据

### 核心指标

- `refund_rate`
- `refund_amount`
- `refund_rate_delta`
- `top_refund_skus`

### 计算公式

```text
refund_rate =
  if order_count > 0
  then refunded_order_count / order_count * 100
  else 0

refund_amount_rate =
  if sales_amount > 0
  then refund_amount / sales_amount * 100
  else 0

refund_rate_delta = refund_rate_current_period - refund_rate_previous_period

top_refund_sku_amount(sku) =
  sum(refund_line_items where sku = current_sku)
```

### 数据推理逻辑

```text
如果 refund_rate > 5%
  且 refund_rate_delta > 0
则退款风险上升

如果退款集中在少数 SKU
则优先判断为商品问题而非全局运营问题

如果退款与履约时效变差同步出现
则优先归因为物流或履约问题
```

### 任务映射

- 退款原因复盘任务
- 商品信息修正任务
- 售后沟通任务
- 质检排查任务

## 7.7 差评与口碑诊断

### 数据来源

- 商品评价
- 售后工单
- 退款原因

### 核心指标

- `negative_review_rate`
- `negative_review_count`
- `complaint_count`

### 计算公式

```text
negative_review_rate =
  if total_reviews > 0
  then negative_reviews / total_reviews * 100
  else 0

complaint_rate =
  if total_orders > 0
  then complaints / total_orders * 100
  else 0
```

### 数据推理逻辑

```text
如果差评集中出现在同一 SKU
则优先归因为商品或描述问题

如果差评集中在物流、客服、发货慢
则优先归因为履约或服务问题
```

### 任务映射

- 差评回复任务
- 商品修正任务
- 客服质量排查任务

## 7.8 库存健康诊断

### 数据来源

- Inventory Levels
- Order Line Items
- SKU 销量

### 核心指标

- `low_stock_rate`
- `out_of_stock_rate`
- `sellable_days`
- `estimated_lost_revenue`

### 计算公式

```text
low_stock_rate =
  if total_skus > 0
  then low_stock_skus / total_skus * 100
  else 0

out_of_stock_rate =
  if total_skus > 0
  then out_of_stock_skus / total_skus * 100
  else 0

daily_sales_velocity(sku) =
  sku_sales_quantity_30d / 30

sellable_days(sku) =
  if daily_sales_velocity(sku) > 0
  then available_inventory(sku) / daily_sales_velocity(sku)
  else INF

estimated_lost_revenue(sku) =
  max(0, daily_sales_velocity(sku) * 7 - available_inventory(sku)) * unit_revenue(sku)
```

### 数据推理逻辑

```text
如果 sellable_days(sku) < 7
则视为高风险 SKU

如果某 SKU 缺货且销量速度高
则优先级高于普通低库存 SKU

如果 estimated_lost_revenue 较高
则应进入 "紧急重要"
```

### 任务映射

- 补货任务
- 调拨任务
- 广告暂停或限量销售任务

## 7.9 商品运营诊断

### 数据来源

- Products
- Variants
- 素材更新时间
- 价格变动记录

### 核心指标

- `content_staleness_days`
- `price_change_frequency`
- `product_conversion_rate`

### 计算公式

```text
content_staleness_days =
  days_between(now, last_content_updated_at)

price_change_frequency =
  price_change_count_30d / 30

product_conversion_rate(product) =
  if product_sessions > 0
  then product_orders / product_sessions * 100
  else 0
```

### 数据推理逻辑

```text
如果商品流量高但 product_conversion_rate 低
则优先判断为商品页问题

如果商品长期未更新素材
  且点击率或转化率下滑
则建议更新素材和文案
```

### 任务映射

- 素材更新任务
- 标题描述优化任务
- 价格调整任务

## 7.10 广告 ROI 诊断

### 数据来源

- Meta / Google / TikTok 广告数据
- 订单归因数据

### 核心指标

- `ad_spend`
- `attributed_revenue`
- `roi`
- `roas`
- `cpa`

### 计算公式

```text
roi =
  if ad_spend > 0
  then (attributed_revenue - ad_spend) / ad_spend * 100
  else 0

roas =
  if ad_spend > 0
  then attributed_revenue / ad_spend
  else 0

cpa =
  if attributed_orders > 0
  then ad_spend / attributed_orders
  else INF
```

### 数据推理逻辑

```text
如果 roas 连续下降
  且 ad_spend 持续上升
则视为烧钱风险

如果点击正常但站内转化低
则优先判断为落地页问题

如果 CTR 下降明显
则优先判断为素材疲劳问题
```

### 任务映射

- 广告调优任务
- 素材替换任务
- 落地页排查任务

## 7.11 自然流量与 SEO 诊断

### 数据来源

- Google Search Console
- Semrush
- 页面内容与元信息

### 核心指标

- `organic_clicks`
- `organic_impressions`
- `organic_ctr`
- `average_position`

### 计算公式

```text
organic_ctr =
  if organic_impressions > 0
  then organic_clicks / organic_impressions * 100
  else 0

position_change =
  current_average_position - previous_average_position
```

### 数据推理逻辑

```text
如果 impressions 正常但 organic_ctr 下降
则优先判断为标题和摘要吸引力不足

如果 average_position 变差
则优先判断为排名竞争恶化或页面质量下降
```

### 任务映射

- SEO 页面优化任务
- 关键词优化任务

## 7.12 选品与新品机会诊断

### 数据来源

- TikTok 创意趋势
- SellerCenter 榜单
- 竞品商品变化
- 1688 供应链数据

### 核心指标

- `trend_score`
- `supply_match_score`
- `margin_estimate`
- `competition_score`

### 计算公式

第一阶段可采用规则打分，而不是复杂模型：

```text
trend_score =
  normalized(platform_heat_growth)
  + normalized(content_volume_growth)
  + normalized(search_interest_growth)

supply_match_score =
  normalized(number_of_suppliers)
  + normalized(price_stability)
  + normalized(shipping_stability)

margin_estimate =
  estimated_selling_price - estimated_cost - estimated_shipping - estimated_ad_cost
```

### 数据推理逻辑

```text
如果 trend_score 高
  且 supply_match_score 高
  且 margin_estimate 为正
则进入新品候选池

如果 trend_score 高但竞争强度过大
则只进入观察池，不进入立即执行
```

### 任务映射

- 候选选品评审任务
- 供应链找货任务
- 新品上新准备任务

## 7.13 竞品监控诊断

### 数据来源

- Similarweb
- 竞品站点页面
- 竞品商品与价格数据

### 核心指标

- `competitor_traffic_change`
- `competitor_new_products`
- `competitor_price_change_rate`

### 计算公式

```text
competitor_traffic_change =
  if competitor_traffic_prev > 0
  then (competitor_traffic_current - competitor_traffic_prev) / competitor_traffic_prev * 100
  else 0

competitor_price_change_rate =
  changed_products / tracked_products * 100
```

### 数据推理逻辑

```text
如果竞品流量增长
  且新品数量同步增加
则判断竞品可能在通过新品拉动增长

如果竞品价格频繁下调
则判断其处于促销或清库存阶段
```

### 任务映射

- 竞品策略复盘任务
- 定价策略调整任务
- 同款找货任务

## 8. 统一 ROI 总账与场景口径

本系统必须先定义一个全局统一的“算账标准”，再允许不同业务场景在此基础上扩展各自的细分口径。

统一原则如下：

- 所有业务场景最终都要归一到 `ROI` 这个概念
- `ROI` 的本质不是“有收入”，而是“最终是否赚钱”
- 广告、SEO、选品、竞品等场景可以有各自中间指标，但最终都要映射到统一 ROI
- 竞品数据通常无法得到真实利润，因此竞品只能使用 `代理 ROI` 或 `相对效率分数`

### 8.1 统一总账口径

建议将系统中的总口径定义为：

`经营 ROI`

其含义是：

`在一个固定时间窗口内，某项经营动作或某个渠道带来的经营贡献利润，相对于该动作投入成本的回报率`

推荐总公式：

```text
Business ROI =
  (Contribution Profit - Investment Cost)
  / Investment Cost
```

其中：

```text
Contribution Profit =
  Attributed Revenue
  - COGS
  - Discount Cost
  - Shipping Subsidy
  - Payment Fees
  - Refund Loss
  - After-sales Cost
  - Channel Commission

Investment Cost =
  Ad Spend
  + Content Cost
  + SEO Cost
  + Tool Cost
  + Outsourcing Cost
  + Direct Human Operation Cost
```

为避免分母为 0，统一约束如下：

```text
if Investment Cost <= 0:
  Business ROI = null
```

说明：

- `Attributed Revenue` 指归因到该动作、该渠道或该场景的收入
- `Contribution Profit` 不是净利润，而是该场景可归属的经营贡献利润
- `Investment Cost` 只统计该场景直接相关的投入，不将所有固定成本强行摊入

### 8.2 统一展示口径

系统中所有经营分析最终必须同时输出三层结果：

1. `收入层`
   该场景带来了多少收入
2. `利润层`
   扣除必要成本后还剩多少经营贡献利润
3. `ROI 层`
   该场景是否赚钱，赚钱效率如何

推荐统一输出字段：

```ts
type RoiSummary = {
  attributedRevenue: number;
  contributionProfit: number;
  investmentCost: number;
  businessRoi: number | null;
  confidence: "high" | "medium" | "low";
  attributionWindow: string;
};
```

### 8.3 场景口径必须统一映射到 ROI

不同场景可以有自己的中间指标，但最终必须能映射到 `Business ROI`。

#### 广告场景

广告场景的中间指标包括：

- `impressions`
- `clicks`
- `ctr`
- `cpc`
- `cpm`
- `cvr`
- `roas`
- `cpa`

但最终统一映射：

```text
Ad Business ROI =
  (Attributed Revenue
   - COGS
   - Discount Cost
   - Shipping Subsidy
   - Payment Fees
   - Refund Loss
   - Ad Spend)
  / Ad Spend
```

说明：

- `ROAS` 只用于投放层诊断
- 真正用于“算赚钱”的主口径应是 `Ad Business ROI`

#### SEO 场景

SEO 场景的中间指标包括：

- `impressions`
- `clicks`
- `organic_ctr`
- `average_position`
- `keyword_coverage`

最终统一映射：

```text
SEO Business ROI =
  (SEO Attributed Revenue
   - COGS
   - Discount Cost
   - Shipping Subsidy
   - Payment Fees
   - Refund Loss
   - SEO Cost)
  / SEO Cost
```

其中 `SEO Cost` 推荐包含：

- SEO 人力成本
- 外包成本
- 内容制作成本
- 工具成本

说明：

- SEO 是滞后型渠道，建议默认使用 `30/60/90 天` 窗口，而不是日口径硬算
- SEO 日级看趋势，周级和月级看 ROI 更合理

#### 社媒内容场景

社媒运营的中间指标包括：

- `content_published`
- `engagement_rate`
- `clicks`
- `assisted_sessions`

最终统一映射：

```text
Social Business ROI =
  (Social Attributed Revenue
   - COGS
   - Discount Cost
   - Shipping Subsidy
   - Payment Fees
   - Refund Loss
   - Social Content Cost)
  / Social Content Cost
```

#### KOL / CPS / 联盟分销场景

最终统一映射：

```text
Affiliate Business ROI =
  (Attributed Revenue
   - COGS
   - Discount Cost
   - Shipping Subsidy
   - Payment Fees
   - Refund Loss
   - Commission Cost
   - Placement Cost)
  / (Commission Cost + Placement Cost)
```

#### 选品与新品场景

选品本身没有即时收入，因此其 ROI 应拆分为两个阶段：

第一阶段看 `机会 ROI`

```text
Opportunity Score =
  Trend Score
  + Supply Match Score
  + Margin Score
  - Competition Penalty
```

第二阶段在真正上新后回归统一 ROI：

```text
New Product ROI =
  (New Product Revenue
   - COGS
   - Shipping Subsidy
   - Payment Fees
   - Refund Loss
   - Launch Cost
   - Traffic Acquisition Cost)
  / (Launch Cost + Traffic Acquisition Cost)
```

说明：

- 新品挖掘前期可以不强行算真实 ROI
- 但一旦上新进入经营周期，就必须归一到 ROI

### 8.4 统一辅助指标体系

虽然所有场景最终都要归一到 ROI，但为了诊断原因，仍需保留辅助指标。

推荐保留三层指标：

#### 投入层

- `spend`
- `content_cost`
- `seo_cost`
- `commission_cost`

#### 产出层

- `revenue`
- `gross_profit`
- `net_contribution_profit`

#### 效率层

- `roas`
- `cpa`
- `cac`
- `mer`
- `business_roi`

### 8.5 客户资产价值与长期 ROI

电商经营不能只看一次交易是否赚钱，还必须把 `客户资产价值` 纳入统一 ROI 框架。

原因：

- 首单可能不赚钱，但客户后续复购会赚钱
- 不同渠道带来的客户质量不同
- 会员、订阅、老客复购会显著改变长期收益
- 退款、售后、折扣敏感客户会显著拉低长期利润

因此系统中的 ROI 必须同时支持：

- `短期 ROI`
- `长期 ROI`
- `客户价值驱动的 ROI`

#### 8.5.1 客户动态计价

建议将每个客户定义为一个动态变化的经营资产，而不是静态标签。

推荐字段：

```ts
type CustomerValueSnapshot = {
  customerId: string;
  segment: "new" | "active" | "vip" | "at_risk" | "churned";
  predictedLtv: number;
  realizedGrossProfit: number;
  predictedFutureProfit: number;
  expectedRefundLoss: number;
  expectedRetentionMonths: number;
  membershipValue: number;
  customerValueScore: number;
  updatedAt: string;
};
```

统一定义：

```text
Customer Economic Value =
  Realized Gross Profit
  + Predicted Future Profit
  + Membership Value
  - Expected Refund Loss
  - Expected Service Cost
```

说明：

- `Realized Gross Profit` 是已经发生的历史贡献利润
- `Predicted Future Profit` 是基于复购概率、未来订单利润、留存窗口估算的未来价值
- `Membership Value` 是会员费、会员带来的额外复购与权益溢价
- `Expected Refund Loss` 和 `Expected Service Cost` 用于扣减低质量客户的潜在损失

#### 8.5.2 客户动态 LTV

推荐将 `LTV` 定义为动态值，而不是一次性计算结果。

```text
Dynamic LTV =
  Historical Contribution Profit
  + Expected Future Contribution Profit
```

其中：

```text
Historical Contribution Profit =
  Historical Revenue
  - Historical COGS
  - Historical Discount Cost
  - Historical Shipping Subsidy
  - Historical Payment Fees
  - Historical Refund Loss
  - Historical Service Cost

Expected Future Contribution Profit =
  repeat_purchase_probability
  * expected_orders_next_window
  * expected_contribution_profit_per_order
```

如果先不用预测模型，第一阶段可使用规则近似：

```text
Expected Future Contribution Profit =
  historical_repeat_rate_segment
  * average_future_orders_segment
  * average_contribution_profit_per_order_segment
```

也可以加入时间衰减：

```text
Discounted Future Profit =
  sum(
    expected_profit_t / (1 + discount_rate)^t
  )
```

#### 8.5.3 客户分层对 ROI 的影响

同样的收入，不同客户质量，对长期 ROI 的意义完全不同。

因此建议至少区分：

- `新客 ROI`
- `老客 ROI`
- `会员 ROI`
- `高价值客户 ROI`
- `高退款风险客户 ROI`

推荐口径：

```text
New Customer ROI =
  (New Customer Economic Value - Acquisition Cost)
  / Acquisition Cost

Repeat Customer ROI =
  (Repeat Customer Contribution Profit - Retention Cost)
  / Retention Cost

Member ROI =
  (Member Economic Value - Membership Maintenance Cost)
  / Membership Maintenance Cost
```

其中：

- `Acquisition Cost` 主要来自广告、合作渠道、首单激励
- `Retention Cost` 主要来自 CRM、优惠券、私域、会员权益运营
- `Membership Maintenance Cost` 包括会员福利、积分、履约增量成本

#### 8.5.4 短期 ROI 与长期 ROI

系统必须明确区分两个时间维度：

##### 短期 ROI

用于回答：

- 今天这笔投放是否亏钱
- 这个项目本周是否止损
- 当前预算是否值得继续投

推荐定义：

```text
Short-term ROI =
  (Current Window Contribution Profit - Current Window Investment Cost)
  / Current Window Investment Cost
```

##### 长期 ROI

用于回答：

- 该渠道带来的客户是否值得长期投入
- 当前首单亏损是否能在复购中回本
- 会员体系是否带来长期正收益

推荐定义：

```text
Long-term ROI =
  (Customer Economic Value - Total Acquisition And Retention Cost)
  / Total Acquisition And Retention Cost
```

推荐业务解释：

```text
Short-term ROI > 0
  表示当前窗口内赚钱

Long-term ROI > 0
  表示即使考虑获取、留存、复购、会员和售后波动后，整体仍赚钱
```

#### 8.5.5 统一项目 ROI 口径升级

因此系统中每个项目最终不应只输出一个 `Business ROI`，而应至少输出：

```ts
type ProjectRoiSummary = {
  shortTermRoi: number | null;
  longTermRoi: number | null;
  customerValueAdjustedRoi: number | null;
  cac: number | null;
  dynamicLtv: number | null;
  ltvCacRatio: number | null;
  paybackDays: number | null;
};
```

核心解释：

- `shortTermRoi` 看当前窗口是否赚钱
- `longTermRoi` 看客户全生命周期是否赚钱
- `customerValueAdjustedRoi` 看考虑客户质量后的真实 ROI

推荐计算：

```text
Customer Value Adjusted ROI =
  (Current Contribution Profit
   + Expected Future Contribution Profit
   - Current And Future Cost)
  / Current And Future Cost
```

#### 8.5.6 会员与复购的特殊影响

会员和复购对 ROI 的影响必须单独看，因为它们会改变：

- 客户留存时间
- 未来订单频次
- 折扣使用率
- 退款率
- 售后成本

建议加入以下指标：

- `repeat_purchase_rate`
- `member_penetration_rate`
- `member_revenue_share`
- `member_profit_share`
- `retention_cost_per_customer`
- `membership_value_per_customer`

推荐公式：

```text
Repeat Purchase Rate =
  repeat_customers / total_customers

LTV/CAC =
  if cac > 0
  then dynamic_ltv / cac
  else null

Membership Value =
  membership_fee_profit
  + incremental_repeat_profit_from_members
  - membership_benefit_cost
```

#### 8.5.7 达标标准也必须分时间维度

只用短期 ROI 来评分会误伤高质量拉新项目。

因此建议统一采用双达标标准：

| 维度 | 目标解释 | 建议标准 |
|------|----------|----------|
| 短期 ROI | 当前窗口是否止损或赚钱 | `>= 0` 为基础达标 |
| 长期 ROI | 生命周期是否赚钱 | `>= 0.2` 为稳定达标 |
| LTV/CAC | 客户价值是否覆盖获客成本 | `>= 3` 为优秀，`>= 2` 为可接受 |
| Payback Days | 回本周期是否过长 | 越短越好，阈值按店铺现金流定义 |

说明：

- 短期 ROI 主要用于预算控制和止损
- 长期 ROI 主要用于判断是否值得持续投入
- `LTV/CAC` 是客户价值和获客成本的桥梁指标

#### 8.5.8 基础必备项也要补客户维度

在前面的基础必备项之外，凡是要评估长期 ROI 的项目，还必须补充：

- 客户 ID 归因能力
- 新客 / 老客识别能力
- 复购事件追踪能力
- 会员权益与成本追踪能力
- 客服、退款、折扣等客户质量损失追踪能力

推荐新增字段：

- `new_customer_rate`
- `repeat_customer_rate`
- `member_customer_rate`
- `customer_id_match_rate`
- `retention_observation_window`
- `ltv_model_version`

#### 8.5.9 围绕客户价值改造考核方式

围绕客户价值后，考核方式应统一升级：

- 从“渠道带来多少订单”改为“渠道带来多少有价值客户”
- 从“首单是否赚钱”改为“客户全周期是否赚钱”
- 从“只看收入增长”改为“收入增长是否伴随高质量复购增长”

示例：

##### 广告项目

从：

```text
ROAS 是否达标
```

升级为：

```text
短期 ROI 是否止损
+ 长期 ROI 是否为正
+ LTV/CAC 是否健康
```

##### SEO 项目

从：

```text
自然流量有没有涨
```

升级为：

```text
自然流量带来的客户是否更高价值
+ 这些客户是否更容易复购
+ SEO 长期 ROI 是否更优
```

##### 会员项目

从：

```text
会员人数有没有增加
```

升级为：

```text
会员带来的增量利润是否覆盖会员成本
+ 会员客户的 LTV 是否显著高于非会员
```

#### 8.5.10 Customer Value Score 评分体系

为了让用户能快速理解“这个渠道、这个项目带来的客户值不值钱”，建议为客户或客户群定义统一的 `Customer Value Score`，范围 `0-100`。

推荐结构：

```text
Customer Value Score =
  0.35 * ProfitQualityScore
  + 0.25 * RetentionScore
  + 0.15 * MembershipScore
  + 0.15 * RiskPenaltyAdjustedScore
  + 0.10 * DataConfidenceScore
```

推荐定义：

```text
ProfitQualityScore
  反映客户历史贡献利润与未来利润预期

RetentionScore
  反映客户复购概率、复购频率、预期留存时长

MembershipScore
  反映会员身份、会员利润贡献和会员活跃度

RiskPenaltyAdjustedScore
  反映退款风险、售后风险、价格敏感度对客户价值的扣减

DataConfidenceScore
  反映客户识别、订单追踪和归因可信度
```

##### ProfitQualityScore 建议

```text
ProfitQualityScore =
  normalized(realized_gross_profit + predicted_future_profit)
```

##### RetentionScore 建议

```text
RetentionScore =
  normalized(
    repeat_purchase_probability
    + expected_orders_next_window
    + expected_retention_months
  )
```

##### MembershipScore 建议

```text
if customer_is_member:
  MembershipScore =
    normalized(
      membership_profit_contribution
      + member_order_frequency
      + member_retention_bonus
    )
else:
  MembershipScore = base_non_member_score
```

##### RiskPenaltyAdjustedScore 建议

```text
RiskPenaltyAdjustedScore =
  100
  - normalized(expected_refund_loss
    + expected_service_cost
    + excessive_discount_dependency)
```

##### 评分等级建议

| 分数 | 客户价值等级 | 含义 |
|------|--------------|------|
| `85-100` | S | 高价值核心资产客户 |
| `70-84` | A | 高价值稳定客户 |
| `55-69` | B | 普通可经营客户 |
| `40-54` | C | 低价值或待观察客户 |
| `< 40` | D | 高风险或低质量客户 |

说明：

- `Customer Value Score` 不等于 `LTV`
- 它是把利润、留存、会员和风险统一映射成一个管理分数
- 该分数适合用于渠道比较、客户分层和运营优先级排序

#### 8.5.11 客户分层规则

建议先使用规则分层，而不是一开始就依赖复杂模型。

推荐基础分层：

| 分层 | 典型条件 | 经营目标 |
|------|----------|----------|
| `new` | 首购用户，观察窗口内仅 1 单 | 判断首购质量与复购潜力 |
| `active` | 最近活跃，存在复购或持续浏览/购买 | 提升复购频次和客单价 |
| `vip` | 高 LTV、高利润、高会员价值 | 重点维护与专属经营 |
| `at_risk` | 长时间未复购、价值下降或活跃衰减 | 做召回与流失预警 |
| `churned` | 超过流失阈值且无活跃行为 | 低成本召回或归档 |
| `refund_risk` | 退款率高、售后成本高 | 降低损失，谨慎激励 |
| `discount_sensitive` | 高依赖折扣才转化 | 优化价格体系和毛利策略 |

推荐规则示例：

```text
if order_count = 1 and days_since_first_order <= new_window:
  segment = "new"

if repeat_purchase_count >= 1 and days_since_last_order <= active_window:
  segment = "active"

if customer_value_score >= 85 and dynamic_ltv >= vip_ltv_threshold:
  segment = "vip"

if days_since_last_order > risk_window and customer_value_score is declining:
  segment = "at_risk"

if days_since_last_order > churn_window:
  segment = "churned"

if refund_rate_customer > refund_risk_threshold:
  segment = "refund_risk"
```

说明：

- 一个客户可以同时有“生命周期分层”和“风险标签”
- 例如：`active + refund_risk`
- 页面展示时建议区分 `主分层` 与 `标签`

#### 8.5.12 项目层的客户质量指标

为了把客户价值落实到项目评估，建议每个渠道、活动、项目至少输出以下客户质量指标：

- `new_customer_share`
- `high_value_customer_share`
- `vip_customer_share`
- `repeat_customer_share`
- `refund_risk_customer_share`
- `discount_sensitive_customer_share`
- `average_customer_value_score`
- `median_customer_value_score`

推荐公式：

```text
High Value Customer Share =
  customers_with_score_gte_70 / total_customers

VIP Customer Share =
  vip_customers / total_customers

Refund Risk Customer Share =
  refund_risk_customers / total_customers

Average Customer Value Score =
  sum(customer_value_score) / total_customers
```

这些指标的意义：

- 用于解释“同样的 ROI，客户质量为什么不一样”
- 用于解释“为什么某个渠道短期 ROI 一般，但长期值得投”
- 用于解释“为什么某个活动短期收入高，但客户质量差”

#### 8.5.13 页面卡片展示建议

围绕客户价值与 ROI，项目卡片建议统一展示 3 层内容：

##### 第一层：经营结果

- `短期 ROI`
- `长期 ROI`
- `Business ROI 等级`
- `ROI Score`

##### 第二层：客户价值

- `Dynamic LTV`
- `LTV/CAC`
- `Average Customer Value Score`
- `高价值客户占比`
- `高退款风险客户占比`

##### 第三层：解释与行动

- `为什么当前 ROI 达标 / 未达标`
- `为什么长期 ROI 高于 / 低于短期 ROI`
- `应该优化客户获取、留存、会员还是售后`

推荐项目卡字段：

```ts
type ProjectValueCard = {
  projectId: string;
  projectName: string;
  shortTermRoi: number | null;
  longTermRoi: number | null;
  businessRoiGrade: "S" | "A" | "B" | "C" | "D";
  roiScore: number | null;
  dynamicLtv: number | null;
  ltvCacRatio: number | null;
  averageCustomerValueScore: number | null;
  highValueCustomerShare: number | null;
  refundRiskCustomerShare: number | null;
  dataConfidence: "high" | "medium" | "low";
  diagnosisSummary: string[];
  actionSuggestions: string[];
};
```

#### 8.5.14 接口字段设计建议

后端接口层建议将 ROI 与客户价值拆成两个独立对象，避免页面和规则层混淆。

推荐结构：

```ts
type RoiMetrics = {
  businessRoi: number | null;
  shortTermRoi: number | null;
  longTermRoi: number | null;
  customerValueAdjustedRoi: number | null;
  roiGrade: "S" | "A" | "B" | "C" | "D" | null;
  roiScore: number | null;
  targetBusinessRoi: number | null;
  targetRoiScore: number | null;
  attributionWindow: string;
  confidence: "high" | "medium" | "low";
};

type CustomerValueMetrics = {
  dynamicLtv: number | null;
  cac: number | null;
  ltvCacRatio: number | null;
  paybackDays: number | null;
  averageCustomerValueScore: number | null;
  medianCustomerValueScore: number | null;
  highValueCustomerShare: number | null;
  vipCustomerShare: number | null;
  repeatCustomerShare: number | null;
  refundRiskCustomerShare: number | null;
  memberCustomerShare: number | null;
};
```

推荐项目接口：

```ts
type ProjectDiagnosisResponse = {
  projectKey: string;
  projectName: string;
  quadrant: string;
  roi: RoiMetrics;
  customerValue: CustomerValueMetrics;
  baseline: {
    shopBaselineRoi: number | null;
    industryBaselineRoi: number | null;
    shopBaselineCustomerValueScore: number | null;
  };
  diagnostics: Array<{
    key: string;
    status: "健康" | "关注" | "风险";
    title: string;
    evidence: string[];
    reasoning: string[];
  }>;
  suggestions: string[];
};
```

#### 8.5.15 第一阶段建议的最小实现

如果先不做复杂模型，建议第一阶段先实现以下最小版本：

- `Dynamic LTV` 使用规则近似
- `Customer Value Score` 使用规则打分
- `new / active / vip / at_risk / churned` 五类主分层
- `refund_risk / discount_sensitive` 两类风险标签
- 项目层先输出：
  - `shortTermRoi`
  - `longTermRoi`
  - `ltvCacRatio`
  - `averageCustomerValueScore`
  - `highValueCustomerShare`

这样就已经能支持：

- 渠道质量对比
- 活动质量对比
- 会员与非会员对比
- 新客与老客对比
- 短期赚钱与长期赚钱的区分

### 8.6 ROI 达标等级

为了帮助用户快速理解“这个项目到底达没达标”，系统不能只展示单个 ROI 数字，还应提供统一等级。

推荐将 `Business ROI` 分为 5 档：

| 等级 | Business ROI 区间 | 含义 | 建议动作 |
|------|-------------------|------|----------|
| S | `>= 0.5` | 强赚钱，经营效率优秀 | 扩大投入，复制打法 |
| A | `0.2 ~ 0.5` | 达标，具备稳定盈利能力 | 持续优化，稳步加码 |
| B | `0 ~ 0.2` | 勉强达标，微赚 | 优化成本与转化，不宜盲目放量 |
| C | `-0.2 ~ 0` | 未达标，轻度亏损 | 限制投入，优先定位原因 |
| D | `< -0.2` | 严重未达标，明显亏损 | 立即止损或重构方案 |

说明：

- `S/A/B/C/D` 是全局统一等级，不因业务场景改变含义
- 各业务场景可以设置不同的目标等级，但等级定义必须一致
- 第一阶段建议以 `A` 作为“稳定达标”，以 `B` 作为“观察达标”

### 8.7 ROI 综合评分

单看 `Business ROI` 还不够，因为一些项目虽然当前赚钱，但可能：

- 规模太小
- 波动太大
- 数据归因不完整
- 退款风险很高

因此建议为每个项目增加 `ROI Score`，范围 `0-100`，作为统一的经营效率评分。

推荐结构：

```text
ROI Score =
  0.5 * RoiLevelScore
  + 0.2 * TrendScore
  + 0.15 * StabilityScore
  + 0.15 * DataConfidenceScore
```

推荐子项定义：

```text
RoiLevelScore
  反映当前 Business ROI 的绝对盈利水平

TrendScore
  反映该项目 ROI、收入、利润是在改善还是恶化

StabilityScore
  反映该项目近 7/14/30 天波动是否过大

DataConfidenceScore
  反映该项目归因完整度、成本完整度和样本可靠性
```

#### RoiLevelScore 映射建议

```text
Business ROI >= 0.5      -> 100
0.2 <= Business ROI < 0.5 -> 85
0 <= Business ROI < 0.2   -> 70
-0.2 <= Business ROI < 0  -> 45
Business ROI < -0.2       -> 20
```

#### TrendScore 计算建议

```text
TrendScore =
  clamp(
    50
    + roi_change_rate_score
    + profit_change_rate_score,
    0,
    100
  )
```

可简化为规则分档：

```text
ROI 和利润连续改善 -> 80~100
基本稳定           -> 50~80
持续恶化           -> 0~50
```

#### StabilityScore 计算建议

可基于波动率：

```text
StabilityScore =
  100 - normalized(roi_volatility_30d)
```

或者先用规则近似：

```text
近 30 天 ROI 波动很小   -> 85~100
近 30 天 ROI 波动一般   -> 60~85
近 30 天 ROI 波动很大   -> 0~60
```

#### DataConfidenceScore 计算建议

```text
DataConfidenceScore =
  AttributionCompletenessScore * 0.4
  + CostCompletenessScore * 0.3
  + FreshnessScore * 0.2
  + SampleAdequacyScore * 0.1
```

#### 评分等级建议

| 分数 | 等级 | 含义 |
|------|------|------|
| `85-100` | 优秀 | 达标且可复制 |
| `70-84` | 良好 | 基本达标，仍有优化空间 |
| `55-69` | 观察 | 接近达标，需重点观察 |
| `40-54` | 风险 | 未达标，需尽快调整 |
| `< 40` | 危险 | 显著低于目标，应止损或重构 |

### 8.8 基础必备项

在任何项目进入 ROI 评分和等级判断前，都必须先通过一层“基础项校验”。

这层的作用是：

- 防止数据不完整时误判项目价值
- 防止样本太小时把偶然结果当成能力
- 防止不同项目统计口径不一致

推荐基础必备项如下：

#### 归因完整度

必须回答：

- 收入是否可归因
- 成本是否可归因
- 时间窗口是否明确

推荐字段：

- `attribution_window`
- `attributed_revenue_coverage`
- `attributed_cost_coverage`

最低要求：

```text
attributed_revenue_coverage >= 0.7
attributed_cost_coverage >= 0.8
```

未达要求时：

- 不给最终评级
- 只给“数据不足”或“低置信度”提示

#### 成本完整度

必须至少覆盖：

- 渠道直接投入
- 商品成本
- 折扣成本
- 运费补贴
- 支付手续费
- 退款损失

若缺失关键成本，则：

```text
business_roi_status = "incomplete"
```

#### 数据新鲜度

必须知道：

- 数据更新时间
- 订单和成本回流延迟
- 归因结果是否已稳定

推荐字段：

- `data_freshness_minutes`
- `cost_delay_hours`
- `attribution_locked`

#### 样本充足度

必须避免极小样本直接评分。

推荐最低要求：

```text
orders >= min_orders_threshold
or
sessions >= min_sessions_threshold
or
spend >= min_spend_threshold
```

例如：

- 广告计划：`spend >= 300` 或 `orders >= 10`
- SEO 页面：`clicks >= 100` 或 `sessions >= 300`
- 新品项目：`orders >= 20` 或 `revenue >= threshold`

#### 基准线与目标值

每个项目必须具备：

- `target_business_roi`
- `target_score`
- `industry_baseline` 或 `shop_baseline`

说明：

- 没有目标值就无法判断“是否达标”
- 没有基准线就无法知道问题是个体问题还是正常波动

### 8.9 围绕达标程度改造统计方式与考核方式

围绕 ROI 的总目标，现有每个项目的统计方式和考核方式都应做统一改造。

统一原则如下：

- 从“只看量”改为“量 + 利润 + ROI”
- 从“只看结果”改为“结果 + 达标程度 + 置信度”
- 从“单指标考核”改为“基础项 + ROI 等级 + 综合评分”

#### 广告项目

当前常见问题：

- 只看 `ROAS`
- 只看花费和收入
- 忽略退款、毛利和补贴成本

建议改造为：

- 基础项：归因完整度、成本完整度、数据延迟
- 核心结果：`Ad Business ROI`
- 达标等级：`S/A/B/C/D`
- 综合评分：`ROI Score`

广告项目的考核从：

```text
ROAS 是否够高
```

改为：

```text
是否赚钱
+ 赚钱是否稳定
+ 数据是否可信
```

#### SEO 项目

当前常见问题：

- 只看点击和排名
- 忽略内容成本和滞后收益

建议改造为：

- 基础项：归因窗口是否足够、内容成本是否入账
- 核心结果：`SEO Business ROI`
- 辅助结果：流量增长、关键词覆盖、自然转化
- 评分维度：长期趋势权重高于日级波动

SEO 项目的考核从：

```text
排名是否提升
```

改为：

```text
是否带来可持续且有利润的自然增长
```

#### 社媒与内容项目

当前常见问题：

- 只看互动率
- 只看曝光和点赞

建议改造为：

- 基础项：内容成本、导流归因覆盖
- 核心结果：`Social Business ROI`
- 辅助结果：点击、辅助转化、品牌搜索提升

内容项目的考核从：

```text
内容是否热闹
```

改为：

```text
内容是否推动有效经营结果
```

#### 新品与选品项目

当前常见问题：

- 只看趋势热度
- 只看有没有上新

建议改造为两段：

1. 立项阶段看 `Opportunity Score`
2. 上线后看 `New Product ROI`

考核从：

```text
有没有找到新品
```

改为：

```text
新品是否有机会赚钱，以及上线后是否真的赚钱
```

### 8.10 ROI 与赚钱的统一解释

系统中对 ROI 的解释必须统一。

推荐定义：

```text
Business ROI > 0
  表示该场景在当前归因窗口内为正向赚钱

Business ROI = 0
  表示该场景盈亏平衡

Business ROI < 0
  表示该场景在当前归因窗口内亏钱
```

建议进一步分层：

```text
Business ROI >= 0.3    -> 强赚钱
0 <= Business ROI < 0.3 -> 微赚 / 待优化
-0.2 <= Business ROI < 0 -> 轻度亏损
Business ROI < -0.2   -> 明显亏损
```

阈值可按行业和店铺阶段调整，但“正负判断”必须全局一致。

### 8.11 竞品对比不能伪造真实 ROI

竞品通常拿不到：

- 真实广告花费
- 真实毛利
- 真实退款损失
- 真实履约成本

因此不能直接声称“竞品 ROI 是多少”。

竞品更适合定义为：

`竞争效率代理 ROI`

推荐使用代理分数：

```text
Competitive Efficiency Score =
  Traffic Growth Score
  + Organic Visibility Score
  + Product Freshness Score
  + Creative Activity Score
  + Pricing Stability Score
```

或者输出相对判断：

- 竞品流量增长快于我方
- 竞品自然流量占比更高
- 竞品新品更新频率更高
- 竞品价格调整频率更高
- 竞品疑似正在加大某类目投放

因此竞品侧统一约束如下：

- 我方可输出 `真实 ROI`
- 竞品只输出 `代理效率` 或 `相对强弱`

### 8.12 诊断中如何使用 ROI

ROI 不应只作为最终展示数字，而应成为诊断决策核心。

推荐规则：

```text
如果 ROAS > 1 但 Business ROI < 0
则说明该场景“有收入但不赚钱”

如果流量增长但 Business ROI 下降
则说明增长质量恶化

如果 SEO 点击增长但 SEO Business ROI 仍为负
则说明内容成本或转化质量仍需优化

如果某渠道 Revenue 高但 CAC 和 Refund Loss 同时升高
则该渠道不能视为优质增长
```

### 8.13 实现优先级建议

为了尽快建立统一算账标准，推荐按以下顺序落地：

1. 先落地 `Business ROI` 总公式
2. 先打通广告场景的 `Ad Business ROI`
3. 再补 SEO 场景的 `SEO Business ROI`
4. 最后引入竞品的 `代理效率分数`

第一阶段必须确保：

- 所有广告诊断最终都能回到 `Business ROI`
- 所有 SEO 诊断最终都能回到 `Business ROI`
- 所有经营总览都能回答“这个渠道 / 这个动作是否赚钱”

### 8.14 规则配置表建议

为了保证这套体系后续可持续维护，文档中所有关键判断都应尽量抽象成“可配置规则”，而不是散落在页面逻辑里的硬编码。

建议至少配置以下 4 类规则表：

- `ROI 等级规则表`
- `客户分层规则表`
- `置信度规则表`
- `项目目标值规则表`

#### 8.14.1 ROI 等级规则表

推荐配置结构：

| rule_key | scene | metric | min_value | max_value | grade | meaning |
|----------|-------|--------|-----------|-----------|-------|---------|
| roi_grade_s | global | business_roi | 0.5 | null | S | 强赚钱 |
| roi_grade_a | global | business_roi | 0.2 | 0.5 | A | 达标 |
| roi_grade_b | global | business_roi | 0 | 0.2 | B | 微赚 |
| roi_grade_c | global | business_roi | -0.2 | 0 | C | 轻亏 |
| roi_grade_d | global | business_roi | null | -0.2 | D | 明显亏损 |

说明：

- `scene = global` 表示全局适用
- 某些场景可以追加更细分规则，但不能推翻全局等级定义
- 所有页面都应复用同一等级映射

#### 8.14.2 ROI Score 分项规则表

推荐结构：

| rule_key | component | weight | calc_type | note |
|----------|-----------|--------|-----------|------|
| roi_score_level | RoiLevelScore | 0.5 | mapped | 当前 ROI 绝对水平 |
| roi_score_trend | TrendScore | 0.2 | trend | 改善或恶化趋势 |
| roi_score_stability | StabilityScore | 0.15 | volatility | 波动稳定度 |
| roi_score_confidence | DataConfidenceScore | 0.15 | weighted | 数据可信度 |

建议保留以下约束：

- 权重和必须为 `1.0`
- 任何单项分数都必须可追溯到原始指标
- 权重调整需记录版本号和生效时间

#### 8.14.3 客户分层规则表

推荐结构：

| rule_key | segment | condition_type | threshold | action |
|----------|---------|----------------|-----------|--------|
| customer_new | new | order_count | `=1` | 首购观察 |
| customer_active | active | days_since_last_order | `<= active_window` | 日常经营 |
| customer_vip | vip | customer_value_score | `>= 85` | 重点维护 |
| customer_at_risk | at_risk | days_since_last_order | `> risk_window` | 召回预警 |
| customer_churned | churned | days_since_last_order | `> churn_window` | 低成本召回 |
| customer_refund_risk | refund_risk | refund_rate_customer | `> refund_risk_threshold` | 风险控制 |
| customer_discount_sensitive | discount_sensitive | discount_order_share | `> discount_sensitive_threshold` | 毛利优化 |

建议同时支持：

- `segment`：主分层，只允许一个
- `tags`：风险或行为标签，允许多个

#### 8.14.4 项目目标值规则表

每个项目都必须有目标值，否则无法做“达标 / 未达标”判断。

推荐结构：

| project_type | target_business_roi | target_long_term_roi | target_ltv_cac | target_customer_value_score |
|--------------|---------------------|----------------------|----------------|-----------------------------|
| ad_campaign | 0.2 | 0.3 | 2.5 | 65 |
| seo_project | 0.1 | 0.3 | 3.0 | 70 |
| social_content | 0 | 0.2 | 2.0 | 60 |
| affiliate | 0.15 | 0.25 | 2.5 | 65 |
| membership | 0.1 | 0.4 | null | 75 |
| new_product | 0 | 0.2 | 2.0 | 60 |

说明：

- 上表只是初始示意，不应视为最终业务阈值
- 真正上线前应按店铺阶段、类目、毛利结构再细分

### 8.15 置信度与数据成熟度规则

同一个 ROI 数字，如果数据成熟度不同，决策价值完全不同。

因此建议把 `confidence` 明确分为 3 档：

- `high`
- `medium`
- `low`

#### 8.15.1 置信度定义

| 等级 | 含义 | 可否用于强决策 |
|------|------|----------------|
| `high` | 归因、成本、样本都较完整 | 可以 |
| `medium` | 主要口径已可用，但仍有部分缺口 | 可用于观察和局部决策 |
| `low` | 数据不完整或样本不足 | 不能用于强结论 |

#### 8.15.2 置信度判定建议

推荐综合以下四个维度：

- `AttributionCompletenessScore`
- `CostCompletenessScore`
- `FreshnessScore`
- `SampleAdequacyScore`

推荐映射：

```text
if weighted_score >= 85:
  confidence = "high"
elif weighted_score >= 60:
  confidence = "medium"
else:
  confidence = "low"
```

#### 8.15.3 数据成熟度阶段

建议再增加一个更偏产品层的字段：

- `data_maturity`

推荐取值：

- `seed`
- `partial`
- `stable`
- `trusted`

定义如下：

| data_maturity | 含义 |
|---------------|------|
| `seed` | 刚开始接入，只能看趋势 |
| `partial` | 主要数据可用，但缺口仍多 |
| `stable` | 主要统计口径稳定可复用 |
| `trusted` | 可作为核心经营决策依据 |

说明：

- `confidence` 面向某次计算结果
- `data_maturity` 面向某条数据链路的长期成熟度

### 8.16 客户分层判定明细表

为了避免后续对“VIP”“高风险客户”等概念理解不一致，建议在文档中显式固定判定表。

#### 8.16.1 主分层判定表示例

| 主分层 | 最低条件 | 退出条件 | 主要经营动作 |
|--------|----------|----------|--------------|
| `new` | 首购且仍在新客窗口 | 超出新客窗口或产生复购 | 教育与二次转化 |
| `active` | 最近窗口内有购买或活跃行为 | 超出活跃窗口 | 提升复购和客单 |
| `vip` | 高价值分数 + 高 LTV | 价值显著下降 | 重点维护和专属权益 |
| `at_risk` | 活跃衰减或价值下滑 | 重新激活购买 | 召回 |
| `churned` | 超过流失窗口 | 重新激活购买 | 低成本召回或归档 |

#### 8.16.2 风险标签判定表示例

| 标签 | 判定信号 | 建议动作 |
|------|----------|----------|
| `refund_risk` | 客户退款率高于阈值 | 谨慎营销、降低损失 |
| `discount_sensitive` | 折扣单占比高 | 优化价格体系 |
| `service_heavy` | 售后工单/服务成本高 | 评估服务成本回收 |
| `high_value` | Customer Value Score 高于阈值 | 定向经营 |
| `member_candidate` | 高价值但未入会 | 推动会员转化 |

#### 8.16.3 建议窗口参数

初始建议：

| 参数 | 建议值 | 说明 |
|------|--------|------|
| `new_window` | 30 天 | 新客观察窗口 |
| `active_window` | 60 天 | 活跃客户窗口 |
| `risk_window` | 90 天 | 风险预警窗口 |
| `churn_window` | 180 天 | 流失判断窗口 |
| `vip_score_threshold` | 85 | 高价值客户阈值 |
| `high_value_threshold` | 70 | 高价值占比统计阈值 |

说明：

- 这些值建议写成配置，不应直接写死在页面
- 不同品类可按购买周期差异调整

### 8.17 统一术语规范

为了避免产品、运营、数据和工程对同一概念产生不同理解，建议在文档中固定以下术语。

#### 8.17.1 ROI 相关术语

| 术语 | 定义 |
|------|------|
| `Business ROI` | 当前场景在固定窗口内的经营回报率 |
| `Short-term ROI` | 当前窗口内的 ROI |
| `Long-term ROI` | 纳入客户生命周期后的 ROI |
| `Customer Value Adjusted ROI` | 纳入客户质量、复购、会员后的 ROI |
| `ROI Score` | 把 ROI 水平、趋势、稳定性、置信度映射成 0-100 分 |

#### 8.17.2 客户价值相关术语

| 术语 | 定义 |
|------|------|
| `Dynamic LTV` | 动态客户生命周期价值 |
| `Customer Economic Value` | 客户历史和未来经营贡献价值 |
| `Customer Value Score` | 客户价值综合管理分数 |
| `High Value Customer` | 分数或价值达到高价值阈值的客户 |
| `Refund Risk Customer` | 退款和售后风险偏高的客户 |

#### 8.17.3 使用约束

- 页面上不应混用“利润率”“ROI”“ROAS”表达同一概念
- `ROAS` 只能表示广告收入回报，不得替代 `Business ROI`
- `LTV` 不得直接替代 `Customer Value Score`
- `高价值客户` 必须有明确分数或规则阈值，不得只靠主观判断

### 8.18 文档维护约束

为了保证该文档长期有效，建议新增以下维护原则：

- 任何新增场景，必须先补 `Business ROI` 映射
- 任何新增客户标签，必须补判定规则和退出规则
- 任何新增评分项，必须补权重、来源字段和解释文案
- 任何调整阈值，必须记录版本和生效时间
- 如果一个结论无法追溯到原始数据、公式和规则，就不能进入正式诊断

### 8.19 场景化规则章节

本节用于把前述统一规则落到具体业务场景中。

所有场景都建议使用同一结构：

1. `目标`
2. `核心指标`
3. `ROI 口径`
4. `客户价值口径`
5. `达标标准`
6. `常见风险`
7. `诊断关注点`

#### 8.19.1 广告场景

##### 目标

- 判断广告计划、广告组、素材和渠道是否赚钱
- 判断广告带来的客户是否值得长期获取
- 判断当前投放是该放大、优化还是止损

##### 核心指标

- `ad_spend`
- `impressions`
- `clicks`
- `ctr`
- `cpc`
- `cpm`
- `cvr`
- `roas`
- `cac`
- `short_term_roi`
- `long_term_roi`
- `ltv_cac_ratio`

##### ROI 口径

```text
Ad Business ROI =
  (Attributed Revenue
   - COGS
   - Discount Cost
   - Shipping Subsidy
   - Payment Fees
   - Refund Loss
   - Ad Spend)
  / Ad Spend
```

##### 客户价值口径

重点看：

- `average_customer_value_score`
- `high_value_customer_share`
- `refund_risk_customer_share`
- `dynamic_ltv`
- `ltv_cac_ratio`

解释重点：

- 短期 ROI 一般但长期 ROI 高，通常意味着拉新质量较好
- 短期 ROI 高但高退款风险客户占比高，说明增长质量存疑

##### 达标标准

建议以双标准判断：

- `short_term_roi >= 0` 为基础止损线
- `long_term_roi >= 0.2` 为稳定达标线
- `ltv_cac_ratio >= 2` 为可接受
- `ltv_cac_ratio >= 3` 为优秀

##### 常见风险

- 只看 `ROAS` 忽略利润
- 只看当日转化忽略客户长期价值
- 归因窗口太短导致低估复购价值
- 成本漏记导致 ROI 被高估

##### 诊断关注点

- 是流量问题、素材问题还是落地页问题
- 是当前不赚钱，还是长期也不赚钱
- 是客户质量差，还是成本结构有问题

#### 8.19.2 SEO 场景

##### 目标

- 判断 SEO 是否带来可持续的自然流量增长
- 判断自然流量是否转化为高价值客户
- 判断 SEO 投入是否在中长期赚钱

##### 核心指标

- `organic_impressions`
- `organic_clicks`
- `organic_ctr`
- `average_position`
- `keyword_coverage`
- `organic_sessions`
- `seo_attributed_revenue`
- `seo_cost`
- `seo_business_roi`
- `long_term_roi`

##### ROI 口径

```text
SEO Business ROI =
  (SEO Attributed Revenue
   - COGS
   - Discount Cost
   - Shipping Subsidy
   - Payment Fees
   - Refund Loss
   - SEO Cost)
  / SEO Cost
```

##### 客户价值口径

重点看：

- `organic_customer_value_score`
- `organic_repeat_customer_share`
- `organic_high_value_customer_share`
- `organic_dynamic_ltv`

解释重点：

- SEO 的价值往往滞后，短期 ROI 不高不代表长期不赚钱
- 自然流量如果带来更高复购和更高 LTV，则应提高长期权重

##### 达标标准

- 日级更适合看趋势，不建议用作最终 ROI 考核
- 周级、月级更适合判断是否达标
- `long_term_roi >= 0.2` 可视为稳定达标
- `organic_high_value_customer_share` 应高于店铺平均水平

##### 常见风险

- 只看流量涨跌，不看利润质量
- 把品牌词增长误判为 SEO 能力提升
- 忽略内容制作成本和工具成本

##### 诊断关注点

- 自然流量增长来自品牌词还是非品牌词
- 自然流量带来的客户质量是否优于其他渠道
- SEO 投入的回报是否在拉长窗口后显现

#### 8.19.3 社媒内容场景

##### 目标

- 判断内容运营是否推动有效经营结果
- 判断社媒内容是否带来高价值客户或辅助转化
- 判断内容投入是否值得持续放大

##### 核心指标

- `content_published`
- `engagement_rate`
- `social_clicks`
- `assisted_sessions`
- `assisted_conversions`
- `social_attributed_revenue`
- `social_business_roi`

##### ROI 口径

```text
Social Business ROI =
  (Social Attributed Revenue
   - COGS
   - Discount Cost
   - Shipping Subsidy
   - Payment Fees
   - Refund Loss
   - Social Content Cost)
  / Social Content Cost
```

##### 客户价值口径

重点看：

- `social_average_customer_value_score`
- `social_repeat_customer_share`
- `social_member_conversion_rate`

##### 达标标准

- 不只考核互动率
- 至少要求能证明内容与会话、辅助转化或客户质量之间存在正向关系
- `long_term_roi` 与 `customer_value_score` 优先级高于点赞和曝光

##### 常见风险

- 把热度当经营结果
- 无法归因内容带来的辅助价值
- 内容成本未完整计入

##### 诊断关注点

- 内容是否推动品牌搜索、站内访问和客户留存
- 内容带来的客户是否更易入会、复购或分享

#### 8.19.4 会员场景

##### 目标

- 判断会员体系是否创造增量利润
- 判断会员是否提升客户 LTV 和复购频率
- 判断会员福利和维护成本是否可控

##### 核心指标

- `member_count`
- `member_penetration_rate`
- `member_revenue_share`
- `member_profit_share`
- `membership_value`
- `member_roi`
- `member_dynamic_ltv`
- `member_repeat_purchase_rate`

##### ROI 口径

```text
Member ROI =
  (Member Economic Value - Membership Maintenance Cost)
  / Membership Maintenance Cost
```

##### 客户价值口径

重点看：

- `member_customer_value_score`
- `member_dynamic_ltv`
- `member_repeat_purchase_rate`
- `member_profit_share`

##### 达标标准

- 会员项目不应只看会员人数增长
- 至少要求：
  - `member_dynamic_ltv` 高于非会员
  - `member_profit_share` 高于会员人数占比
  - `member_roi > 0`

##### 常见风险

- 会员人数增长但并未带来增量利润
- 会员权益成本失控
- 会员过度依赖折扣导致毛利恶化

##### 诊断关注点

- 会员是否真正提升留存和利润
- 会员带来的增量价值是否覆盖福利成本

#### 8.19.5 新品与选品场景

##### 目标

- 判断候选新品是否有赚钱潜力
- 判断上新项目是否带来正向经营回报
- 判断新品是否带来高价值客户和新增长点

##### 核心指标

- `trend_score`
- `supply_match_score`
- `margin_estimate`
- `competition_score`
- `launch_cost`
- `new_product_revenue`
- `new_product_roi`

##### ROI 口径

立项前：

```text
Opportunity Score =
  Trend Score
  + Supply Match Score
  + Margin Score
  - Competition Penalty
```

上新后：

```text
New Product ROI =
  (New Product Revenue
   - COGS
   - Shipping Subsidy
   - Payment Fees
   - Refund Loss
   - Launch Cost
   - Traffic Acquisition Cost)
  / (Launch Cost + Traffic Acquisition Cost)
```

##### 客户价值口径

重点看：

- `new_product_new_customer_share`
- `new_product_high_value_customer_share`
- `new_product_repeat_customer_rate`

##### 达标标准

- 立项阶段不强行要求真实 ROI
- 上线后必须进入统一 ROI 框架
- 新品不应只看销量，还应看客户质量和复购潜力

##### 常见风险

- 只看热度，不看毛利和竞争强度
- 只看首单，不看后续客户质量
- 只看销量，不看退款和售后

##### 诊断关注点

- 新品是短期爆发还是长期可经营品
- 新品带来的是高价值新客还是低质量冲动订单

#### 8.19.6 竞品场景

##### 目标

- 理解外部竞争环境变化
- 判断我方增长问题是内部问题还是外部竞争加剧
- 为定价、投放、上新、内容提供对标依据

##### 核心指标

- `competitor_traffic_change`
- `organic_visibility_score`
- `product_freshness_score`
- `creative_activity_score`
- `pricing_activity_score`
- `competitive_efficiency_score`

##### ROI 口径

竞品场景原则上不输出真实 ROI，只输出：

```text
Competitive Efficiency Score =
  Traffic Growth Score
  + Organic Visibility Score
  + Product Freshness Score
  + Creative Activity Score
  + Pricing Stability Score
```

##### 客户价值口径

竞品客户价值通常无法直接拿到，因此只允许做相对推断，例如：

- 竞品是否更偏高价值客群
- 竞品是否更偏高频复购类目
- 竞品是否在通过会员或价格体系锁定客户

##### 达标标准

- 竞品场景不做“是否赚钱”的绝对判断
- 只做“相对效率强弱”和“策略变化方向”判断

##### 常见风险

- 误把第三方估算流量当作精确真值
- 伪造竞品真实 ROI
- 用竞品公开表现直接推断真实利润

##### 诊断关注点

- 我方与竞品相比，差距主要在流量、商品、价格还是内容
- 竞品增长是否可能抬高我方获客成本

#### 8.19.7 场景间统一约束

虽然各场景指标不同，但必须遵守以下统一约束：

- 最终都要回到 `ROI` 或 `代理效率` 的统一表达
- 所有达标判断都必须有目标值或基准线
- 所有客户价值判断都必须可追溯到分层和评分规则
- 所有“赚钱”结论都必须明确时间窗口
- 所有“高价值”结论都必须明确阈值

## 9. 风险环境监控补充

本节用于补充“结果指标之外的环境型风险监控”，解决页面仅靠 GMV、流量、转化、退款等结果指标仍难以及时发现问题的问题。

统一原则如下：

- 结果型指标回答“出了什么结果问题”
- 风险环境回答“问题大概率出在什么业务环境”
- 风险环境优先使用失败率、异常率、超时率、阻塞率和误杀率，而不是仅看绝对量
- 风险环境的输出既服务页面展示，也服务 AI 猜测与任务生成

### 9.1 风险环境层的价值

之所以要增加风险环境层，是因为很多电商问题不会先表现为销售下滑，而是会先表现为：

- 上新失败
- 库存不准
- 履约超时
- 物流异常
- 支付失败
- 风控误杀
- 售后超时

这些问题往往比结果指标更早出现，也更适合作为任务触发源和 AI 解释依据。

### 9.2 风险环境统一输出结构

建议每个风险环境都统一输出：

```ts
type RiskEnvironmentCard = {
  key: string;
  title: string;
  status: "healthy" | "watch" | "risk";
  primaryMetricLabel: string;
  primaryMetricValue: number | string | null;
  metricDelta: number | null;
  summary: string;
  source: "real" | "estimated" | "pending";
  suggestedTaskCount: number;
};
```

### 9.3 上新管理

监控目标：

- 判断新品是否按计划上架并具备基本转化条件

建议指标：

- 上新完成率
- 上新失败率
- 商品信息缺失率
- 图片缺失率
- 价格或库存未配置率
- 上新后 24h 无曝光率
- 上新后 7d 无订单率

典型风险解释：

- 上新失败率高，导致计划商品未进入经营周期
- 信息不完整，限制首波转化
- 上线后无曝光，说明分发或商品可见性存在问题

### 9.4 库存管理补充

在现有库存健康诊断基础上，建议进一步补充：

- 库存准确率
- 超卖率
- 滞销库存占比
- 补货延迟率
- 调拨失败率

典型风险解释：

- 高动销 SKU 可售天数不足，直接影响未来 GMV
- 库存准确率下降，可能导致超卖与售后升级

### 9.5 物流与履约管理补充

在现有履约健康与物流轨迹异常基础上，建议补充：

- 按时发货率
- 超时发货率
- 物流轨迹异常率
- 妥投失败率
- 签收超时率
- 二次派送率
- 退回率

典型风险解释：

- 超时发货率升高，短期会推高投诉与退款
- 物流异常集中在单一承运商时，需要切换或分流

### 9.6 支付管理

监控目标：

- 判断结账与支付链路是否正在损失转化

建议指标：

- 支付成功率
- 支付失败率
- 支付重试率
- 支付方式异常占比
- 支付页跳失率
- 退款回退失败率

典型风险解释：

- 支付失败率上升会直接拖累转化率与 ROI
- 某支付方式异常可能只影响特定设备或地区

### 9.7 风控管理

监控目标：

- 判断风控是否拦住了坏单，同时避免误杀正常订单

建议指标：

- 欺诈订单拦截率
- 风控误杀率
- 高风险订单占比
- 拒付率
- 人工审核积压率
- 黑名单命中率

典型风险解释：

- 高风险订单占比升高，说明欺诈风险上升
- 风控误杀率升高，说明真实转化正在被损失

### 9.8 售后与服务管理补充

在现有退款与售后诊断基础上，建议补充：

- 售后响应超时率
- 工单关闭失败率
- 一次性解决率
- 退款处理超时率
- 争议升级率
- 差评集中率

典型风险解释：

- 响应超时率升高会推动差评、投诉与退款升级

### 9.9 商品内容与页面质量

监控目标：

- 判断内容质量是否正在拖累转化

建议指标：

- 高流量低转化商品占比
- 素材老化率
- 详情页完整率
- 价格竞争力异常率
- 页面加载异常率

典型风险解释：

- 商品流量正常但转化偏低，优先判断为内容或定价问题

### 9.10 广告与渠道运营补充

在现有广告 ROI、SEO 与渠道复盘基础上，建议补充：

- 低 ROI 预算占比
- 烧钱风险率
- 素材疲劳率
- 落地页失配率
- 高退款风险客户占比

典型风险解释：

- 渠道 ROI 仍可接受，但客户质量变差，说明增长质量恶化

### 9.11 第一阶段建议优先监控的失败率

第一阶段优先落以下 10 个：

1. 上新失败率
2. 超卖率
3. 库存准确率
4. 超时发货率
5. 物流异常率
6. 妥投失败率
7. 支付失败率
8. 支付页跳失率
9. 风控误杀率
10. 售后响应超时率

优先原因：

- 对经营结果影响直接
- 能明确映射到具体任务
- 适合做早期预警
- 适合为 AI 提供更有解释力的上下文

## 10. AI 猜测、任务生成与执行上下文

### 10.1 AI 的职责

AI 在该页面中的职责是：

- 解释结构化事实
- 生成可验证猜测
- 输出候选任务
- 补全任务说明
- 为“交给 AI 执行”提供上下文

AI 不负责：

- 直接从原始明细数据自由发现事实
- 无证据地生成结论
- 直接替代规则层落最终任务

### 10.2 设计原则

统一原则如下：

- AI 只解释事实，不编造事实
- AI 只生成候选任务，不直接替代规则任务
- AI 输出必须结构化，且必须带证据
- 规则层负责硬风险，AI 层负责复合归因、机会类任务和任务说明补全

### 10.3 AI 输入上下文

AI 输入必须是服务端整理后的结构化上下文，而不是原始混乱数据拼接。

建议最小结构包括：

- 店铺基础信息
- 当日快照信息
- 结果指标摘要
- ROI 与客户价值摘要
- 风险环境摘要
- 诊断项摘要
- 高风险对象 Top N
- 已存在任务摘要
- 前一日复盘摘要

建议统一对象：

```ts
type DailyOpsAiContext = {
  shop: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  summary: Record<string, unknown>;
  roi: Record<string, unknown>;
  customers: Record<string, unknown>;
  riskEnvironments: Array<Record<string, unknown>>;
  diagnosisItems: Array<Record<string, unknown>>;
  topObjects: Record<string, unknown>;
  existingTasks: Array<Record<string, unknown>>;
  review: Record<string, unknown>;
};
```

### 10.4 AI 输出结构

AI 至少输出两类对象：

1. `hypotheses`
2. `taskCandidates`

#### hypotheses

每条猜测至少包含：

- 标题
- 摘要
- 证据
- 推理
- 置信度
- 关联指标

#### taskCandidates

每条候选任务至少包含：

- 任务标题
- 任务目标
- 所属象限
- 优先级
- 为什么现在做
- 影响指标
- 预估提升幅度
- ROI 影响说明
- 建议动作
- 负责角色
- 时限
- AI 执行提示词

### 10.5 AI 输出约束

必须满足：

- 不得捏造未提供的数据
- 没有证据的猜测不得输出高置信度
- 每个任务必须映射到至少一个具体指标
- 每个任务必须有明确动作，而不是空泛建议
- 与已存在任务重复的候选任务必须在后处理时去重

### 10.6 任务生成机制

任务生成采用：

`规则任务 + AI 候选任务 + 合并去重`

#### 规则任务

负责：

- 超时未发货
- 物流异常
- 库存止损
- 退款异常
- 流量 / 转化硬风险

#### AI 候选任务

负责：

- 复合归因任务
- 机会类任务
- 解释型任务
- 任务影响说明补全

### 10.7 去重逻辑

任务去重不应只看标题，建议使用：

`problemKey + primaryObjectId + impactMetric + dueWindow`

示例：

- `refund_spike:sku_123:refund_rate:48h`
- `payment_drop:mobile_card:payment_success_rate:today`

### 10.8 交给 AI 执行

用户点击“交给 AI 执行”后，系统应带着完整任务上下文打开新的对话，而不是只传任务标题。

建议最小上下文包括：

- 任务标题
- 触发原因
- 任务目标
- 影响指标
- 预估提升
- ROI 影响摘要
- 证据
- 相关对象
- 建议动作

第一阶段建议采用：

- 点击后跳转 AI Assistant
- 自动创建新对话
- 预填任务上下文与默认指令
- 用户确认后发送

不建议第一阶段直接自动发送。

## 11. 诊断到任务的转换规则

建议统一使用规则引擎实现：

```ts
type DiagnosisRule = {
  diagnosisKey: string;
  condition: string;
  quadrant: string;
  priority: "P0" | "P1" | "P2";
  taskTitle: string;
  ownerRole: string;
  dueWindow: "today" | "48h" | "this_week" | "backlog";
};
```

推荐首批规则：

| diagnosisKey | condition | quadrant | priority | taskTitle |
|--------------|-----------|----------|----------|-----------|
| fulfillment_overdue | overdue_orders > 0 | 紧急重要 | P0 | 超时未发货处理 |
| logistics_stale | stale_tracking_orders > 0 | 紧急重要 | P0 | 物流异常跟进 |
| refund_spike | refund_rate > 5 and refund_rate_delta > 0 | 紧急重要 | P1 | 退款原因复盘 |
| inventory_risk | sellable_days < 7 | 紧急重要 | P0 | 高动销 SKU 补货 |
| ad_burn | roas < target_roas and ad_spend_growth > threshold | 紧急重要 | P1 | 广告止损调整 |
| routine_shipping | pending_orders > 0 and overdue_orders = 0 | 紧急不重要 | P1 | 常规发货处理 |
| seo_opportunity | impressions_up and ctr_down | 不紧急重要 | P2 | SEO 标题优化 |
| trend_product | trend_score high and margin_estimate > 0 | 不紧急重要 | P2 | 新品候选评审 |

## 12. 第一阶段实现建议

推荐第一阶段只落地以下诊断与工作流：

### 12.1 先做的诊断点

- 销售趋势
- 转化率
- 履约健康
- 物流轨迹异常
- 退款与售后
- 库存健康
- 支付管理
- 风控管理
- 上新管理
- 售后失败率

### 12.2 先做的工作流

- 待发货与超时履约处理
- 物流轨迹异常处理
- 退款与差评止损
- 高动销 SKU 库存止损
- 流量/转化异常止损
- 常规发货与物流跟进
- 支付链路排查
- 风控阈值复核
- 上新失败复盘
- 售后超时处理

### 12.3 暂缓的工作流

- SEO 深度分析
- 外部趋势榜单聚合
- 竞品全量监控
- 自动化供应链找货
- 完全自动执行型任务闭环
- 跨平台统一支付与风控归因

原因：

- 这些能力依赖外部接入较多
- 当前项目现成数据基础更偏订单、退款、库存、履约
- 应优先跑通风险发现和任务闭环

## 13. 后续数据建模建议

建议将文档中的诊断、风险环境与任务抽象为以下基础实体：

- `diagnosis_snapshot`
- `diagnosis_item`
- `workflow_run`
- `workflow_task`
- `workflow_review`
- `workflow_outcome`
- `risk_environment_snapshot`
- `ai_hypothesis`
- `ai_task_candidate`

推荐字段方向：

```ts
type DiagnosisItem = {
  key: string;
  name: string;
  status: "健康" | "关注" | "风险";
  quadrant: string;
  metrics: Record<string, number | string>;
  formulas: string[];
  evidence: string[];
  reasoning: string[];
  taskSuggestion?: {
    title: string;
    priority: string;
    ownerRole: string;
  };
};
```

建议在现有任务模型基础上新增：

- `sourceType`：`rule | ai | hybrid`
- `objective`
- `impactMetrics`
- `estimatedLiftPercent`
- `roiImpactSummary`
- `aiContextPayload`
- `confidence`
- `riskEnvironment`

## 14. 总结

该设计的核心不是再做一份“日报”，而是把每天的经营问题、风险环境和运营动作统一组织为一套可执行的工作系统。

统一原则如下：

- 所有业务点都先抽象为工作流
- 所有工作流都统一为 `1. 发现 2. 判断 3. 执行与复盘`
- 所有诊断都必须可回溯到具体数据和公式
- 所有风险环境都应优先以失败率、异常率、超时率和误杀率衡量
- 所有诊断都尽量能转化为具体任务
- 所有 AI 猜测都必须基于结构化上下文并附带证据
- 所有任务都通过 `紧急 / 重要` 四象限决定排序和呈现方式

如果后续进入实现阶段，建议先基于本文件补一层：

- `诊断项 schema`
- `风险环境 schema`
- `任务 schema`
- `AI 猜测 schema`
- `诊断规则配置`
- `页面接口返回结构`
