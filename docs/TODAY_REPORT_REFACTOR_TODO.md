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
   - 当前结构：`国家筛选 + 经营状态头部 + 核心经营指标 + 为什么会这样 + ROI 三层摘要`

2. 统一详情模板
   - 文件：`app/routes/page/TodayMetricReportPage.tsx`
   - 当前结构：`页面总判断 + 摘要指标 + 指标拆解与对象证据 + 建议动作 + AI 入口`

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

本轮 `Today` 首页建议先固定为以下四个核心区块：

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

#### 4.1.2.2 首页 6 张卡与经营链路的关系

这里需要明确一个边界：

首页当前保留 `收入 / 成本 / 利润 / 利润率 / 订单数 / 客单价` 6 张卡，目的主要是为了满足首屏经营判断与进入 `B 报告` 的效率，**并不等于它们是最终唯一正确的一级经营分类**。

换句话说：

1. 首页 6 张卡当前是 `A 报告` 的经营结果入口
2. 它们更接近“用户最先会问的经营问题”
3. 它们背后仍然可以继续用更底层的单位模型和链路关系来组织数据

因此，后续若引入：

- `流量`
- `转化`
- `成交 / 利润`
- `运营履约`

这类“链路节点”视角，也不应直接理解为要立刻推翻首页 6 张卡，而更适合作为：

- 二级页的补充解释框架
- 指标拆解时的底层组织方式
- 后续页面演进时的结构参考

当前阶段首页仍以 6 张卡为准，原因是：

1. 更贴近用户当前心智中的经营结果语言
2. 与现有 `revenue / cost / profit / roi` 等页面语义更容易衔接
3. 可以先稳定首页判断，再逐步把更底层的链路模型吸收到详情页与对象页中

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

#### 4.1.3.1 ROI 三层摘要与长期价值的边界

这里必须补充一个边界说明，避免后续把两个问题混在一起：

1. `ROI 三层摘要`
   - 讨论的是“经营投入回报”
   - 重点是短期回报、回收期、长期 ROI 这三层是否可读、是否健康

2. `长期价值`
   - 更偏客户经营与时间维度
   - 重点是复购、老客贡献、高价值客户占比等长期信号

两者相关，但不是同一个概念：

- `长期价值` 可以作为 `长期 ROI` 的重要证据来源
- 但 `长期价值` 不能直接替代 `长期 ROI`
- 在缺少 `CAC`、cohort 回收窗口或长期回收口径时，不能把“长期价值健康”直接写成“长期 ROI 健康”

因此首页应遵守：

1. `ROI 三层摘要` 继续保留为投入回报表达
2. `复购 / 老客贡献 / 高价值客户占比` 这些指标可以作为长期层的辅助解释
3. 若长期 ROI 不可计算，必须明确展示 `unavailable / 待接入`，而不是拿长期价值信号直接补位成 ROI 数字

#### 4.1.3.2 ROI 三层摘要的阶段性口径约束

考虑到当前数据成熟度不一致，首页三层 ROI 在展示上需要严格区分“已经成立的口径”和“仍在补数据的口径”：

1. `短期 ROI`
   - 当前已有明确估算口径
   - 可以作为首页稳定展示项

2. `回收期 ROI`
   - 只有在具备 `CAC + cohort 回收窗口` 时才成立
   - 否则只能展示缺口说明

3. `长期 ROI`
   - 只有在具备长期价值与获客成本映射关系时才成立
   - 若当前仅有复购或客户价值信号，仍应显示为“长期价值状态”或 `待接入`，不能直接伪装成 ROI 倍数

这条约束的意义是：

1. 保留首页对投入回报问题的完整表达
2. 同时避免把“有辅助信号”误写成“已有正式 ROI 结论”
3. 让后续 `长期价值` 相关数据能够作为补强，而不是造成概念混淆

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

首期直接使用 `loadTodayOverviewReportData` 已有链路中的订单聚合结果：

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
  -> loadTodayOverviewReportData()
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
loadTodayOverviewReportData()
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
loadTodayOverviewReportData()
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

#### 4.2.3.4 指标拆解背后的单位模型说明

为避免把上面的 `收入 / 成本 / 利润 / 利润率 / 订单数 / 客单价 / ROI` 理解成彼此孤立的七套体系，这里补充一层底层说明：

这些指标仍然是当前 `B 报告` 最适合直接面向用户的经营问题入口，但在数据组织上，应逐步补上更稳定的 **单位模型 / 链路视角**。

也就是说：

1. 用户进入详情页时，仍然可以先从“收入、利润、ROI”这类经营结果问题进入
2. 但 server builder 和对象分组不应把这些指标当成互相完全独立的孤岛
3. 后续详情页拆解应尽量回答：这个指标背后对应的是哪一段经营链路、主要分析单位是什么、优先落到哪类对象

建议补充采用以下底层映射：

##### 流量层

