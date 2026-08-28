# Spark 功能与数据层梳理

本文档总结 Spark 当前主应用、内部 Admin 和 Web Pixel 扩展覆盖的数据层与功能层。整店/多语言翻译执行链路归 TSF 所有；Spark 只保留图片翻译、兼容读取和 Admin 观测/运维入口。

## 数据层

| 数据 | 存储 / 来源 | 当前用途 |
| --- | --- | --- |
| Shopify 店铺基础信息 | Shopify Admin GraphQL / Session | 店铺名、域名、币种、时区、套餐、权限诊断、品牌风格兜底 |
| 商品与商品变体 | Shopify Admin GraphQL | 商品搜索、商品详情、商品文案生成、商品质量评分 |
| 店铺语言与 locale | Shopify Admin GraphQL | 商品文案目标语言、图片翻译目标语言 |
| Shopify 内容对象 | Shopify Admin GraphQL | 工作台上下文对象查询、Admin 翻译资源观测 |
| ShopifyQL 官方报表 | Admin GraphQL `shopifyqlQuery`（需 `read_reports`） | Settings 历史指标查询（销售/退款/成本利润/客户/库存/履约/店面漏斗）；不落库 |
| 订单 | Prisma/Turso `ShopOrder`，Webhook + 历史回补 | 销售额、订单数、AOV、渠道来源、取消率、经营诊断 |
| 订单行项目 | Prisma/Turso `ShopOrderLineItem` | SKU 销售、商品归因、库存风险估算、退款 SKU 关联 |
| 退款 | Prisma/Turso `ShopRefund`，Webhook + 回补 | 退款金额、退款率、退款趋势、异常退款订单 |
| 退款行项目 | Prisma/Turso `ShopRefundLineItem` | Top 退款 SKU、退款原因归因、售后治理建议 |
| 客户快照 | Prisma/Turso `ShopCustomer` | 首单/末单、LTV、客户价值层、复购分析基础 |
| 库存水位 | Prisma/Turso `ShopInventoryLevel`，Webhook | 低库存、缺货风险、可售天数、预计损失 |
| 履约记录 | Prisma/Turso `ShopFulfillment`，Webhook | 发货 SLA、物流停滞、未履约订单、履约健康 |
| 同步游标 | Prisma/Turso `ShopSyncCheckpoint` | 历史回补状态、增量同步检查 |
| 每日经营诊断快照 | Prisma/Turso `OperationDiagnosisSnapshot` | Today 概览、每日巡检、经营建议、自动化历史 |
| 经营诊断项 | Prisma/Turso `OperationDiagnosisItem` | 销售、转化、商品、履约、物流、退款、库存健康判断 |
| 经营待办 | Prisma/Turso `OperationTask` | 四象限任务、优先级、状态流转、复盘 |
| ROI / 成本配置 | Prisma/Turso `ShopCostConfig` 等 | 渠道 ROI、客户价值、毛利口径 |
| AI 任务批次与任务 | Prisma/Turso `AITaskBatch` / `AITask` | 文案、图片生成、图片翻译等异步任务状态与结果 |
| AI 任务日志 | Prisma/Turso `AITaskLog` | 任务实时日志、SSE 进度、失败排查 |
| AI 任务成本估算 | Prisma/Turso `AITaskEstimation` | 任务二次确认中的预计耗时与 Credit |
| TSF 翻译任务观测 | TSF Turso / Cosmos / Redis / Blob / Shopify | Admin 翻译任务、用量、ROI、资源写回排查 |
| 对话会话与消息 | Prisma/Turso `Conversation` / `Message` | AI 聊天历史、卡片 payload、上下文恢复 |
| 工作台文件 | Prisma/Turso + Azure Blob `WorkspaceFile` | 上传文件解析、AI 文件上下文注入 |
| 计费账户 | Prisma/Turso `Account` | 订阅额度、按量额度、试用额度、已用 Credit |
| 套餐目录与订阅 | Prisma/Turso `PlanCatalog` / `AppSubscription` | 订阅页、Checkout、续费、取消订阅 |
| 计费流水 | Prisma/Turso `BillingLog` / `ToolTokenUsageLog` | 订阅、购包、工具 Credit 消耗明细 |
| 广告凭证 | Prisma/Turso `AdPlatformCredential` | Meta、Google、TikTok、Microsoft 广告连接配置 |
| 物流凭证 | 本地 JSON `.data/logistics-provider-credentials.json` | FedEx、顺丰物流接口配置 |
| 通用事件日志 | Prisma/Turso `CommonEventLog` | 安装、卸载、scope 更新等生命周期记录 |
| 访问来源 | Prisma/Turso `AppVisitSource` | 外部入口 UTM、邮件/广告归因 |
| Pixel 日志 | Aliyun SLS / Web Pixel extension | 站内行为、转化漏斗、后续归因分析基础 |
| 支持与反馈 | Prisma/Turso / Feishu / Email | 用户建议、客服会话、运营通知 |

## 功能层

