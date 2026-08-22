# Today 页面报告结构调整方案与 Todo

版本：v0.1  
范围：`/app/today` 及其二级详情页  
关联文档：`docs/DAILY_OPERATIONS_WORKFLOWS.md`

## 1. 调整目标

本轮调整的目标不是把 `Today` 做成另一份长报告，而是把它收敛为一个真正可执行的经营驾驶舱：

1. 用户打开后 10 秒内知道现在赚不赚钱
2. 能快速理解为什么赚钱或亏钱
3. 能立刻进入最值得处理的动作

对应固定工作路径：

`Today 看赚钱结果 -> Health Monitor 看可信度与异常 -> Tasks 去执行 -> AI 做更深下钻`

## 2. 必须遵守的边界

结合当前项目约束，本轮调整必须遵守以下规则：

1. `app.today.diagnosis.tsx` 和 `app.today.insights.tsx` 保持为纯重定向路由，不承载正式页面逻辑
2. `Today` 首页只承载聚合摘要、关键判断和推荐动作，不展开长篇报告正文
3. 完整报告留在 `Today` 二级详情页承载
4. `Health Monitor` 继续负责可信度、达标性与异常原因，不把它重新混回 `Today`
5. `Tasks` 继续负责执行状态与结果，不让 `Today` 承担任务中心职责

### 2.1 Today 与 Health Monitor 的展示差异

这两类页面虽然都在解释经营问题，但职责和展示重心不同，不能做成同一种页面。

#### Today 的核心职责

`Today` 负责帮助用户做经营决策，所以必须优先回答：

1. 现在整体赚不赚钱
2. 为什么会这样
3. 具体该看哪些对象
4. 哪些对象值得继续放大，哪些对象需要先止损

因此，`Today` 的展示重点应是：

- 粗粒度经营概览
- 对象级别结果
- 决策优先级

这里的对象包括：

- 商品
- 订单
- 广告 / 渠道
- 页面

也就是说，`Today` 不是只给“判断”，而是必须尽快落到“对象”。

#### Health Monitor 的核心职责

`Health Monitor` 负责回答系统是否健康、数据是否达标、异常为什么发生。

它更适合承载：

- 当前情况
- 健康度标准
- 是否达标
- 问题拆解
- 为什么异常

因此，`Health Monitor` 的展示重点应是：

- 判断
- 标准
- 拆解

而不是对象级经营对比或对象级经营排序。

#### 两者的结构区别

建议固定区分为：

- `Today`
  - `概览（粗指标） -> 对象（商品 / 订单 / 广告 / 页面） -> 决策动作`

- `Health Monitor`
  - `当前情况 -> 健康标准 -> 问题拆解 -> 建议动作`

#### 设计约束

因此在后续实现中，应明确遵守：

1. `Today` 详情页必须允许对象级展示成为主体内容
2. `Health Monitor` 详情页不需要追求大量对象级排行
3. 不能把 `Health Monitor` 的“标准 + 拆解”模板直接复制到 `Today`
4. 不能把 `Today` 的“对象决策页”逻辑直接套进 `Health Monitor`

## 3. 当前实现现状

### 3.1 已有能力

当前 `Today` 已有两类基础能力：

1. 首页总览
   - 文件：`app/routes/app.today._index.tsx`
   - 当前结构：`国家筛选 + 核心指标 + 经营模块`

2. 统一详情模板
   - 文件：`app/routes/page/TodayMetricDetailPage.tsx`
   - 当前结构：`报告结论 + 关键指标 + 趋势拆解 + 关键对象 + 建议动作 + AI 入口`

### 3.2 当前缺口

当前缺口不在“有没有报告模板”，而在“首页还不是经营驾驶舱”：

1. 首页缺少统一的经营状态头部
2. 首页缺少 `ROI 三层摘要`
3. 首页核心指标仍偏当前模块拼装，尚未完全切到“经营结果/利润/投入回报”视角
4. 当前一级模块仍偏“流量/转化/订单”视角，尚未完全切到“经营结果/利润/投入回报”视角

## 4. 目标信息架构

### 4.0 三层报告结构

本轮 `Today` 建议明确固定为三层报告结构，而不是把所有内容塞进同一页：

1. `A 报告：概览`
   - 用于回答：现在赚不赚钱、为什么、先看哪个关键指标
   - 结构：每一个关键指标的分析 + 关键数据展示
   - 承载位置：`Today` 首页

2. `B 报告：子模块决策页`
   - 用于回答：某个关键指标的结论是如何分析出来的、论证依据是什么
   - 结构：顶部总判断 + 摘要指标 + 分析论证 + 指标拆解 + 拆解对应对象 + Top 对象展示
   - 承载位置：各个二级详情页，如收入分析、投入回报分析、流量分析、转化分析

3. `C 报告：Top 对象完整数据`
   - 用于回答：某个商品、订单、广告、页面到底发生了什么，是否值得继续放大或先止损
   - 结构：对象 + 数据 + 分析结论
   - 承载位置：B 报告内由 `Top 对象` 进一步展开的完整数据视图

因此，`Today` 的标准路径应固定为：

`A 报告（概览） -> B 报告（子模块决策页） -> C 报告（Top 对象完整数据）`

## 4.1 Today 首页

本轮 `Today` 首页建议先固定为以下三个核心区块：

1. 经营状态头部
2. 核心经营指标
3. 为什么会这样
4. ROI 三层摘要

这四块合起来构成 `A 报告`。其中：

- `经营状态头部` 负责先给出总判断
- `核心经营指标` 负责把关键数据直观挂出来
- `为什么会这样` 负责给出经营语言下的原因解释
- `ROI 三层摘要` 负责把投入回报问题单独拎出来

### 4.1.1 经营状态头部

目标：先回答“我的店现在赚钱吗？”

建议展示：

- 当前经营状态：`健康增长 / 收入增长但利润下降 / 盈利压力`
- 一句话总结
- 当前主要瓶颈
- 当前最大机会
- 数据新鲜度
- 数据置信度

### 4.1.2 核心经营指标

目标：给出经营语言下的最小必要数字面板。

建议优先保留 6 张卡：

- 收入
- 成本
- 利润
- 利润率
- 订单数
- 客单价

说明：

- 若本阶段真实成本未完全具备，可先用“已实现口径 + 估算口径”并显式标注来源
- 不建议首页先堆很多图，仍然保持摘要化

#### 4.1.2.1 核心经营指标卡的进入语义

`A 报告` 里的每一张指标卡都应作为对应 `B 报告` 的正式入口，而不是只承担展示数值的作用。

建议固定映射为：

- `收入` -> `收入分析 B 报告`
- `成本` -> `成本分析 B 报告`
- `利润` -> `利润分析 B 报告`
- `利润率` -> `利润率分析 B 报告`
- `订单数` -> `订单分析 B 报告`
- `客单价` -> `客单价分析 B 报告`
- `ROI` 各层卡片 -> `投入回报分析 B 报告`