- 主要单位：`session / visit`
- 优先维度：`渠道`、`页面`、`地区`
- 更适合作为这些指标的底层解释背景：
  - `订单数`
  - `客单价`（来源结构部分）
  - `ROI`（渠道回报部分）

##### 转化层

- 主要单位：`session -> order`
- 优先维度：`渠道承接`、`商品承接`、`支付链路`
- 更适合作为这些指标的底层解释背景：
  - `订单数`
  - `客单价`（购物篮结构之外的承接部分）
  - `收入`

##### 成交 / 利润层

- 主要单位：`order / order_line`
- 优先维度：`商品`、`订单`
- 更适合作为这些指标的底层解释背景：
  - `收入`
  - `成本`
  - `利润`
  - `利润率`
  - `客单价`

说明：

- `取消订单`
- `退款`
- `退货`
- `售后损耗`

这些都应优先归入 `成交 / 利润` 层解释，而不是在首页或详情页里散落成独立主题。

##### 运营履约层

- 主要单位：`shipment / fulfillment / risk_event`
- 优先维度：`订单`、`物流链路`、`风险类型`
- 更适合作为这些指标的补充解释背景：
  - `成本`
  - `利润`
  - `利润率`

说明：

- 发货周期
- 物流周期
- 履约成本
- 风控 / 欺诈异常

虽然当前未作为首页 6 张卡单独出现，但在详情页中应逐步被吸收到成本、利润与异常对象的解释链路中。

##### 这一层说明的使用方式

这套单位模型当前用于：

1. 约束 server 端 builder 如何组织数据与对象组
2. 指导详情页未来从“指标页”逐步演进到“指标页 + 维度页”混合结构
3. 帮助后续统一对象页壳子时，明确每类对象主要影响经营链路的哪一段

这套单位模型当前 **不直接替代** 本节已有的指标拆解清单。

也就是说，当前阶段仍然可以保持：

- 收入分析页
- 成本分析页
- 利润分析页
- 利润率分析页
- 订单分析页
- 客单价分析页
- ROI 分析页

但这些页面在后续做 server builder、对象分组和对象页模板时，应逐步共享上面的底层链路模型，而不是各自长成完全割裂的七套逻辑。

### 4.2.4 对象级 Top 排行建议

这类数据建议纳入正式能力，但不放进首页首屏核心区块，而是放进二级详情页的 `关键对象` 区块。

推荐纳入的四类对象：

1. `收入 / 利润贡献商品`
2. `利润 / 成本侵蚀商品`
3. `高回报渠道`
4. `低回报 / 待复核渠道`

原因：

- 它们对“为什么赚钱 / 为什么亏钱”非常有解释力
- 但信息密度高，不适合抢占首页首屏判断
- 更适合作为收入分析、利润分析、投入回报分析页里的对象级证据

说明：

- 这里给出的名称更偏对象能力层的抽象描述
- 真正落到具体页面时，应优先遵守 `5.4.0.1 对象复用与命名原则`
- 也就是说，最终展示名应由“当前页面要回答什么问题”来决定，而不是在所有页面中强行复用同一组标题

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

- 收入页可命名为 `Top 收入贡献商品`
- 利润页可命名为 `Top 利润贡献商品`
- 若只做统一对象能力层排序，仍可按 `contributionProfit desc`

- 收入页可命名为 `Top 低质量增长商品`
- 利润页可命名为 `Top 利润侵蚀商品`
- 成本页可命名为 `Top 成本侵蚀商品`
- 若只做统一对象能力层排序，仍可按 `contributionProfit asc`
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

- ROI 页可命名为 `Top 高回报渠道`
- 若只做统一对象能力层排序，可按 `contributionProfit desc`

- ROI 页可命名为 `Top 低回报渠道`
- 成本 / 利润页如复用渠道对象，也可分别命名为：
  - `Top 高成本渠道`
  - `Top 利润贡献渠道`
- 若只做统一对象能力层排序，可按 `contributionMarginPercent asc`
- 或 `contributionProfit asc`

但此时不要把它写成严格的 `Top 有效广告 ROI / Top 亏损广告 ROI`，因为：

- 当前 `investmentCost` 仍可能为 `null`
- 未接入广告平台花费时，`businessRoi` 不成立

也就是说：

- 现在可以先做“渠道回报”视角下的对象组
- 等广告花费接入后，再决定是否升级为更细粒度的广告对象组
- 即使未来引入 `Campaign / Ad Set / Creative`，命名也仍应优先反映页面问题，例如：
  - `高回报 Campaign`
  - `低回报 Campaign`
  - `待复核 Campaign`

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
- `Top 高流量低承接页面`
- `Top 加购高但到达结账低的页面`
- `Top 到达结账高但支付完成低的页面`

说明：

- 在流量页中，更适合强调“承接不足”或“质量偏低”
- 在转化页中，更适合强调“掉点发生在哪一段”
- 因此页面对象的最终命名也应跟随所在页面的问题变化，而不是全局只保留一种固定标题

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