| 功能域 | 面向用户的能力 | 主要入口 |
| --- | --- | --- |
| AI 助手 | 自然语言问答、读取店铺数据、打开任务卡片、运行 Playbook、带文件上下文分析 | `/app`、`/chat-stream` |
| 首页工作台 | 问候、今日巡检状态、经营摘要、推荐 Playbook、最近任务、快捷提问 | `/app` |
| 经营概览 | 销售额、订单数、退款率、库存风险、经营提醒、关键趋势、建议 | `/app/today` |
| 健康度监测 | 可信度健康、目标达标性、异常原因、受影响模块与建议动作 | `/app/health-monitor` |
| 待办中心 | 统一查看经营任务与 AI 任务，处理状态流转、结果和历史记录 | `/app/tasks` |
| 订单风险监控 | 退款治理、履约 SLA、物流异常、库存风险 SKU、异常订单明细 | `/app/today/orders` |
| 商品文案 | 生成标题/描述、检测源语言、按目标语言生成、审核后写回 Shopify | `/app/studio/copy` |
| 商品质量评分 | 评估商品页质量、给出优化建议 | AI 工具 / 商品优化链路 |
| 图片工作台 | 文生图、图片翻译、图片任务创建、结果查看 | `/app/studio/image` |
| 统一任务中心 | 合并 AI 任务，查看当前/历史、日志、结果、失败重试入口 | `/app/tasks` |
| Playbook | 经营体检、库存止损、退款治理、上新流水线等多步骤运营方案 | AI 助手 / 首页推荐 |
| 自动化 | 每日经营巡检、执行历史、推荐 Playbook 模板 | `/api/automation-overview`、首页/助手 |
| 计费与额度 | 套餐订阅、按量购包、取消订阅、Credit 余额与用量 | `/app/settings/billing` |
| 数据工具 | 历史订单回补、同步状态查看、订单/客户/库存/履约记录数 | `/app/settings/data` |
| Shopify 报表 | 用 ShopifyQL 查询官方历史指标（销售/退款/成本与利润/客户/库存/履约/店面漏斗） | `/app/settings/shopify-reports` |
| 广告 Catalog | Meta / Google / TikTok 商品目录 OAuth 与同步；Google GMC↔Ads 关联、AW 配置、同意门禁店面再营销及实验性 purchase Custom Pixel | `/app/ads-catalog` |
| Google Pixel 向导 | Nabu 风格三步向导：添加像素（Conversion ID + Label）/ 开启 App Embed 并检测状态 / 创建像素（选择事件、增强型转化、purchase Custom Pixel） | `/app/ads/google-pixel` |
| Google Pixel Activity | 店面 gtag / purchase Custom Pixel 事件双写阿里云 SLS；商户页展示卡片、日趋势、漏斗与事件明细 | `/app/ads/google-pixel/activity` |
| Today 二级详情 | ROI、流量、转化、订单等经营详情页，按统一模板承接图表、对象拆解和 AI 下钻 | `/app/today/roi` 等 |
| Ads Catalog | Meta / Google / TikTok 商品目录 OAuth 与同步；Google GMC↔Ads 关联、AW 配置、同意门禁店面再营销及实验性 purchase Custom Pixel | `/app/ads-catalog` |
| 投放表现图表 | Meta / Google / TikTok 广告系列→广告组→广告实时指标（7/14/30 天）；TikTok 支持沙盒开关 | `/app/ads-catalog?tab=credentials&platform=...` |
| 物流集成配置 | FedEx、顺丰凭证配置 | `/app/settings/logistics` |
| 用户反馈 | 提交建议或问题 | `/app/settings/feedback` |
| PageSpeed Insights | 对公网 URL 跑 Google 实验室分析，展示性能/无障碍/SEO/最佳做法分数、指标与审核项 | `/app/settings/pagespeed` |
| 邮件与通知 | 安装、卸载、订阅、购包、任务状态等邮件与飞书运营通知 | 后台服务 / Webhook |
| Webhook 同步 | 订单、退款、库存、履约、订阅、购包、卸载、scope 更新、GDPR 合规（`/webhooks/compliance`，当前仅 ack） | `app/routes/webhooks.*` |
| Web Pixel | 浏览、购物车、checkout 等行为采集 | `extensions/ciwi-spark-web-pixel/`、`/api/pixel-ingest` |
| 内部 Admin | 店铺、用量、订阅、收入、Agent 执行、客服、日志、巡检、TSF 翻译观测、定价 | `/admin` |

## 当前信息架构归纳

| 一级目的地 | 应放能力 | 用户心智 |
| --- | --- | --- |
| Ask | AI 对话、文件上下文、推荐动作、最近任务 | 我想问 Spark 或让它开始做事 |
| Today | 经营概览、ROI/流量/转化/订单详情、趋势深钻、经营判断 | 看结果、理解为什么赚钱或没赚钱 |
| Health Monitor | 可信度健康、目标达标性、异常原因、建议动作 | 判断数据是否可信、结果是否达标 |
| Studio | 商品文案、图片生成、图片翻译、质量评分 | 生产和优化内容资产 |
| Tasks | AI 异步任务、日志、结果、审核、失败重试 | 所有后台工作跑到哪了 |
| Settings | 计费、数据同步、官方报表查询、广告、物流、反馈 | 低频配置和基础设施 |
| 内部 Admin | 运营监控、客服、收入、日志、定价、TSF 观测 | 内部团队管理 Spark |

## 首页目标

首页目标是让用户在 10 秒内回答三个问题：

1. 今天店铺整体正常吗？
2. 当前最值得处理的风险是什么？
3. 我可以一键让 Spark 做什么？

推荐首页结构：

1. 顶部状态：问候、日期、今日巡检状态、数据更新时间。
2. 经营摘要：销售额、订单数、退款率、库存风险、待处理任务等关键指标。
3. 重点风险：最多 3 条经营提醒，每条带证据和跳转。
4. 推荐动作：根据诊断推荐 Playbook 或快捷操作。
5. 最近任务：展示运行中、待审核、失败或最近完成的任务。
6. AI 输入：用于追问、发起任务或附加商品/订单/文件上下文。