这条约束的意义是：

1. `A 报告` 负责告诉用户“先看哪个关键指标”
2. `B 报告` 负责解释“这个关键指标是如何拆解和论证出来的”
3. 不再依赖独立导航去寻找子模块页，而是让用户从问题本身进入对应分析

### 4.1.3 ROI 三层摘要

首页不应只展示一个孤立 ROI，而应固定展示三层：

1. 短期 ROI
2. 回收期 ROI
3. 长期 ROI

每层只保留：

- 当前状态
- 一句解释
- 一个关键值
- 数据成熟度 / 置信度

### 4.1.4 三个数据块的详细规格

这一节用于把首页三个核心区块补成可执行规格。每个区块都必须明确：

1. 它要回答什么问题
2. 它依赖哪些原始数据
3. 它如何组织成前端对象
4. 它的计算口径是什么
5. 它最终如何展示
6. 结果是通过哪个加载链路拿到的

#### 4.1.4.1 经营状态头部

**要回答的问题**

- 现在整体是赚钱、承压，还是已经进入盈利压力
- 当前利润变化更像是规模问题，还是成本/损耗问题
- 这一页的数据是否足够可信

**原始数据来源**

首期直接使用 `loadTodayOverviewData` 已有链路中的订单聚合结果：

- `sevenDayTotals.revenue`
- `sevenDayTotals.subtotal`
- `sevenDayTotals.discounts`
- `sevenDayTotals.paymentFees`
- `sevenDayTotals.refundLoss`
- `sevenDayTotals.orders`
- `sevenDayTotals.firstOrders`
- `baselineTotals.*`
- `defaultGrossMarginPercent`

来源文件：

- `app/server/operations/todayGeo.server.ts`

原始事实表：

- `shopOrder`
- `shopRefund`
- 店铺成本配置 `ShopCostConfig`

**前端对象建议**

```ts
type TodayHeader = {
  status: "healthy" | "watch" | "risk";
  statusLabel: string;
  summary: string;
  primaryBottleneck: string;
  biggestOpportunity: string;
  dataFreshness: string;
  dataConfidence: "high" | "medium" | "low";
  metrics: {
    revenue: string;
    estimatedProfit: string;
    estimatedProfitMargin: string;
    shortTermReturn: string;
  };
};
```

**计算口径**

1. 估算货品成本

```ts
estimatedCogs = subtotal * (1 - defaultGrossMarginPercent / 100)
```

2. 估算经营成本

```ts
estimatedCost = estimatedCogs + discounts + paymentFees + refundLoss
```

3. 估算经营利润

```ts
estimatedProfit = revenue - estimatedCost
```

4. 估算利润率

```ts
estimatedProfitMargin = estimatedProfit / revenue
```

5. 当前短期经营回报倍数

当前代码已经在用的口径：

```ts
shortTermReturn = revenue / estimatedCost
```

说明：

- 这不是最终完整的 `Business ROI`
- 它是当前阶段可稳定产出的“经营回报倍数”
- 在广告成本、履约成本完整接入前，首页头部不应把它伪装成完整净利润 ROI

6. 基准期对比

为避免把 7 天值直接和 30 天总和对比，正式首页建议统一折算为“7 天可比基准”：

```ts
baselineComparableRevenue = baselineTotals.revenue / 30 * 7
baselineComparableOrders = baselineTotals.orders / 30 * 7
baselineComparableCost = baselineEstimatedCost / 30 * 7
baselineComparableProfit = baselineEstimatedProfit / 30 * 7
```

再计算变化率：

```ts
revenueDelta = (currentRevenue - baselineComparableRevenue) / baselineComparableRevenue
profitDelta = (currentProfit - baselineComparableProfit) / baselineComparableProfit
```

7. 头部状态判断

建议首版统一使用以下规则：

- `healthy`
  - `estimatedProfit > 0`
  - 且 `profitDelta >= 0`
  - 且 `estimatedProfitMargin >= 10%`

- `watch`
  - `estimatedProfit > 0`
  - 但 `profitDelta < 0`
  - 或 `estimatedProfitMargin < 10%`

- `risk`
  - `estimatedProfit <= 0`
  - 或 `estimatedProfitMargin < 5%`
  - 或 `shortTermReturn` 明显低于基准的 `85%`

8. 主要瓶颈与机会

首版不依赖 Top 洞察，也可以用规则产出两个字段：

- `primaryBottleneck`
  - 优先级建议：
    1. `refundLoss / revenue` 偏高
    2. `discounts / revenue` 偏高
    3. `profitDelta < 0`
    4. `orders` 下滑

- `biggestOpportunity`
  - 优先级建议：
    1. 利润率已转正且收入增长
    2. 首单占比高且退款未失控，说明拉新仍有空间
    3. 复购价值层数据健康时，说明老客贡献仍可放大

**展示方式**

头部不做大表格，建议仅展示：

- 左侧：状态标签 + 一句话总结
- 右侧：4 个辅助数字
  - 收入
  - 估算利润
  - 估算利润率
  - 短期经营回报
- 底部：`主要瓶颈` / `最大机会`
- 角标：`数据新鲜度` + `数据置信度`

**结果获取链路**

首屏同步获取：

```ts
app.today._index.tsx
  -> loadTodayOverviewData()
  -> loadOrderScopeData()
  -> 聚合 sevenDayTotals / baselineTotals
  -> buildTodayHeader()
```

#### 4.1.4.2 核心经营指标

**要回答的问题**

- 过去 7 天盘子有多大
- 当前利润空间够不够
- 规模增长有没有变成真实经营改善

**建议保留的 6 张卡**

1. 收入
2. 成本
3. 利润
4. 利润率
5. 订单数
6. 客单价

**前端对象建议**

```ts
type TodayMetricCard = {
  key: "revenue" | "cost" | "profit" | "profit_margin" | "orders" | "aov";
  label: string;
  value: string;
  delta: string;
  tone: "positive" | "neutral" | "warning" | "negative";
  source: "realized" | "estimated";
  summary?: string;
};
```

**数据组织与计算**

1. 收入

```ts
value = sevenDayTotals.revenue
baseline = baselineTotals.revenue / 30 * 7
delta = (value - baseline) / baseline
source = "realized"
```

2. 成本

```ts
value = estimatedCost
baseline = baselineEstimatedCost / 30 * 7
delta = (value - baseline) / baseline
source = "estimated"
```

3. 利润

```ts
value = estimatedProfit
baseline = baselineEstimatedProfit / 30 * 7
delta = (value - baseline) / baseline
source = "estimated"
```

4. 利润率