- 第一阶段已在 `app/server/operations/todayGeo.server.ts` 接入页面级 web pixel 信号，当前页面对象可读取 `page_viewed / product_added_to_cart / checkout_started`
- 转化页已进一步补到 `payment_info_submitted / checkout_completed`，再与 `landingSite` 订单结果拼接，形成“页面前段漏斗 + 成交后风险”的混合口径
- 当前限制仍然存在：页面级像素事件只在 `全部地区` 下可用，切到单国家时会明确降级回 `landingSite` 订单代理，而不是伪装成 0
- 页面级对象仍是流量与转化做决策时非常重要的一层，后续继续优先补齐国家拆分与更稳定的 page-level session 口径

#### 是否进入首页

本轮建议：

- 不进入首页首屏核心区块
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

这里同样需要区分三层概念：

1. `当前正式承载路由`
   - 指当前已经稳定存在、并在页面规格里有明确语义的路由

2. `过渡阶段承载路由`
   - 指为了兼容历史实现、减少一次性改动而临时承载新语义的路由

3. `未来可演进路由`
   - 指在数据模型和页面语义都稳定后，可能升级为更正式命名的路由

因此，本节不应被理解为“只要新增了 route file，就自动代表信息架构已经定稿”。

### 第一阶段

先不急着删除旧页，采用“旧页承载、新语义命名”的兼容方式：

- `orders` 逐步升级为“收入分析”
- `roi` 逐步升级为“投入回报分析”
- `traffic` / `conversion` 与 ROI 页形成联动，但继续保留独立经营问题页语义

补充说明：

1. `orders`
   - 当前仍是正式存在的承载页
   - 在页面语义上，可继续朝 `收入分析` 演进
   - 但它不自动等于未来最终一定要保留 `orders` 这个命名

2. `revenue`
   - 可以作为更贴近经营语言的未来承载页
   - 但在未完成整体迁移前，不应把 `orders` 和 `revenue` 同时都当成“最终正式语义”去写

3. `roi`
   - 当前继续作为投入回报问题的正式承载页
   - 其内部可继续吸收渠道回报、价值层、置信度等更细解释
   - 但在主文档里仍然优先保持“投入回报分析页”这一稳定称呼

4. `traffic / conversion`
   - 当前仍是正式页面
   - “与 ROI 页形成联动”更适合理解为一种阶段性承载关系
   - 不是说它们在信息架构上只剩下 ROI 附属页
   - 后续若页面成熟，也仍可以继续作为独立经营问题页存在

### 第二阶段

待数据模型稳定后，再把首页一级经营入口调整为：

- 经营总览
- 收入分析
- 成本分析
- 利润分析
- 投入回报分析

补充说明：

- 第二阶段描述的是“更经营语言化”的正式入口方向
- 它不直接否定后续可能引入的单位模型或维度页能力
- 更稳的做法是：
  - 首页入口保持经营问题语言
  - 页面内部的数据组织逐步吸收维度页和链路模型
  - 而不是要求路由命名先行彻底切换

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

### 5.4.0 当前承载方式与后续演进方向

这里先明确一个约束，避免后续阅读时把“当前页面承载方式”和“未来信息架构方向”混成一件事：

1. 当前阶段
   - 详情页仍主要按 `收入 / ROI / 流量 / 转化 / 成本 / 利润` 这类经营问题承载
   - 这样做是为了延续首页卡片与当前路由语义

2. 后续演进
   - 详情页可以逐步吸收“单位模型 / 维度页”的组织方式
   - 但应优先体现在：
     - server builder 的数据组织
     - 指标拆解块与对象组的关系
     - 对象页的统一模板
   - 而不是立刻把所有现有页面整体改名为另一套目录体系

3. 对象页复用
   - 同一类对象页后续可以被多个经营问题复用
   - 差别主要体现在当前上下文视角，而不是每个来源页都长一套独立对象壳子

换句话说：

- 当前 `5.4` 仍描述“按经营问题承载的详情页”
- 但每个页面后面都会补充“维度演进方向”，用于告诉后续开发如何逐步吸收补充讨论稿中的结构观点

### 5.4.0.1 对象复用与命名原则

这一节还需要补一个统一约束，避免后续把“对象出现重复”误认为“信息结构有问题”。

原则如下：

1. 同一类对象可以出现在多个页面
   - 商品可以同时出现在收入、成本、利润页
   - 订单可以同时出现在收入、转化、成本、利润页
   - 渠道可以同时出现在流量、ROI、长期价值相关页
   - 页面可以同时出现在流量页和转化页

2. 页面不同，对象承担的问题不同
   - 收入页里的商品，重点回答“谁带来收入、谁制造假增长”
   - 成本页里的商品，重点回答“谁在制造成本和折扣损耗”
   - 利润页里的商品，重点回答“谁真正留下利润、谁在侵蚀利润”

3. 对象组命名应优先反映当前页面要回答的问题，而不是只描述对象类别

