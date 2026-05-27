# Spark 电商 Agent 功能路线图

本文档是项目后续开发的功能规划，**AI Agent 在新增 Skill/Tool 前必读此文档**，了解优先级和整体布局。

> **状态说明**：`[ ]` 待开始 · `[~]` 进行中 · `[x]` 已完成

---

## 框架说明

所有原子 Skill 按运营闭环拆成 7 个环节：

| 环节 | 解决什么问题 |
|---|---|
| **数据对齐** | 多渠道数据打通/归因/口径对齐 |
| **监控与发现** | 自动化告警/异常捕捉 |
| **问题定位** | 维度下钻/归因/解释"为什么" |
| **方案产出** | 可执行方案/草案/清单 |
| **质检与风控** | 合规/质量/阈值/叠加规则校验 |
| **执行** | 把确认的动作写回平台并审计 |
| **复盘验证** | 前后对比/沉淀有效动作 |

---

## 一、数据对齐

### P1 · 来源归因标准化
- **状态**：`[ ]`
- **复杂度**：低
- **目标**：把 Shopify 订单的原始 `sourceName` 值（如 `web`、`pos`、`shopify_draft_order` 等）映射到统一渠道口径（organic / paid-search / social / direct / other），消除多端口径不一致
- **实现路径**：
  - 在 `app/server/ai/skills/shopifyInfo/` 新增 `sourceNormalization.ts`，维护映射规则表
  - 扩展 `get_shopify_today_source_performance` 工具，在返回结果中附加标准化字段
- **依赖**：无新增 scope

### P2 · 广告效果归因（ROAS 计算）
- **状态**：`[ ]`
- **复杂度**：高
- **目标**：拉取 Google / Meta / TikTok 广告花费，与 Shopify 订单收入对齐，计算各渠道 ROAS
- **实现路径**：
  - `AdPlatformCredential` 表和 OAuth 入口已有（`app.ads.*.config.tsx`），需新增各平台 API 调用模块
  - `app/server/adPlatform/google.server.ts` — Google Ads API（需 Developer Token）
  - `app/server/adPlatform/meta.server.ts` — Meta Marketing API
  - `app/server/adPlatform/tiktok.server.ts` — TikTok Marketing API
  - 新增 `get_ad_platform_roas` AI 工具
- **依赖**：各平台 API 密钥已在 DB，需实际开通 API 访问权限

### P1 · 多周期口径对比
- **状态**：`[ ]`
- **复杂度**：低
- **目标**：同一指标按日/周/月对比，自动计算 WoW / MoM 变化率，输出趋势摘要
- **实现路径**：
  - 封装 `compareKpiPeriods()` 工具，接受两个时间区间，调用已有 KPI 工具并做差值计算
  - 新增 `get_shopify_kpi_comparison` AI 工具
- **依赖**：无，现有 KPI 工具已支持 `days` 参数

---

## 二、监控与发现

### P0 · 销售异常告警
- **状态**：`[ ]`
- **复杂度**：低
- **目标**：当日销售额/订单数相比过去 7 天均值跌超阈值（默认 30%），主动推送飞书消息
- **实现路径**：
  - 复用 `app/server/feishu/` 通知模块
  - 新增 `app/server/monitor/salesAlert.server.ts`：拉取 1 天 vs 7 天均值，计算跌幅，触发飞书通知
  - 可注册为定时任务或作为 AI 工具 `check_sales_anomaly`
- **依赖**：无新增 scope；飞书 Webhook 已有

### P0 · 库存预警 + 断货天数估算
- **状态**：`[ ]`
- **复杂度**：中
- **目标**：输出低库存 / 零库存 SKU 清单，结合日均销量估算剩余可售天数，生成补货优先级
- **实现路径**：
  - `get_shopify_inventory_health` 已有库存量
  - 新增查询：按商品聚合近 30 天订单中各 SKU 销售数量，计算日均销速
  - `剩余天数 = 当前库存 / 日均销速`，输出分级告警（< 7 天 / 7-14 天 / 14-30 天）
- **依赖**：`read_orders` scope 已有