```ts
value = estimatedProfit / revenue
baseline = baselineEstimatedProfit / baselineTotals.revenue
delta = value - baseline
source = "estimated"
```

5. 订单数

```ts
value = sevenDayTotals.orders
baseline = baselineTotals.orders / 30 * 7
delta = (value - baseline) / baseline
source = "realized"
```

6. 客单价

```ts
value = revenue / orders
baseline = baselineComparableRevenue / baselineComparableOrders
delta = (value - baseline) / baseline
source = "realized"
```

**颜色与状态建议**

- `positive`
  - 收入 / 利润 / 利润率 / 订单 / 客单价高于基准
  - 成本低于基准

- `warning`
  - 偏离幅度较小但方向不理想

- `negative`
  - 利润、利润率明显低于基准
  - 成本明显高于基准

建议阈值：

- 轻微偏离：`5%`
- 明显偏离：`15%`

**展示方式**

建议 2 行 3 列卡片，不额外展开大图：

- 主值
- 较基准变化
- 数据来源角标
- 一句简短解释

例如：

- 收入：`$125,000`
- 较基准：`+12%`
- 来源：`已实现`

**结果获取链路**

与头部一致，全部从首页 loader 同步输出：

```ts
loadTodayOverviewData()
  -> loadOrderScopeData()
  -> buildTodayMetricCards()
```

#### 4.1.4.3 ROI 三层摘要

**要回答的问题**

- 最近的经营投入有没有回报
- 回报回得快不快
- 买来的客户长期值不值得买

**前端对象建议**

```ts
type TodayRoiSummary = {
  shortTerm: {
    label: string;
    status: "strong" | "stable" | "weak" | "unavailable";
    value: string;
    summary: string;
    dataQuality: "realized" | "estimated" | "predicted";
    confidence: "high" | "medium" | "low";
  };
  payback: {
    label: string;
    status: "fast" | "normal" | "slow" | "unavailable";
    value: string;
    summary: string;
    dataQuality: "realized" | "estimated" | "predicted";
    confidence: "high" | "medium" | "low";
  };
  lifetime: {
    label: string;
    status: "high" | "medium" | "low" | "unavailable";
    value: string;
    summary: string;
    dataQuality: "realized" | "estimated" | "predicted";
    confidence: "high" | "medium" | "low";
  };
};
```

**短期 ROI / 经营回报**

首版建议直接使用当前已落地的可计算口径：

```ts
shortTermReturn = revenue / estimatedCost
```

状态建议：

- `strong`: `>= 1.5x`
- `stable`: `1.0x ~ 1.5x`
- `weak`: `< 1.0x`

说明：

- 这是一层“短期经营回报倍数”
- 当前更适合标 `dataQuality = estimated`
- 若订单、退款、支付费都已齐全，可给 `confidence = high`

**回收期 ROI**

正式目标口径：

```ts
D7PaybackRoi = D7累计贡献利润 / CAC
D30PaybackRoi = D30累计贡献利润 / CAC
```

但要成立，必须同时具备：

1. 获客成本 `CAC`
2. cohort 粒度累计贡献利润
3. 至少 D7 / D30 回收窗口

当前仓库已有价值层异步接口：

- `/api/today-value-layer`
- `loadValueLayer()`

但现阶段主要能稳定提供的是：

- 渠道收入
- 贡献利润
- 客户价值

如果没有 `CAC` 或 cohort 回收表，则首页这一槽位不应输出伪造 ROI 数字。

首版建议：

- 展示状态：`unavailable`
- 文案：`待接入获客成本与 cohort 回收口径`
- 不要为了完整性硬给一个“估算回收 ROI”

**长期 ROI**

正式目标口径：

```ts
lifetimeRoi = dynamicLtv / CAC
```

或：

```ts
predictedLifetimeRoi = (realizedGrossProfit + predictedFutureProfit) / CAC
```

当前仓库已有的客户价值层可稳定提供：

- `realizedGrossProfit`
- `predictedFutureProfit`
- `dynamicLtv`
- `repeatPurchaseRate`
- `highValueShare`

但如果缺少渠道级或项目级 `CAC`，就仍然不能把它写成真正的长期 ROI。

首版建议：

- 若有 `CAC`：显示长期 ROI
- 若无 `CAC`：只保留“长期价值状态”，不显示 ROI 倍数
- 首页字段仍可占位，但状态应为 `unavailable`

**展示方式**

每层只展示 4 个元素：

1. 标签
2. 状态
3. 一个关键值
4. 一句解释

例如：

- 短期经营回报：`1.3x`
- 状态：`稳定`
- 解释：`最近 7 天仍在赚钱，但回报已低于前 30 天基准`

对于 `unavailable`：

- 不显示伪数值
- 统一展示 `待接入`
- 保留 explain 文案说明缺什么数据

**结果获取链路**

首页建议采用“首屏同步 + 首屏后补充”的双阶段：

1. 首屏同步

```ts
loadTodayOverviewData()
  -> loadOrderScopeData()
  -> buildShortTermRoiSummary()
```

2. 首屏后异步

```ts
/api/today-value-layer
  -> loadValueLayer()
  -> customers / channels
  -> 尝试补齐 payback / lifetime
```

如果异步层仍缺 `CAC`，则保留 `unavailable`，不强行填数。

### 4.1.5 暂缓项

以下三类首页区块先不纳入本轮：

1. `关键因子 Top 3`
2. `Top 洞察`
3. `任务与推荐动作`

原因：

- 当前这轮先把首页主问题收敛为“是否赚钱 + 为什么大致变化 + ROI 状态”
- 先避免首页信息密度过高，影响第一眼判断
- 待首页骨架和数据口径稳定后，再决定是否回补这些摘要区块

若后续恢复，建议依然按工作流文档中的压缩原则处理，只做摘要，不展开完整证据链。

## 4.2 Today 二级详情页

二级详情页建议从“模块报告页”进一步收敛为“对象决策页”。

核心原则：

1. 首页先给粗粒度判断
2. 下一步必须落到能执行决策的对象
3. 报告不是独立目的地，而是对象分析的表达方式

也就是说，正式路径建议固定为：

`概览（粗指标） -> 对象（商品 / 订单 / 广告 / 页面） -> 决策动作`

其中：

- 收入、利润、成本问题，优先落到 `商品` / `订单`
- 投入回报问题，优先落到 `广告` / `渠道`
- 流量问题，优先落到 `页面` / `来源`
- 转化问题，优先落到 `页面` / `订单` / `支付链路`

### 4.2.1 对象优先原则

当某个概览指标异常后，详情页不应只继续给一页抽象分析，而应明确告诉用户：

1. 是哪些对象在支撑结果
2. 是哪些对象在拖累结果
3. 用户下一步应该先处理哪几个对象

建议对象落点如下：