例如：

- 用 `高回报渠道 / 低回报渠道`
  而不是统一都叫 `Top 渠道`

- 用 `利润贡献商品 / 利润侵蚀商品`
  而不是所有页面都沿用同一套“赚钱 / 亏钱”标题

4. 如果同一对象会在多个页面重复出现，字段也应按页面问题做裁剪

例如：

- 流量页看渠道：优先看 `sessions / revenue per session / 质量信号`
- ROI 页看渠道：优先看 `收入 / 贡献利润 / ROI / 置信度`

因此，后续对象组设计要追求的是：

- `同对象，不同问题视角`

而不是：

- `同对象，只允许出现在一个页面`

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

**后续演进方向**

- 首页继续维持 `A 报告` 的聚合职责
- 若后续引入“链路节点”视角，也应优先作为解释框架或入口分组，而不是直接替换首页已明确的经营结果卡结构

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

1. `Top 收入贡献商品`
2. `Top 低质量增长商品`
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

补充说明：

- 本页中出现商品对象，不代表它天然属于“利润页”
- 它在这里的职责是解释收入来源和增长结构
- 如果同一商品后续出现在利润页，应切换成“利润贡献 / 利润侵蚀”的解读方式

**用户最终动作**

- 继续推高利润商品
- 降低低利润商品折扣
- 排查高退款订单
- 识别“假增长”来源

**后续演进方向**

- 当前继续作为“收入分析页”承载
- 后续可逐步吸收：
  - `商品` 作为主维度
  - `订单` 作为辅助维度
  - `转化承接` 作为补充解释层
- 但不建议直接把本页整体改写成抽象的“成交 / 利润总入口”，除非首页入口和路由语义一起收敛

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

1. `Top 高回报渠道`
2. `Top 低回报渠道`
3. `高价值客户占比高的渠道`
4. `低置信度待复核渠道`

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

**后续演进方向**

- 当前继续承载“投入回报分析”
- 后续可逐步拆成：
  - `渠道回报`
  - `价值层 / 置信度补充`
- 但在未明确重写首页与 ROI 三层摘要之前，不直接取消本页当前语义
- 同时应注意，本页的“价值层”更适合充当回报问题的补充解释，而不是直接替代长期价值或客户经营的独立分析页

补充说明：

- 本页中的渠道对象，重点回答“值不值得继续投”
- 如果同一渠道后续也出现在流量页，它回答的问题应改成“带来的流量质量如何”
- 两页可以复用同一个渠道对象页壳子，但页内对象组的判断与字段不应完全相同

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
2. `Top 高流量低质量来源`
3. `Top 承接较稳页面`
4. `Top 承接偏弱页面`

**每个对象组内部建议结构**

- 来源/页面名
- 会话数
- 加购率
- 订单转化代理
- 收入或利润结果
- 动作：调整入口 / 优化页面 / 降低低效流量

**用户最终动作**

- 保留高质量来源
- 降低无效流量
- 优先修高流量低承接页面

**后续演进方向**

- 当前继续作为“流量分析页”
- 后续更适合作为：
  - `渠道`
  - `页面`
  - `地区`
 这些维度页的承载入口
- 页面对象应优先在这里成熟，再考虑是否拆成更细的独立对象体系
- 即使后续与 ROI、转化分析存在联动，本页仍然应保留为独立经营问题页，而不是退化成单纯的附属下钻页

补充说明：

- 来源对象在这里回答“有没有量、量的质量如何”
- 页面对象在这里回答“页面是否承接住了流量”
- 当前正式实现里，页面对象已接入 `page_viewed / product_added_to_cart / checkout_started` 三段页面事件，再用 `landingSite` 订单结果补看后段承接
- 若切到单地区，页面事件会因为缺少稳定国家维度而降级到订单代理口径，页面上需要显式说明
- 即使同一页面对象后续出现在转化页，它在那里回答的也应是“掉点发生在哪一段”，而不是重复流量页的判断

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

1. `Top 承接较稳页面`
2. `Top 支付风险页面`
3. `Top 支付失败订单`

**每个对象组内部建议结构**

- 页面/订单标识
- 会话或订单量
- 加购率
- 结账触发率
- 完成支付率
- 问题判断
- 动作：优化页面 / 排查支付 / 处理异常订单

**用户最终动作**

- 先修高流量掉点页面
- 跟进支付失败订单
- 验证是否存在运费、支付、信任信息问题

**后续演进方向**

- 当前继续作为“转化分析页”
- 后续更适合作为：
  - `渠道承接`
  - `商品承接`
  - `支付链路`
 这些维度页的聚合承载层
- 若后续对象页统一，支付失败订单与页面对象应共享同一套对象页模板，而不是各自再长一套页面壳子
- 本页与 ROI、收入页都有关联，但依然应保持“独立解释承接问题”的页面职责，而不是只作为其他页面的补充尾页

补充说明：