### P1 · 弃单激增监控
- **状态**：`[ ]`
- **复杂度**：中
- **目标**：弃单率超阈值时，输出弃单商品清单、弃单金额分布、高峰时段
- **实现路径**：
  - 现有 `TODAY_ABANDONED_CHECKOUTS_QUERY` 只取 id，需扩展字段：lineItems、totalPrice、createdAt
  - 新增 `get_shopify_abandonment_detail` AI 工具
- **依赖**：`read_checkouts` scope（需在 toml 中补充）

### P1 · 退款率异常监控
- **状态**：`[ ]`
- **复杂度**：中
- **目标**：退款率异常升高时，输出退款 TOP10 商品、退款原因分布（若有备注）
- **实现路径**：
  - 扩展 `TODAY_ORDER_METRICS_QUERY`，在 refunds 节点增加 lineItems 字段
  - 按 productId 聚合退款次数，排序输出
- **依赖**：`read_orders` scope 已有

---

## 三、问题定位

### P0 · 商品销售下钻
- **状态**：`[ ]`
- **复杂度**：中
- **目标**：输出商品级 GMV / 订单数 / 退款率排行，识别拉低整体表现的商品
- **实现路径**：
  - 新增 GraphQL 查询：遍历指定时间段内的订单 lineItems，按 productId 聚合
  - 新增 `get_shopify_product_sales_ranking` AI 工具，返回 TOP N 商品销售明细
  - 文件：`app/server/shopify/productSalesRanking.server.ts`
- **依赖**：`read_orders` scope 已有

### P1 · 流量来源转化下钻
- **状态**：`[ ]`
- **复杂度**：低
- **目标**：在已有来源分布基础上，增加各来源的转化率和 AOV，输出来源×指标矩阵
- **实现路径**：
  - 扩展 `get_shopify_today_source_performance`：把相同来源的订单金额汇总，结合弃单数计算各来源转化率
- **依赖**：无

### P1 · 弃单原因定位
- **状态**：`[ ]`
- **复杂度**：中
- **目标**：分析弃单集中在哪些商品/价格段/时段，帮助定位转化漏洞
- **实现路径**：依赖上方「弃单激增监控」的详情查询，在此基础上增加 LLM 归因分析
- **依赖**：`read_checkouts` scope

### P2 · 复购 / 新客分析
- **状态**：`[ ]`
- **复杂度**：中
- **目标**：识别高复购商品、流失客群，输出客户生命周期摘要
- **实现路径**：
  - 按 `customerId` 聚合历史订单，计算复购率、平均购买间隔、LTV
  - 新增 `get_shopify_customer_cohort` AI 工具
- **依赖**：`read_customers` scope（需在 toml 中补充）

---

## 四、方案产出

### P0 · 折扣策略推荐
- **状态**：`[ ]`
- **复杂度**：低
- **目标**：基于低转化商品和滞销库存数据，输出折扣力度、适用商品范围、建议时间窗口的文字草案
- **实现路径**：
  - 新增 Playbook `discountStrategyPlaybook`：依次调用库存健康 + 商品销售排行 → LLM 生成折扣建议
  - 文件：`app/server/ai/skills/discount/discountStrategy.ts`
- **依赖**：无新增 scope（纯文字建议，不写回）

### P1 · 补货清单生成
- **状态**：`[ ]`
- **复杂度**：中
- **目标**：基于销速和当前库存，输出需补货的 SKU 列表、建议补货数量、预计断货日期
- **实现路径**：
  - 依赖「库存预警 + 断货天数」工具的计算结果
  - LLM 基于断货天数和历史销量波动，输出补货优先级和建议数量
- **依赖**：无

### P1 · 邮件营销草案
- **状态**：`[ ]`
- **复杂度**：中
- **目标**：针对特定客群（如 30 天未购、高价值客户）生成邮件主题和正文草案，一键触发发送
- **实现路径**：
  - 新增 `get_shopify_customer_segment` 工具：按购买时间/金额筛选客户列表
  - LLM 生成邮件内容 → 调用已有 `send_template_email` 工具
  - 新增 Playbook `emailCampaignPlaybook`
- **依赖**：`read_customers` scope

### P2 · 选品 / 上新建议
- **状态**：`[ ]`
- **复杂度**：低
- **目标**：基于畅销品类结构，推荐可扩充品类或关联商品机会
- **实现路径**：LLM 分析商品销售结构 + 品类分布，输出选品建议文字（无需新工具）
- **依赖**：依赖商品销售下钻工具