- 经营结果异常
  - `商品`
  - `订单`

- ROI / 投放异常
  - `渠道`
  - `广告`

- 流量异常
  - `落地页`
  - `来源`

- 转化异常
  - `落地页`
  - `结账页`
  - `支付失败订单`

### 4.2.2 原详情页报告如何融入对象层

原来的详情页报告不需要消失，但不再作为一整页独立的长报告存在，而应并入“对象分析”结构中。

建议改成：

1. 先给一段顶部总判断
2. 再直接进入对象分组
3. 每个对象组内部再承载原报告的结论、证据和动作

也就是把原有的：

- 报告结论
- 关键指标
- 趋势拆解
- 关键对象
- 建议动作

改成按对象组织：

- `对象摘要`
- `对象指标`
- `对象趋势 / 结构`
- `对象问题判断`
- `对象建议动作`

### 4.2.3 建议页面结构

统一结构建议调整为：

1. 这页要回答的问题
2. 顶部总判断
3. 分析论证
4. 页内摘要指标
5. 指标拆解
6. 拆解对应对象证据
7. 其他补充对象组
8. 对象级建议动作 / C 报告入口
9. AI 深钻入口

说明：

- 首页做压缩摘要
- 详情页做对象级解释
- 原报告内容融入对象组内部
- 不再把长报告重新塞回首页

#### 4.2.3.1 B 报告标准骨架

本轮建议明确把 `B 报告` 固定为如下骨架：

1. `结论与分析`
2. `摘要指标`
3. `指标拆解与对象`
4. `补充 Tips`
5. `C 报告下钻`

其中最关键的是第 3 层：

- 不能只展示“Top 对象”
- 必须先回答“这个指标本身是怎么拆开的”
- 然后把拆解结果与对应对象证据直接绑定

也就是说，`B 报告` 不应再是：

`分析结论 -> 一堆 Top 对象`

而应改成：

`分析结论 -> 指标拆解 -> 每块拆解对应的对象证据`

#### 4.2.3.2 指标拆解与对象绑定原则

`B 报告` 中的“指标拆解”不是独立模块，它的价值在于把抽象指标转成可决策的对象。

建议遵守以下原则：

1. 每一个拆解块后面，直接跟它对应的对象组
2. 不要先统一展示完所有拆解，再在页面底部统一堆一层对象排行
3. 如果某个对象组已经服务于某个拆解块，就不需要在后面重复出现
4. 只有未被拆解块吸收的补充对象组，才放在“其他补充对象”区域

推荐的阅读路径应为：

`这个指标由哪些部分组成 -> 这一部分对应哪些对象 -> 这些对象里谁值得继续看`

而不是：

`先看一页拆解 -> 再切换脑子去看另一堆对象列表`

#### 4.2.3.3 各核心指标的拆解建议

下面这层建议用于指导 `A 报告` 点击进入 `B 报告` 后，应该优先如何拆指标。

**收入**

- 拆到 `商品`
- 拆到 `订单`

对应问题：

- 哪些商品在带来健康增长
- 哪些商品只是在制造规模增长
- 哪些订单值得复制
- 哪些订单成交后也留不住价值

**成本**

- 拆到 `商品成本`
- 拆到 `流量成本`
- 拆到 `营销成本`（折扣 / 优惠券等）
- 拆到 `物流 / 履约成本`
- 拆到 `基础费用`（支付手续费等）
- 拆到 `售后成本`

对应问题：

- 钱到底花在哪
- 哪些成本属于必要投入
- 哪些成本已经不成比例地吞利润
- 成本问题是发生在售前，还是发生在成交后

**利润**

- 拆到 `商品利润`
- 拆到 `订单利润`

对应问题：

- 哪些商品真的在留下利润
- 哪些商品或订单虽然有收入，但没有留下经营改善

**利润率**

- 拆到 `商品利润率结构`
- 拆到 `利润率侵蚀原因`（折扣 / 退款 / 获客成本）

对应问题：

- 整体盈利空间被谁压缩了
- 哪些对象仍然保有健康利润率
- 哪些对象已经接近或跌破盈亏线

**订单数**

- 拆到 `订单质量`
- 拆到 `来源结构`

对应问题：

- 订单数增长是否健康
- 增长里高质量订单和低质量订单的占比如何变化

**客单价**

- 拆到 `购物篮结构`
- 拆到 `来源`

对应问题：

- 客单价是由哪些商品组合或加购结构拉起来的
- 哪些来源在拉高客单，哪些来源在稀释均值

**ROI**

- 拆到 `渠道回报`
- 拆到 `价值层 / 置信度`

对应问题：

- 哪些渠道是真正值得继续投的
- 哪些渠道只是有收入但没有高质量回报
- 哪些渠道当前还不适合直接拍板

### 4.2.4 对象级 Top 排行建议

这类数据建议纳入正式能力，但不放进首页首屏三大核心区块，而是放进二级详情页的 `关键对象` 区块。

推荐纳入的四类对象：

1. `Top 赚钱商品`
2. `Top 亏钱商品`
3. `Top 有效广告`
4. `Top 亏损广告`

原因：

- 它们对“为什么赚钱 / 为什么亏钱”非常有解释力
- 但信息密度高，不适合抢占首页首屏判断
- 更适合作为收入分析、利润分析、投入回报分析页里的对象级证据

#### 商品排行建议

**建议放置页面**

- 收入分析页
- 利润分析页

**要回答的问题**

- 哪些商品正在贡献最多经营利润
- 哪些商品表面卖得动，但实际在拖累利润
- 哪些商品值得继续加资源
- 哪些商品应该先止损或排查

**建议对象结构**

```ts
type TopProductItem = {
  productId: string | null;
  variantId: string | null;
  title: string;
  quantity: number;
  revenue: number;
  discountCost: number;
  refundLoss: number;
  cogs: number;
  contributionProfit: number;
  contributionMarginPercent: number | null;
  source: "realized" | "estimated";
};
```

**首版计算建议**

如果当前能拿到：

- 订单行项目收入
- SKU / variant 成本
- 折扣
- 退款

则可以先算“商品贡献利润”：

```ts
productContributionProfit =
  revenue
  - cogs
  - discountCost
  - refundLoss
```

说明：

- 如果没有商品级营销成本分摊，就不要把它命名成“最终净利润”
- 首页和详情页文案都应使用 `商品贡献利润` 或 `商品经营利润（未含广告分摊）`

**排序建议**

- `Top 赚钱商品`
  - 按 `contributionProfit desc`

- `Top 亏钱商品`
  - 按 `contributionProfit asc`
  - 只显示利润为负，或利润率明显低于阈值的商品

**展示建议**

每个列表显示 3-5 条即可，字段建议：

- 商品名
- 收入
- 贡献利润
- 利润率
- 一句提示