- 页面对象在这里重点解释“掉点”
- 订单对象在这里重点解释“支付或结账异常样本”
- 当前正式实现里，页面对象已接入 `page_viewed / product_added_to_cart / checkout_started / payment_info_submitted / checkout_completed` 五段页面事件，再用 `landingSite` 订单结果补看成交后风险
- 支付失败订单仍保留 `financialStatus` 代理口径，用来补齐 pixel 之外的成交后异常样本
- 即使订单对象也可能出现在收入页或利润页，本页仍只聚焦承接链路，不承担完整经营结果解释

### 5.4.6 成本分析页 `/app/today/cost`（第一阶段已落地，先复用 `profit + cost focus` builder）

**要回答的问题**

- 钱主要花在哪里
- 哪些成本还合理，哪些已经开始侵蚀利润
- 哪些对象在制造浪费成本

**对象分组建议**

1. `Top 成本商品`
2. `Top 高折扣损耗商品`
3. `Top 高退款损耗订单`
4. `Top 高成本渠道`

补充说明：

- 第一阶段当前已经补上独立 `/app/today/cost` 路由，但底层仍先复用 `profit + cost focus` 的 builder，避免成本问题页继续缺位
- 现阶段对象证据主要落在 `Top 亏损商品` 与 `Top 异常损耗订单` 这两类最直接制造成本压力的对象上
- 商品在本页不是回答“卖得好不好”，而是回答“哪些商品在制造成本压力”
- 订单在本页不是解释成交异常，而是解释退款、售后、履约等成本损耗
- 渠道在本页也不是看流量质量，而是看当前是否带来了不成比例的获客或补贴成本

**后续演进方向**

- 当前仍建议作为独立经营问题页规划
- 但 builder 层应逐步吸收：
  - `成交 / 利润` 层
  - `运营履约` 层
 这两类解释来源
- 也就是说，本页是“成本问题入口”，不代表成本在数据上自成孤岛
- 同时必须明确区分：
  - `已实现成本`
  - `估算成本`
  - `待补齐成本`
  避免页面把不同成熟度口径混成一个单一数字

### 5.4.7 利润分析页 `/app/today/profit`（第一阶段已落地）

**要回答的问题**

- 最终留下多少利润
- 哪些对象真正贡献利润
- 哪些对象在吃掉利润

**对象分组建议**

1. `Top 高利润商品`
2. `Top 亏损商品`
3. `Top 健康订单`
4. `Top 异常损耗订单`

**后续演进方向**

- 当前已作为独立经营问题页落地
- 后续应逐步吸收：
  - `商品`
  - `订单`
  - `售后损耗`
  - `履约异常`
 这些解释来源
- 利润页依然面向用户保持清晰的问题入口，但内部组织可以逐步对齐“成交 / 利润”这一更稳定的底层链路
- 若后续补齐更完整的成本口径，应进一步区分：
  - 毛利润
  - 贡献利润
  - 净利润
  避免用户在一个“利润页”里读到多层口径却不知道差异

补充说明：

- 商品在本页的角色是“留下利润”或“侵蚀利润”
- 订单在本页的角色是“利润流失样本”
- 第一阶段正式实现里，利润页已经先接入商品与订单对象；渠道利润对象仍留给后续更完整的 ROI / 利润模型继续补
- 这些对象都可能在其他页面出现，但只有在本页才应被聚焦成“利润问题”的解释对象

## 6. 数据对象建议

建议不要继续让首页和详情页各自临时拼文案，而是逐步统一到结构化对象。

## 6.1 首页对象

建议补齐以下对象：

- `TodayHeader`
- `TodayMetricCard`
- `TodayRoiSummary`

首页对象之间的依赖关系建议固定为：

```ts
type TodayOverviewReportData = {
  filters: TodayFilterState;
  report: TodayOverviewReport;
};
```

说明：

- `report.header` 负责总判断
- `report.metricCards` 负责最小必要数字面板
- `report.roiSummary` 负责经营回报三层表达
- 首页首版不要混入详情报告表格结构，首页 loader 只返回总览报告对象

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

### 6.4.1 对象卡片与对象页的职责边界

这里要明确区分两层：

1. `对象卡片`
   - 出现在 `B 报告` 中
   - 用于快速判断这个对象值不值得继续看

2. `对象页 / C 报告`
   - 作为三级终点页或对象弹窗
   - 用于承接完整对象结论、链路表现、异常与动作

因此：

- `TodayObjectItem` 负责“列表中的对象摘要”
- `C 报告` 负责“对象完整解释”

不要把对象卡片堆得像一页小报告，也不要让对象页退化成只比卡片多两行字。

### 6.4.2 对象页统一模板约束

后续无论对象来自：

- 收入分析页
- ROI 分析页
- 流量分析页
- 转化分析页

对象页都应尽量复用同一套模板：

1. `对象结论`
2. `关键指标`
3. `链路表现`
4. `异常 / 机会`
5. `动作建议`

说明：