---

## 五、质检与风控

### P0 · 批量产品质检
- **状态**：`[ ]`
- **复杂度**：低
- **目标**：扫描全店在售商品，输出质量评分分布（优/良/差）和问题商品清单
- **实现路径**：
  - 现有 `scoreProduct()` 已实现单品评分（`app/server/ai/skills/productOptimization/`）
  - 新增 `batchScoreProducts.server.ts`：分页拉取全量商品，批量评分，汇总报告
  - 新增 `batch_score_products` AI 工具
- **依赖**：`read_products` scope 已有

### P0 · 上架合规检查
- **状态**：`[ ]`
- **复杂度**：低
- **目标**：检测商品是否缺少必填字段（主图/描述/SKU/价格），输出合规问题清单
- **实现路径**：
  - 在批量质检基础上，增加硬性合规规则（与质量评分的软性建议区分）
  - 可配置必填项规则，输出"合规/不合规"二值结论
- **依赖**：无

### P1 · 价格异常检测
- **状态**：`[ ]`
- **复杂度**：低
- **目标**：检测定价离群值（某 SKU 价格远高/低于同品类中位数）
- **实现路径**：
  - 新增 GraphQL 查询：拉取全部商品价格，按 `productType` 分组计算中位数和标准差
  - 新增 `detect_price_anomaly` AI 工具
- **依赖**：`read_products` scope 已有

### P2 · 折扣叠加规则检查
- **状态**：`[ ]`
- **复杂度**：中
- **目标**：在创建折扣前，检测与现有折扣码/自动折扣是否冲突或叠加超限
- **实现路径**：
  - 新增 Shopify Discounts GraphQL 查询（`read_discounts` scope）
  - 校验规则：相同商品范围、叠加类型限制、有效期重叠
- **依赖**：需在 `shopify.app.*.toml` 中添加 `read_discounts` scope

---

## 六、执行

### P0 · 批量产品描述写回
- **状态**：`[ ]`
- **复杂度**：低
- **目标**：对质检不达标的商品，批量触发 AI 生成描述并写回 Shopify，过程有审计日志
- **实现路径**：
  - 现有 `app/server/generateDescription/` 已实现单品生成+写回
  - 新增批处理调度：接受商品 ID 列表，串行/并行调用现有生成服务
  - 每条记录写入 `AgentRunLog`（shop、action、productId、前后内容、时间戳）
- **依赖**：`write_products` scope 已有

### P1 · 创建折扣码
- **状态**：`[ ]`
- **复杂度**：中
- **目标**：把折扣方案草案确认后，直接写入 Shopify 生成折扣码
- **实现路径**：
  - 新增 `app/server/shopify/createDiscount.server.ts`，调用 Shopify Discounts GraphQL mutation
  - 新增 `create_shopify_discount` AI 工具，支持百分比折扣/固定金额/免运费三种类型
  - 执行结果写入审计日志
- **依赖**：需在 toml 中添加 `write_discounts` scope

### P1 · 触发邮件营销
- **状态**：`[ ]`
- **复杂度**：中
- **目标**：对筛选出的客群列表，批量发送营销邮件并记录发送结果
- **实现路径**：
  - 依赖「邮件营销草案」的客群筛选工具
  - 复用 `app/server/email/` 的发送模块，增加批量发送 + 发送日志
  - 每封邮件记录：收件人、模板、发送时间、状态（成功/失败）
- **依赖**：`read_customers` scope

### P2 · 商品标签批量更新
- **状态**：`[ ]`
- **复杂度**：低
- **目标**：根据分析结果批量打标签（如"滞销"/"爆款"/"需补货"）
- **实现路径**：
  - 新增 `app/server/shopify/updateProductTags.server.ts`，调用 `productUpdate` mutation
  - 新增 `update_product_tags` AI 工具
- **依赖**：`write_products` scope 已有

---

## 七、复盘验证

### P1 · 活动前后对比报告
- **状态**：`[ ]`
- **复杂度**：中
- **目标**：执行折扣/邮件营销后，自动拉取操作前后 N 天指标对比，生成复盘报告
- **实现路径**：
  - 从 `AgentRunLog` 获取操作时间戳（action=`create_discount` / `send_email`）
  - 调用 KPI 工具分别查询操作前 7 天和操作后 7 天的销售/转化/GMV
  - LLM 输出结构化复盘报告（指标变化表 + 文字分析）
  - 新增 `generate_campaign_review` AI 工具