如需更强决策性，可补一个轻量动作字段：

- `继续放量`
- `控制折扣`
- `检查退款`
- `暂停投放`

#### 订单对象建议

**建议放置页面**

- 收入分析页
- 转化分析页

**适用场景**

- 退款损耗高
- 支付失败多
- 高金额订单转化异常
- 某类订单异常拖累利润

**建议展示**

- `Top 高价值订单`
- `Top 高退款损耗订单`
- `Top 支付失败订单`

说明：

- 订单对象更适合承接异常排查
- 不一定需要首页展示
- 更适合在详情页里作为“需要处理的对象列表”

#### 广告 / 渠道排行建议

**建议放置页面**

- 投入回报分析页

**当前仓库现状**

当前已经有渠道级贡献利润与置信度基础：

- 渠道贡献利润
- 渠道贡献利润率
- 渠道客户质量
- ROI 置信度与缺口

相关实现可复用：

- `app/server/operations/channelRoi.server.ts`
- `app/routes/component/today/TodayRoiValueLayerSection.tsx`

**要回答的问题**

- 哪些广告 / 渠道确实在赚钱
- 哪些广告 / 渠道虽然带来收入，但实际在亏损或低质

**建议对象结构**

```ts
type TopChannelItem = {
  channelKey: string;
  label: string;
  revenue: number;
  contributionProfit: number;
  contributionMarginPercent: number | null;
  businessRoi: number | null;
  roiGrade: string | null;
  confidence: "high" | "medium" | "low";
  confidenceGaps: string[];
};
```

**首版计算建议**

当前在未接入广告平台花费前，可以稳定产出：

```ts
contributionProfit =
  revenue
  - cogs
  - discountCost
  - paymentFees
  - refundLoss
```

因此首版可以先做：

- `Top 有效渠道`
  - 按 `contributionProfit desc`

- `Top 低利润渠道`
  - 按 `contributionMarginPercent asc`
  - 或 `contributionProfit asc`

但此时不要把它写成严格的 `Top 有效广告 ROI / Top 亏损广告 ROI`，因为：

- 当前 `investmentCost` 仍可能为 `null`
- 未接入广告平台花费时，`businessRoi` 不成立

也就是说：

- 现在可以做 `Top 赚钱渠道 / Top 低利润渠道`
- 等广告花费接入后，再升级为 `Top 有效广告 / Top 亏损广告`

**展示建议**

每个列表显示 3-5 条即可，字段建议：

- 渠道名
- 归因收入
- 贡献利润
- 利润率或 ROI
- 置信度

如果后续接入更细粒度广告数据，再下钻为：

- Campaign
- Ad Set
- Creative

#### 页面对象建议

**建议放置页面**

- 流量分析页
- 转化分析页

**为什么必须有页面对象**

如果问题是流量质量或转化承接，真正可执行的对象往往不是“流量”本身，而是：

- 哪个落地页接不住流量
- 哪个页面有高会话低转化
- 哪个结账页或支付页发生流失

**建议展示**

- `Top 高流量页面`
- `Top 高流量低转化页面`
- `Top 加购高但到达结账低的页面`
- `Top 到达结账高但支付完成低的页面`

**建议字段**

```ts
type TopPageItem = {
  pageKey: string;
  title: string;
  sessions: number;
  conversionRate: number | null;
  addToCartRate: number | null;
  checkoutReachRate: number | null;
  checkoutCompleteRate: number | null;
  revenuePerSession: number | null;
  summary: string;
};
```

说明：

- 如果当前 Shopify sessions 只能拿到来源维度，页面对象先占位
- 页面级对象是流量与转化做决策时非常重要的一层，后续应优先补齐

#### 是否进入首页

本轮建议：

- 不进入首页三大核心区块
- 不单独占首页大卡
- 可在后续版本考虑在首页增加一行很轻的对象摘要，例如：
  - `最赚钱商品：Product A`
  - `最强渠道：Google`

但这应放在首页骨架稳定之后，再决定是否需要。

## 5. 页面与路由映射建议

## 5.1 保留的正式路由

- `/app/today`
- `/app/today/orders`
- `/app/today/traffic`
- `/app/today/conversion`
- `/app/today/roi`

## 5.2 建议新增的正式路由

为了和经营语言对齐，建议逐步新增：

- `/app/today/revenue`
- `/app/today/cost`
- `/app/today/profit`

说明：

### 第一阶段

先不急着删除旧页，采用“旧页承载、新语义命名”的兼容方式：

- `orders` 逐步升级为“收入分析”
- `roi` 逐步升级为“投入回报分析”
- `traffic` / `conversion` 逐步退居为 ROI 因子下钻页

### 第二阶段

待数据模型稳定后，再把首页一级经营入口调整为：

- 经营总览
- 收入分析
- 成本分析
- 利润分析
- 投入回报分析

## 5.3 兼容路由约束

以下路由保持兼容，不作为正式承载页：

- `app/routes/app.today.diagnosis.tsx`
- `app/routes/app.today.insights.tsx`

## 5.4 详情页页面规格映射

这一节用于把“对象决策页”落到具体页面上，明确每个页面：

1. 要回答什么问题
2. 先给什么顶部总判断
3. 应该落到哪些对象组
4. 每个对象组里要放什么
5. 用户最终怎么做动作

### 5.4.1 经营总览页 `/app/today`

**要回答的问题**

- 当前整体是否赚钱
- 当前利润变化主要受什么影响
- 下一步应该进入哪类对象页继续看

**页面结构**

1. 经营状态头部
2. 核心经营指标
3. ROI 三层摘要
4. 下一步入口卡

**下一步入口建议**

- 去收入分析
- 去投入回报分析
- 去流量/转化分析

说明：

- 首页本身不承担大量对象明细
- 首页负责把用户快速送到正确的对象页

### 5.4.2 收入分析页 `/app/today/orders`（后续可迁移到 `/app/today/revenue`）

**要回答的问题**

- 钱主要从哪些商品和订单来
- 哪些收入看起来在增长，但质量并不好
- 哪些对象值得继续放大

**顶部总判断**

建议只保留一段简短判断：

- 当前收入是否增长
- 收入增长是否伴随利润改善
- 收入是否过度依赖折扣或单一对象

**对象分组建议**

1. `Top 赚钱商品`
2. `Top 亏钱商品`
3. `Top 高价值订单`
4. `Top 高退款损耗订单`

**每个对象组内部建议结构**

1. 对象摘要
2. 关键指标
3. 对象问题判断
4. 建议动作

例如商品对象组可统一展示：

- 商品名
- 收入
- 贡献利润
- 利润率
- 折扣/退款提示
- 动作：继续放量 / 控制折扣 / 排查退款

**用户最终动作**

- 继续推高利润商品
- 降低低利润商品折扣
- 排查高退款订单
- 识别“假增长”来源