- 这套模板是对象页层面的统一约束
- 它不强制要求二级页中的对象卡片就完全展开成同样结构
- 二级页对象卡片可以保持摘要化，但应能自然下钻到这套完整模板

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

### 6.6.1 builder 后续应补充的上下文字段

如果后续继续收敛对象页与维度页，建议 builder 逐步补齐以下上下文字段，而不是让前端依赖页面来源去猜：

```ts
type TodayObjectContext = {
  sourcePageKey: string;
  sourceQuestion: string;
  primaryDimension?: string;
  chainStage?: "traffic" | "conversion" | "economics" | "operations";
};
```

作用：

1. 同一个对象可以被多个页面复用
2. 但对象页仍能知道“当前是从哪个经营问题进来的”
3. AI 上下文、对象页标题、动作建议也能基于这个上下文做轻微差异化

### 6.6.2 对象页 builder 建议

在已有页面级 builder 之外，后续建议补一层对象级 builder：

```ts
buildProductObjectReport()
buildOrderObjectReport()
buildChannelObjectReport()
buildPageObjectReport()
```

这层的目标不是再开新路由，而是统一：

1. `C 报告` 弹窗内容
2. 对象页完整数据
3. 对象级 AI 上下文

这样可以避免：

- 二级页一套对象摘要
- 弹窗临时再拼一套对象结论
- AI 再重新拼第三套上下文

后续应尽量让三者共享同一份对象级 builder 结果。

## 7. 分阶段实施建议

## Phase A：首页结构重排

目标：先把 `Today` 首页从“两段式模块页”改成“经营驾驶舱”。

范围：

- `app/routes/app.today._index.tsx`
- `app/server/operations/todayGeo.server.ts`

交付：

1. 新的首页 A 报告骨架
2. 新的首页数据对象
3. 首页所有卡片具备明确跳转

## Phase B：详情页语义升级

目标：保留现有详情模板，但让各页语义更统一。

范围：

- `app/routes/page/TodayMetricReportPage.tsx`
- `app/routes/app.today.orders.tsx`
- `app/routes/app.today.roi.tsx`
- `app/routes/app.today.traffic.tsx`
- `app/routes/app.today.conversion.tsx`

交付：

1. `orders` 升级为收入分析语义
2. `roi` 升级为投入回报分析语义
3. `traffic` / `conversion` 与 ROI 页形成联动，但继续保留独立经营问题页语义
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

- [x] 把 `Today` 首页改为正式 `A 报告` 结构
- [x] 新增 `TodayHeader` 数据对象
- [x] 新增 `TodayRoiSummary` 数据对象
- [x] 明确头部状态判断规则与 7 天可比基准口径
- [x] 明确 6 张核心指标卡的计算公式与 source 标记
- [ ] 明确 ROI 三层摘要的加载策略：首屏同步 + 异步补齐
- [x] 对无法计算的回收期 / 长期 ROI 增加 `unavailable` 展示规则
- [x] 首页文案统一改成经营语言
- [x] 首页摘要卡全部补齐跳转目标
- [x] 首页不再展开长报告正文

## P1

- [ ] 统一 `TodayMetricReportPage` 的报告标题与文案语气
- [x] 将 `orders` 页升级为收入分析页
- [x] 将 `roi` 页升级为投入回报分析页
- [x] 给 `roi` 页显式补上短期 / 回收期 / 长期 ROI 分层
- [ ] 给 `roi` 页补上 `dataQuality` 和 `confidence`
- [x] 明确 `traffic` / `conversion` 与 ROI 页的联动关系，同时保持独立问题页语义
- [x] 将详情页结构改为“顶部总判断 + 对象分组区”
- [x] 为收入分析页补齐商品对象组与订单对象组
- [x] 为投入回报分析页补齐渠道对象组
- [x] 为流量分析页补齐来源对象组与页面对象组
- [x] 为转化分析页补齐页面对象组与支付失败订单对象组
- [x] 为页面对象接入第一版 page-level web pixel 漏斗信号，并在单国家场景显式降级
- [x] 为对象卡片与对象页统一上下文 builder

## P2

- [x] 新增成本分析页
- [x] 新增利润分析页
- [ ] 补齐利润瀑布模型
- [ ] 补齐三层利润模型：毛利润 / 贡献利润 / 净利润
- [x] 补齐产品利润分析
- [ ] 补齐成本结构拆解
- [ ] 为成本分析页补齐高成本对象组
- [x] 为利润分析页补齐高利润 / 亏损对象组

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
5. 流量问题是来源问题还是页面承接问题
6. 转化问题是承接问题还是支付链路问题

补充说明：

- 第 1~4 条仍是当前主方案下最核心的经营问题
- 第 5~6 条用于保证 `traffic / conversion` 不会在执行阶段被弱化成只剩“ROI 附属页”
- 若后续引入更完整的维度页结构，也应保证这些问题仍能在对应页面中被清楚回答

## 10. 下一步建议