- **依赖**：无

### P1 · 产品优化效果追踪
- **状态**：`[ ]`
- **复杂度**：中
- **目标**：描述被优化的商品，在优化后 7 / 14 / 30 天回查销量变化
- **实现路径**：
  - 在写回描述时记录商品 ID + 优化时间到 `AgentRunLog`
  - 新增定时任务：到期后自动查询该商品的销量变化，推送飞书通知
  - 或通过 AI 工具手动触发回查
- **依赖**：无

### P2 · 有效动作沉淀到 Playbook
- **状态**：`[ ]`
- **复杂度**：高
- **目标**：把效果好的折扣/邮件策略提炼成可复用的 Playbook，供下次对话参考
- **实现路径**：
  - LLM 分析 `AgentRunLog` 中高效动作的共性（商品类型、折扣幅度、时间窗口等）
  - 提取特征 → 自动注册到 `playbookRegistry.server.ts`
  - 文件：`app/server/ai/core/playbookLearner.server.ts`
- **依赖**：需要足够的历史执行数据

---

## 实现优先级总览

| 优先级 | Skill | 环节 | 复杂度 | 关键依赖 |
|---|---|---|---|---|
| **P0** | 销售异常告警 | 监控与发现 | 低 | 无 |
| **P0** | 批量产品质检 | 质检与风控 | 低 | 无 |
| **P0** | 批量产品描述写回 | 执行 | 低 | 无 |
| **P0** | 上架合规检查 | 质检与风控 | 低 | 无 |
| **P0** | 折扣策略推荐 | 方案产出 | 低 | 无 |
| **P0** | 库存预警+断货天数 | 监控与发现 | 中 | `read_orders` 已有 |
| **P0** | 商品销售下钻 | 问题定位 | 中 | `read_orders` 已有 |
| **P1** | 来源归因标准化 | 数据对齐 | 低 | 无 |
| **P1** | 多周期口径对比 | 数据对齐 | 低 | 无 |
| **P1** | 弃单激增监控 | 监控与发现 | 中 | `read_checkouts` scope |
| **P1** | 退款率异常监控 | 监控与发现 | 中 | `read_orders` 已有 |
| **P1** | 流量来源转化下钻 | 问题定位 | 低 | 无 |
| **P1** | 弃单原因定位 | 问题定位 | 中 | `read_checkouts` scope |
| **P1** | 补货清单生成 | 方案产出 | 中 | 依赖库存预警 |
| **P1** | 邮件营销草案 | 方案产出 | 中 | `read_customers` scope |
| **P1** | 价格异常检测 | 质检与风控 | 低 | 无 |
| **P1** | 创建折扣码 | 执行 | 中 | `write_discounts` scope |
| **P1** | 触发邮件营销 | 执行 | 中 | `read_customers` scope |
| **P1** | 活动前后对比报告 | 复盘验证 | 中 | 依赖执行日志 |
| **P1** | 产品优化效果追踪 | 复盘验证 | 中 | 无 |
| **P2** | 广告效果归因 | 数据对齐 | 高 | 各平台 API 权限 |
| **P2** | 复购/新客分析 | 问题定位 | 中 | `read_customers` scope |
| **P2** | 选品/上新建议 | 方案产出 | 低 | 依赖销售下钻 |
| **P2** | 折扣叠加规则检查 | 质检与风控 | 中 | `read_discounts` scope |
| **P2** | 商品标签批量更新 | 执行 | 低 | `write_products` 已有 |
| **P2** | 有效动作沉淀 Playbook | 复盘验证 | 高 | 历史执行数据积累 |

---

## 需要新增的 Shopify Scopes

在开始对应功能前，需在 `shopify.app.*.toml` 中补充：

| Scope | 对应功能 |
|---|---|
| `read_checkouts` | 弃单激增监控、弃单原因定位 |
| `read_customers` | 复购分析、邮件营销草案、触发邮件营销 |
| `read_discounts` | 折扣叠加规则检查 |
| `write_discounts` | 创建折扣码执行 |

---

*最后更新：2026-05-27*