### 5.4.3 投入回报分析页 `/app/today/roi`

**要回答的问题**

- 哪些投入确实值得继续
- 哪些渠道 / 广告正在拖累经营回报
- 当前 ROI 的问题是回报弱，还是客户质量差

**顶部总判断**

建议先回答：

- 短期经营回报是否健康
- 回收期 / 长期 ROI 是否可读
- 当前 ROI 判断的置信度是否足够

**对象分组建议**

1. `Top 赚钱渠道`
2. `Top 低利润渠道`
3. `高价值客户占比高的渠道`
4. `低置信度但需要复核的渠道`

若后续广告花费接入更细，可继续下钻：

5. `Top 有效 Campaign`
6. `Top 亏损 Campaign`

**每个对象组内部建议结构**

- 渠道 / 广告名
- 归因收入
- 贡献利润
- 利润率或 ROI
- 客户质量
- 置信度与缺口
- 动作：继续放量 / 限制预算 / 等待补数 / 深入复核

**用户最终动作**

- 放大高利润高质量渠道
- 收缩低利润低质量渠道
- 对置信度不足的数据先复核再决策

### 5.4.4 流量分析页 `/app/today/traffic`

**要回答的问题**

- 流量是来自哪里
- 哪些来源有量但没质量
- 哪些页面承接不住流量

**顶部总判断**

建议先回答：

- 流量规模是否变化
- 有效流量质量是否同步变化
- 当前问题更像“来源错了”还是“页面接不住”

**对象分组建议**

1. `Top 高流量来源`
2. `Top 高流量低转化来源`
3. `Top 高流量页面`
4. `Top 高流量低承接页面`

**每个对象组内部建议结构**

- 来源/页面名
- 会话数
- 页/会话
- 加购率
- 转化率
- 收入/会话
- 动作：调整入口 / 优化页面 / 降低低效流量

**用户最终动作**

- 保留高质量来源
- 降低无效流量
- 优先修高流量低承接页面

### 5.4.5 转化分析页 `/app/today/conversion`

**要回答的问题**

- 用户具体卡在哪一段
- 是页面承接问题，还是支付链路问题
- 哪些对象值得优先处理

**顶部总判断**

建议先回答：

- 总体转化是否承压
- 当前主要掉点发生在前段、中段还是末段
- 问题更偏页面还是订单/支付链路

**对象分组建议**

1. `Top 高会话低转化页面`
2. `Top 加购高但到达结账低的页面`
3. `Top 到达结账高但完成支付低的页面`
4. `Top 支付失败订单`

**每个对象组内部建议结构**

- 页面/订单标识
- 会话或订单量
- 加购率
- 到达结账率
- 完成支付率
- 问题判断
- 动作：优化页面 / 排查支付 / 处理异常订单

**用户最终动作**

- 先修高流量掉点页面
- 跟进支付失败订单
- 验证是否存在运费、支付、信任信息问题

### 5.4.6 成本分析页 `/app/today/cost`（规划中）

**要回答的问题**

- 钱主要花在哪里
- 哪些成本还合理，哪些已经开始侵蚀利润
- 哪些对象在制造浪费成本

**对象分组建议**

1. `Top 成本商品`
2. `Top 高折扣商品`
3. `Top 高退款损耗订单`
4. `Top 高成本渠道`

### 5.4.7 利润分析页 `/app/today/profit`（规划中）

**要回答的问题**

- 最终留下多少利润
- 哪些对象真正贡献利润
- 哪些对象在吃掉利润

**对象分组建议**

1. `Top 利润商品`
2. `Top 亏损商品`
3. `Top 利润渠道`
4. `Top 利润流失订单`

## 6. 数据对象建议

建议不要继续让首页和详情页各自临时拼文案，而是逐步统一到结构化对象。

## 6.1 首页对象

建议补齐以下对象：

- `TodayHeader`
- `TodayMetricCard`
- `TodayRoiSummary`

首页对象之间的依赖关系建议固定为：

```ts
type TodayOverviewData = {
  header: TodayHeader;
  metricCards: TodayMetricCard[];
  roiSummary: TodayRoiSummary;
  filters: TodayFilterState;
};
```

说明：

- `header` 负责总判断
- `metricCards` 负责最小必要数字面板
- `roiSummary` 负责经营回报三层表达
- 首页首版不要混入详情报告表格结构

以下对象先不纳入本轮首页范围：

- `TodayFactorSummaryItem`
- `TodayInsightCard`
- `TodayTaskSummary`
- `TodayActionCard`

## 6.2 统一洞察对象

建议让 `Today / Health Monitor / Tasks / AI` 逐步消费同一套 `Insight` 对象。

最关键字段：

- `category`
- `roiLayer`
- `status`
- `confidence`
- `dataQuality`
- `summary`
- `metrics`
- `actions`
- `taskPriority`
- `drilldownTargets`

## 6.3 数据成熟度

所有 ROI 和利润相关结果必须显式标注：

- `realized`
- `estimated`
- `predicted`

以及：

- `high`
- `medium`
- `low`

避免把预测值伪装成已实现结果。

## 6.4 对象分组统一数据结构

为避免每个详情页单独拼结构，建议二级详情统一抽象为“页面总判断 + 对象组”。

```ts
type TodayDetailPageData = {
  pageKey: "revenue" | "roi" | "traffic" | "conversion" | "cost" | "profit";
  title: string;
  primaryQuestion: string;
  summary: string;
  pageStatus: "healthy" | "watch" | "risk";
  objectGroups: TodayObjectGroup[];
};

type TodayObjectGroup = {
  key: string;
  title: string;
  summary: string;
  objectType: "product" | "order" | "channel" | "page";
  priority: "P0" | "P1" | "P2";
  items: TodayObjectItem[];
};
```

其中 `TodayObjectItem` 建议采用联合结构：

```ts
type TodayObjectItem =
  | ProductObjectItem
  | OrderObjectItem
  | ChannelObjectItem
  | PageObjectItem;
```

建议统一对象卡片能力：

1. 主标题
2. 1-3 个核心数值
3. 一句问题判断
4. 一个推荐动作
5. 一个 drilldown 目标

这样原来的报告内容就不再独立存在，而是直接附着在对象卡片上。

## 6.5 对象卡片字段建议

### 6.5.1 ProductObjectItem

```ts
type ProductObjectItem = {
  objectType: "product";
  id: string | null;
  title: string;
  revenue: number;
  quantity: number;
  contributionProfit: number;
  contributionMarginPercent: number | null;
  issueSummary: string;
  recommendedAction: string;
  drilldownTarget?: string;
};
```

### 6.5.2 OrderObjectItem