建议下一步直接从 `Phase A / P0` 开始，也就是只改：

- `app/routes/app.today._index.tsx`
- `app/server/operations/todayGeo.server.ts`

先把首页驾驶舱搭起来，再继续补成本、利润和三层 ROI 的正式数据。

## 11. 实施清单（2026-08-22）

这一节用于把当前讨论过的 A/B/C 报告实现方案固定成后续开发与验收清单。默认按“先做骨架可运行，再逐步替换旧详情页”的策略推进。

说明：

- 本节保留的是当时阶段内的实现方案和执行记录
- 其中部分命名、入口和结构尝试，后续已经在 `12`、`13` 两节中被重新收敛
- 因此阅读本节时，应将其理解为“阶段实施记录”，而不是当前唯一最终信息架构

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
- 第一阶段已在 `traffic / conversion` 页面把页面对象从纯 `landingSite` 订单代理升级为第一版真实页面漏斗口径；其中 `traffic` 接到 `page_viewed / product_added_to_cart / checkout_started`，`conversion` 进一步补到 `payment_info_submitted / checkout_completed`
- 当前这套 page-level 信号仅在 `全部地区` 下启用；单国家仍明确回退到订单代理口径，避免把缺失数据展示为 0
- 以上阶段内曾尝试将首页入口收拢为 3 张一级卡，并同步调整 `ROI` 页主 focus
- 这组尝试已在 `12`、`13` 两节中重新收敛，当前阅读时应优先以主文档前文的正式口径为准

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

#### 11.2.1 第一阶段路由规划的阅读方式

这里记录的是第一阶段实现时采用的目标路由与入口映射，主要用于：

1. 说明当时的开发落点
2. 约束前端跳转关系
3. 便于验收时核对页面是否接通

它不应单独被理解为：

- 当前唯一最终信息架构
- 对 `5.2` 路由语义的最终定稿
- 对后续页面命名和信息分层的最终裁决

换句话说：

- `11.2` 更偏“阶段实现路线”
- `5.2 / 5.4` 更偏“当前主文档中的页面承载语义”

后续若两者存在差异，应优先回到：

1. `5.2` 看当前承载与过渡关系
2. `5.4` 看页面到底回答什么问题
3. `11.2` 只作为该阶段的实现记录与验收参考

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

- 无

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

- [x] 打开首页后，首屏能直接看到赚钱状态
- [x] 六张经营指标卡全部可跳转
- [x] ROI 三层摘要中，缺数据的层级明确显示 `待接入`
- [x] 首页不再以长报告结构展开正文

#### B 报告检查

- [x] 每个 B 页都包含“拆解 + 对象证据”双栏结构
- [x] B 页底部不再重复堆单独的 Top 对象模块
- [x] 窄屏下双栏会自动堆叠

#### C 报告检查

- [x] 可从对象证据卡打开弹窗
- [x] 支持遮罩点击关闭
- [x] 支持右上角关闭
- [x] 支持 `Esc` 关闭

#### AI 检查

- [x] B 页可带整页上下文和 AI 聊
- [x] C 报告可带对象上下文和 AI 聊
- [x] AI 上下文来自正式 report 数据，而不是临时文案拼接

## 12. 补充讨论稿入口

基于后续讨论，我额外整理了一份“单位模型 / 经营链路 / 维度展开”的补充思考稿，供后续整合时参考：

- `docs/TODAY_INFORMATION_ARCHITECTURE.md`

后续使用规则：

1. 本文档继续作为 `Today` 当前正式方案、阶段路线和执行 Todo 的主文档
2. `docs/TODAY_INFORMATION_ARCHITECTURE.md` 当前仅作为补充讨论稿，不能直接视为对本文档的自动替换
3. 如果后续确认采纳其中某些结构观点，应回到本文档对应章节做正式整合，而不是并行维护两套“都算正式”的语义

## 13. 与补充讨论稿的整合清单

本节用于明确：在不推翻当前主方案的前提下，补充讨论稿中的哪些观点值得吸收，应该吸收到哪里，以及当前哪些内容暂不采纳。

### 13.1 明确保留不动的部分

以下原方案当前继续保留，不因补充讨论稿而自动修改：

1. `4.0 三层报告结构`
   - 继续采用 `A 报告 -> B 报告 -> C 报告`
   - 补充讨论稿只影响“每层承载什么内容”，不影响层级本身

2. `4.2.3.1 B 报告标准骨架`
   - 继续采用：
     - 顶部总判断
     - 摘要指标
     - 指标拆解与对象
     - C 报告下钻

3. `4.2.1 对象优先原则`
   - 继续保留“详情页必须落到对象”
   - 当前不改成纯表格页，也不退回纯抽象分析页

4. `11.1 ~ 11.9 第一阶段实施记录`
   - 作为阶段记录继续保留
   - 即使其中部分结构命名后续会调整，也不应回头改写历史记录

### 13.2 建议后续正式修改的部分