```ts
type OrderObjectItem = {
  objectType: "order";
  id: string;
  title: string;
  revenue: number;
  refundLoss?: number;
  paymentStatus?: string;
  issueSummary: string;
  recommendedAction: string;
  drilldownTarget?: string;
};
```

### 6.5.3 ChannelObjectItem

```ts
type ChannelObjectItem = {
  objectType: "channel";
  id: string;
  title: string;
  revenue: number;
  contributionProfit: number;
  contributionMarginPercent: number | null;
  confidence: "high" | "medium" | "low";
  issueSummary: string;
  recommendedAction: string;
  drilldownTarget?: string;
};
```

### 6.5.4 PageObjectItem

```ts
type PageObjectItem = {
  objectType: "page";
  id: string;
  title: string;
  sessions: number;
  conversionRate: number | null;
  revenuePerSession: number | null;
  issueSummary: string;
  recommendedAction: string;
  drilldownTarget?: string;
};
```

## 6.6 页面总判断与对象组的 builder 建议

为降低页面层复杂度，建议在 server 层统一生成：

```ts
buildRevenueDetailPageData()
buildRoiDetailPageData()
buildTrafficDetailPageData()
buildConversionDetailPageData()
buildCostDetailPageData()
buildProfitDetailPageData()
```

每个 builder 只做两件事：

1. 生成 `page summary`
2. 生成 `objectGroups`

前端页面只负责渲染，不再自己拼装对象逻辑。

## 7. 分阶段实施建议

## Phase A：首页结构重排

目标：先把 `Today` 首页从“两段式模块页”改成“经营驾驶舱”。

范围：

- `app/routes/app.today._index.tsx`
- `app/server/operations/todayGeo.server.ts`
- `app/lib/todayMetricModules.ts`

交付：

1. 新的三大核心区块首页
2. 新的首页数据对象
3. 首页所有卡片具备明确跳转

## Phase B：详情页语义升级

目标：保留现有详情模板，但让各页语义更统一。

范围：

- `app/routes/page/TodayMetricDetailPage.tsx`
- `app/routes/app.today.orders.tsx`
- `app/routes/app.today.roi.tsx`
- `app/routes/app.today.traffic.tsx`
- `app/routes/app.today.conversion.tsx`

交付：

1. `orders` 升级为收入分析语义
2. `roi` 升级为投入回报分析语义
3. `traffic` / `conversion` 调整为 ROI 因子深钻页
4. 详情页改为“页面总判断 + 对象分组”结构

## Phase C：经营分析页补齐

目标：把 PRD 中缺失的成本和利润页补起来。

建议新增：

- 成本分析
- 利润分析

建议优先承接的数据：

- 商品成本
- 广告成本
- 支付手续费
- 折扣成本
- 退款损耗
- 履约/物流成本

## Phase D：统一洞察与任务闭环

目标：把 Today 的摘要、Health Monitor 的判断、Tasks 的动作承接成一套统一数据链路。

交付：

1. `Insight` 结构统一
2. `TodayActionCard` 和任务联动
3. AI 预填上下文改为读取统一洞察对象

## 8. 详细 Todo

## P0

- [ ] 把 `Today` 首页改为三大核心区块结构
- [ ] 新增 `TodayHeader` 数据对象
- [ ] 新增 `TodayRoiSummary` 数据对象
- [ ] 明确头部状态判断规则与 7 天可比基准口径
- [ ] 明确 6 张核心指标卡的计算公式与 source 标记
- [ ] 明确 ROI 三层摘要的加载策略：首屏同步 + 异步补齐
- [ ] 对无法计算的回收期 / 长期 ROI 增加 `unavailable` 展示规则
- [ ] 首页文案统一改成经营语言
- [ ] 首页摘要卡全部补齐跳转目标
- [ ] 首页不再展开长报告正文

## P1

- [ ] 统一 `TodayMetricDetailPage` 的报告标题与文案语气
- [ ] 将 `orders` 页升级为收入分析页
- [ ] 将 `roi` 页升级为投入回报分析页
- [ ] 给 `roi` 页显式补上短期 / 回收期 / 长期 ROI 分层
- [ ] 给 `roi` 页补上 `dataQuality` 和 `confidence`
- [ ] 将 `traffic` / `conversion` 明确为 ROI 因子深钻页
- [ ] 将详情页结构改为“顶部总判断 + 对象分组区”
- [ ] 为收入分析页补齐商品对象组与订单对象组
- [ ] 为投入回报分析页补齐渠道对象组
- [ ] 为流量分析页补齐来源对象组与页面对象组
- [ ] 为转化分析页补齐页面对象组与支付失败订单对象组

## P2

- [ ] 新增成本分析页
- [ ] 新增利润分析页
- [ ] 补齐利润瀑布模型
- [ ] 补齐三层利润模型：毛利润 / 贡献利润 / 净利润
- [ ] 补齐产品利润分析
- [ ] 补齐成本结构拆解
- [ ] 为成本分析页补齐高成本对象组
- [ ] 为利润分析页补齐高利润 / 亏损对象组

## P3

- [ ] 引入统一 `Insight` 数据结构
- [ ] 让 Today / Health Monitor / Tasks / AI 共享洞察对象
- [ ] 将任务推荐改为直接消费 `actions`
- [ ] 统一 AI 深钻上下文来源

## 9. 验收标准

本轮调整完成后，用户进入 `Today` 首页应能快速回答：

1. 现在是否赚钱
2. 当前利润为什么变化
3. 短期 / 回收期 / 长期 ROI 当前分别处于什么状态

进入二级详情页后，应能继续回答：

1. 收入从哪里来
2. 成本花在哪里
3. 卖出去的钱最后留下多少
4. 哪些投入值得继续

## 10. 下一步建议

建议下一步直接从 `Phase A / P0` 开始，也就是只改：

- `app/routes/app.today._index.tsx`
- `app/server/operations/todayGeo.server.ts`
- `app/lib/todayMetricModules.ts`

先把首页驾驶舱搭起来，再继续补成本、利润和三层 ROI 的正式数据。

## 11. 实施清单（2026-08-22）

这一节用于把当前讨论过的 A/B/C 报告实现方案固定成后续开发与验收清单。默认按“先做骨架可运行，再逐步替换旧详情页”的策略推进。

### 11.1 第一阶段范围

本阶段只做以下四件事：

1. `Today` 首页升级为正式 `A 报告`
2. 新做三个正式 `B 报告`
   - `revenue`
   - `profit`
   - `roi`
3. `C 报告` 统一改为弹窗
4. AI 上下文支持页级与对象级两种钻取

以下内容暂不纳入第一阶段：

- `traffic`
- `conversion`
- `cost / margin / aov` 独立路由

说明：