以下章节是当前最值得吸收补充讨论稿观点的地方，但应通过正式修订原文来完成，而不是直接让补充稿替代：

#### A. `4.1 Today 首页`

当前原文重点是：

- 经营状态头部
- 6 张核心经营指标卡
- 为什么会这样
- ROI 三层摘要

补充讨论稿带来的修订方向建议：

1. 重新审视首页 6 张卡是否应继续作为最终一级入口
   - 不是立即删除
   - 而是要在原文里补充“指标入口”和“经营链路入口”之间的关系

2. `ROI 三层摘要` 需要补一段更明确的口径说明
   - 尤其要和 `长期价值`、`客户复购` 的边界说清楚

3. `为什么会这样` 建议补充“对象落点”和“链路节点”之间的映射关系

#### B. `4.2.3.3 各核心指标的拆解建议`

这是当前最需要吸收补充讨论稿的章节。

原因：

- 原文是按 `收入 / 成本 / 利润 / 利润率 / 订单数 / 客单价 / ROI` 拆
- 补充讨论稿强调 `单位模型`、`链路关系` 和 `维度页`

建议的正式修订方式不是直接删掉原有指标，而是：

1. 保留原指标拆解作为“经营结果视角”
2. 额外补一层“链路视角 / 单位模型说明”
3. 明确：
   - `流量` 对应 `session / 渠道 / 页面`
   - `转化` 对应 `session -> order / 渠道承接 / 商品承接`
   - `成交 / 利润` 对应 `order / order_line / 商品 / 订单`
   - `运营履约` 对应 `shipment / fulfillment / risk_event`

也就是说，这里更适合“加一层解释框架”，而不是整章推翻。

#### C. `5.4 详情页页面规格映射`

补充讨论稿对这一章最有价值的地方是：

1. 二级页不一定只是“另一个指标页”
2. 可以逐步向“主观察维度页”靠拢
3. 同一对象页可以被多个一级问题复用，但解释视角不同

建议后续在这一章中补充：

- 哪些页面当前仍按指标承载
- 哪些页面未来更适合转成维度承载
- 对象页如何复用同一套壳子，只切上下文视角

#### D. `6.4 ~ 6.6 统一对象结构`

补充讨论稿对原文这里是增强，不是冲突。

建议后续正式吸收的点：

1. 在 `TodayObjectGroup / TodayObjectItem` 之外，补一层“对象页统一模板”说明
2. 明确对象页固定五段：
   - 对象结论
   - 关键指标
   - 链路表现
   - 异常 / 机会
   - 动作建议
3. 明确“对象页是三级终点页，不再继续开第四层”

### 13.3 当前暂不采纳为正式方案的部分

以下观点目前保留在补充讨论稿中，但不直接写回主方案正文：

1. 直接把首页一级入口改成：
   - `流量`
   - `转化`
   - `成交 / 利润`
   - `运营履约`

原因：

- 这会直接推翻 `4.1.2` 当前 6 张卡方案
- 需要先验证是否真的适合当前阶段的数据能力与页面心智

2. 直接取消原文中的 `ROI 三层摘要`

原因：

- 原文已经把 ROI 三层作为首页主结构的一部分写清楚
- 若要调整，必须先在原文里补一版“长期价值 / 客户复购 / ROI”边界说明，再做正式替换

3. 直接把 `/app/today/orders` 改写成“成交 / 利润”总入口

原因：

- 原文 `5.4.2` 已把它定义成收入分析页过渡承载位
- 是否收并为“成交 / 利润”需要结合真实代码、数据可得性和用户心智一起判断

### 13.4 下一轮文档修订建议顺序

如果后续继续整合，建议按以下顺序动主文档：

1. 先修 `4.1`
   - 补首页卡片、ROI、长期价值之间的边界说明

2. 再修 `4.2.3.3`
   - 把“按指标拆”升级为“按指标 + 单位模型”双层说明

3. 再修 `5.4`
   - 增加“维度页演进方向”和对象页复用规则

4. 最后修 `6.4 ~ 6.6`
   - 把对象页模板、三级终点约束正式写进去

### 13.5 当前推荐阅读顺序

为了避免把“正式方案”“阶段记录”“补充讨论稿”混读，当前建议按以下顺序阅读：

1. 先看 `1 ~ 4`
   - 了解 `Today` 的目标、边界、首页结构与 A/B/C 主方案

2. 再看 `5.2 ~ 5.4`
   - 了解当前路由承载关系与详情页语义

3. 再看 `6.4 ~ 6.6`
   - 了解对象组、对象卡片、对象页与 builder 的统一约束

4. 再看 `11`
   - 把它当成阶段实施记录与验收清单

5. 最后看 `12`
   - 把补充讨论稿当作待整合的结构思考，而不是当前正式替代方案

如果某处出现阅读冲突，优先级建议为：

`4 / 5 / 6（当前主方案） > 11（阶段记录） > 12（补充讨论稿入口）`