- 上述指标先通过 `focus` 参数挂接到 `revenue / profit` 页中
- 旧的 `orders / traffic / conversion` 路由先保留，作为兼容页继续存在
- 第一阶段已实现 `orders / aov / cost / margin` 的语义化变体，不再只是同一页面换标题
- 第一阶段已在 `revenue / profit` 页补上显式焦点切换条，支持页内横向切换
- 第一阶段已在 `roi` 页补上 `总览 / 渠道 / 损耗 / 价值层` 焦点切换
- 第一阶段已补主链路容错：`shopCostConfig` 缺失回退默认配置，`Storefront sessions` 查询失败不再拖垮首页与报告页
- 第一阶段已在正式 `today` 页面补上 `Top 对象组 -> 查看全部 -> 单对象详情` 的三级链路
- 当前已开始结构收敛：首页从 6 个并列指标入口收拢为 `增长质量 / 利润结果 / 回报效率` 3 张一级卡，并将 `ROI` 页主 focus 收窄为 `总览 / 渠道 / 损耗`
- 首页原 `ROI 三层摘要` 已降级为 `长期质量补充`，价值层从 `ROI` 主 focus 退出，改为回报效率页底部的补充区

### 11.2 第一阶段路由规划

第一阶段目标路由：

- `/app/today`
- `/app/today/revenue`
- `/app/today/profit`
- `/app/today/roi`

首页指标卡映射：

- `收入` -> `/app/today/revenue`
- `成本` -> `/app/today/profit?focus=cost`
- `利润` -> `/app/today/profit?focus=profit`
- `利润率` -> `/app/today/profit?focus=margin`
- `订单数` -> `/app/today/revenue?focus=orders`
- `客单价` -> `/app/today/revenue?focus=aov`
- `ROI` -> `/app/today/roi`

### 11.3 第一阶段核心类型

需要落地的正式数据契约：

- `TodayOverviewReport`
- `TodayHeader`
- `TodayMetricCard`
- `TodayReasonCard`
- `TodayRoiSummary`
- `TodayDecisionReport`
- `TodayBreakdownBlock`
- `TodayEvidenceGroup`
- `TodayObjectCard`
- `TodayObjectReport`

约束：

1. `B 报告` 与 `C 报告` 必须共享同一份对象数据
2. 不允许 B 页展示一套对象，弹窗再临时拼另一套内容
3. AI 页级上下文与对象级上下文必须都从正式 report 数据读取

### 11.4 第一阶段页面结构

#### A 报告：首页

固定为四块：

1. `经营状态头部`
2. `6 张经营指标卡`
3. `为什么会这样`
4. `ROI 三层摘要`

#### B 报告：revenue / profit / roi

固定为以下骨架：

1. 顶部总判断
2. 摘要指标
3. `指标拆解 + 对象证据` 双栏
4. 补充对象组
5. 建议动作
6. AI 深钻入口

#### C 报告：对象弹窗

固定为：

1. 标题 / 副标题
2. headline metrics
3. 对象结论
4. 分析要点
5. 建议动作
6. 和 AI 聊聊

### 11.5 第一阶段对象落点

#### Revenue

- 拆解：
  - 收入拆到商品
  - 收入拆到订单
- 对象组：
  - `top_profitable_products`
  - `low_quality_growth_products`
  - `high_value_orders`
  - `high_refund_orders`

#### Profit

- 拆解：
  - 利润拆到商品
  - 利润拆到订单
- 对象组：
  - `top_profit_products`
  - `loss_products`
  - `healthy_orders`
  - `abnormal_loss_orders`

#### ROI

- 拆解：
  - ROI 拆到渠道
  - ROI 拆到损耗对象
- 对象组：
  - `healthy_channels`
  - `weak_channels`
  - `refund_loss_orders`

### 11.6 第一阶段文件清单

建议新增：

- `app/routes/app.today.revenue.tsx`
- `app/routes/app.today.profit.tsx`
- `app/routes/page/TodayMetricReportPage.tsx`
- `app/routes/component/today/TodayObjectReportDialog.tsx`
- `app/lib/todayReportTypes.ts`
- `app/lib/todayReportAi.ts`

建议优先改造：

- `app/routes/app.today._index.tsx`
- `app/routes/app.today.roi.tsx`
- `app/server/operations/todayGeo.server.ts`

第一阶段暂不删除：

- `app/lib/todayMetricModules.ts`
- `app/routes/page/TodayMetricDetailPage.tsx`

### 11.7 第一阶段开发顺序

按以下顺序推进：

1. 定义 `today report` 新类型
2. 新增首页 A 报告 builder
3. 首页切到新数据契约
4. 新增 `revenue` 报告 builder 与页面
5. 接入 `C 报告` 弹窗
6. 接入对象级 AI context
7. 新增 `profit` 报告 builder 与页面
8. 把 `roi` 页升级到新报告结构

### 11.8 第一阶段执行 Todo

#### P0 - 文档与类型

- [x] 新增 `today report` 正式类型文件
- [x] 将第一阶段路由与页面边界写入文档
- [x] 为页级 / 对象级 AI context 定义独立 builder

#### P0 - 首页 A 报告

- [x] 首页 loader 输出 `TodayOverviewReport`
- [x] 新增 `TodayHeader`
- [x] 新增 `TodayMetricCard[]`
- [x] 新增 `TodayReasonCard[]`
- [x] 新增 `TodayRoiSummary`
- [x] 首页 6 张指标卡接入正式跳转

#### P0 - B/C 报告

- [x] 新增 `revenue` 页
- [x] 新增 `profit` 页
- [x] 升级 `roi` 页到新报告结构
- [x] 新增 `TodayObjectReportDialog`
- [x] 所有对象组通过弹窗查看 `C 报告`

#### P1 - 数据与兼容

- [x] 复用订单、退款、行项目与 SKU 成本数据生成对象组
- [x] `orders / traffic / conversion` 旧路由继续保留
- [x] 首页不再链接到旧 `orders` 详情页

### 11.9 第一阶段验收检查

#### 首页检查

- [ ] 打开首页后，首屏能直接看到赚钱状态
- [ ] 六张经营指标卡全部可跳转
- [ ] ROI 三层摘要中，缺数据的层级明确显示 `待接入`
- [ ] 首页不再以长报告结构展开正文

#### B 报告检查

- [ ] 每个 B 页都包含“拆解 + 对象证据”双栏结构
- [ ] B 页底部不再重复堆单独的 Top 对象模块
- [ ] 窄屏下双栏会自动堆叠

#### C 报告检查

- [ ] 可从对象证据卡打开弹窗
- [ ] 支持遮罩点击关闭
- [ ] 支持右上角关闭
- [ ] 支持 `Esc` 关闭

#### AI 检查

- [ ] B 页可带整页上下文和 AI 聊
- [ ] C 报告可带对象上下文和 AI 聊
- [ ] AI 上下文来自正式 report 数据，而不是临时文案拼接
