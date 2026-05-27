# Spark — Product Roadmap

> 基于《电商运营业务目标与 Skills 清单》与当前代码库现状制定。  
> 原则：先只读跑通价值与闭环数据采集 → 受控写回 → 跨渠道扩展 → 多模态。

---

## 一、当前状态（已完成）

| 能力 | 状态 | 关联清单模块 |
|------|------|-------------|
| LangGraph ReAct Agent 框架 | ✅ 完成 | 所有 Playbook 基础 |
| 多语言翻译流水线（V4） | ✅ 完成 | 国际化：批量翻译与本地化 |
| 商品文案生成 | ✅ 完成 | 商品日常运营：文案草案 |
| 商品质量评分 | ✅ 完成 | 转化率提升：商品页质量评分 |
| 图片翻译 / 图片生成 | ✅ 完成 | 国际化：多语言素材 |
| 7日经营体检报告（基础版） | ✅ 完成 | 经营总控：经营体检报告 |
| Shopify 订阅计费 + Token 用量 | ✅ 完成 | 基础设施 |
| 管理后台 Dashboard | ✅ 完成 | 内部运营 |
| 广告平台凭证存储（Google/Meta/TikTok） | ✅ 完成 | 获客：广告渠道基础 |
| 多租户 store_id 隔离 + OAuth | ✅ 完成 | Phase 0 基础 |

**核心缺口**：当前 Agent 工具池仅覆盖内容生产（翻译、文案、图片）与基础店铺信息，**缺少完整的数据同步层**（订单/退款/客户/库存/履约），导致"发现→定位→方案→执行→复盘"闭环无法跑通。

---

## 二、整体目标架构

```
┌─────────────────────────────────────────────────────────┐
│                   工作台入口层                           │
│  自动化输出（日报/告警）  手动触发（诊断/方案）  Playbook  │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              Playbook Skills（复合技能）                  │
│  获客  转化  复购  营销推送  国际化  商品运营  售后  竞品  │
└──────────────────────┬──────────────────────────────────┘
                       │ 调用
┌──────────────────────▼──────────────────────────────────┐
│              Atomic Skills（原子工具）                    │
│  数据对齐 监控发现 问题定位 方案产出 质检风控 执行 复盘    │
└──────────────────────┬──────────────────────────────────┘
                       │ 读写
┌──────────────────────▼──────────────────────────────────┐
│              数据层（已有 + 待建）                        │
│  Prisma/Turso  Cosmos  Redis  Blob  ← Shopify Webhook   │
└─────────────────────────────────────────────────────────┘
```

---

## 三、路线图

### Phase 0 — 数据地基补齐（第 1-2 周）

**目标**：让所有 Skills 有数据可用，当前最大短板。

#### 3.1 数据同步骨架

| 任务 | 数据源 | 存储 | 说明 |
|------|--------|------|------|
| 订单同步（orders/line_items） | Shopify Webhook + REST | Prisma | 增量，含 created_at/paid_at |
| 退款同步（refunds） | Shopify Webhook | Prisma | 回流延迟需标注数据新鲜度 |
| 客户同步（customers） | Shopify Webhook | Prisma | 脱敏存储，含首单/末单时间 |
| 库存同步（inventory_levels + locations） | Shopify Webhook | Prisma | 多仓支持，含 location_id |
| 履约同步（fulfillments + tracking） | Shopify Webhook | Prisma | 含物流轨迹事件 |
| 商品扩展字段（variants, metafields） | 增量拉取 | Prisma | 补全现有 products 表 |

**实现步骤**：
1. 在 `prisma/schema.prisma` 添加 `Order`, `Refund`, `Customer`, `InventoryLevel`, `Fulfillment` 表
2. 在 `app/server/shopify/` 新增各模块同步 service（`orderSync`, `customerSync`, etc.）
3. 注册 Shopify Webhook（`app/server/session/shopifyAppSetup.ts` 里已有模式）
4. 在 `/worker` 新增回补任务（`backfill` job）用于初始历史数据

#### 3.2 语义层（指标口径统一）

- 在 `app/server/ai/` 新建 `semantics/` 目录，存放指标定义文件
- 实现 `MetricsCalculator`：GMV / Net Sales / 退款率 / 复购率 / ATP 等按附录 0.6 口径计算
- 所有 Skills 的数字输出均从此计算器取值，避免口径不一致

---

### Phase 1 — 只读闭环（第 3-6 周）

**目标**：让客户先看到价值，所有 Playbook 的"发现→定位→方案"链路跑通，不写回。

#### 3.3 经营总控（优先级最高）

**原子 Skills**（新建 `app/server/ai/skills/operations/`）：

| Skill | 触发 | 核心逻辑 |
|-------|------|----------|
| `healthCheckReport` | 自动化（日/周） | GMV/订单/转化/退款/库存 KPI + 异常标记 |
| `anomalyBreakdown` | 自动化 | 将异常拆解到渠道/地区/SKU 维度 |
| `dataFreshnessCheck` | 自动化 | 检测数据延迟/缺失，输出置信度 |

**升级现有诊断报告**（`app/routes/app.additional.tsx`）：
- 接入真实订单/退款/客户数据
- 增加异常告警列表
- 增加"建议清单"输出

#### 3.4 告警中心

新建 `app/server/ai/skills/alerts/`，实现：

| 告警类型 | 阈值配置 | 通知方式 |
|---------|---------|---------|
| 缺货风险预警 | 售罄天数 < N 天 | Chat 消息 + Feishu（已有） |
| 超卖/负库存 | inventory_level < 0 | 同上 |
| 发货 SLA 超时 | 下单→发货 > N 小时 | 同上 |
| 退款率上升 | 退款率 7日环比 > X% | 同上 |

#### 3.5 核心 Playbook 技能（只读版）

新建 `app/server/ai/playbooks/` 下各 Playbook：

**转化下滑专项治理（优先，复用现有质量评分）**
```
转化异常诊断 → 商品页质量评分（已有） → 缺货损失估算 → 改进建议生成
```
工具文件：`app/server/ai/skills/conversion/`

**上新流水线（复用现有文案生成）**
```
商品信息规范化 → 合规检查 → 文案草案（已有） → 导出待上架表
```
工具文件：`app/server/ai/skills/merchandising/`

**退款率专项治理**
```
退款率归因 → 原因结构化 → 高风险 SKU 清单 → 改进建议
```
工具文件：`app/server/ai/skills/aftersales/`

#### 3.6 闭环采集（强制）

新建 `app/server/agentRunLog/` 扩展（已有基础）：
- 每次 Skill 输出绑定 `case_id`
- 记录：问题发现卡 / 行动建议卡 / 采纳状态（用户是否点击"执行"/"忽略"）
- 固定窗口（7/14/30 天）自动生成复盘卡

---

### Phase 2 — 受控写回（第 7-10 周）

**目标**：小范围开放 L2 写回能力（预览 + 确认 + 审计 + 回滚）。

#### 3.7 写回治理基础设施

新建 `app/server/ai/writeBack/`：

```typescript
// 所有写回必须经过此层
interface WriteBackRequest {
  skill_id: string;
  action_type: string;
  dry_run: boolean;         // 默认 true（预览）
  idempotency_key: string;  // 防重复
  payload: unknown;
}
interface WriteBackResult {
  preview_diff: object;     // 变更前后对比
  audit_log_id: string;
  rollback_snapshot: object;
}
```

#### 3.8 商品内容写回

- `update_product_content`：标题/描述/元信息批量更新（已有生成，接写回）
- `publish_unpublish_products`：批量上下架（含回滚）
- 权限：`write_products`，阶段二按需授权

#### 3.9 促销发布

- `create_discount / update_discount`：折扣结构/门槛/商品池写回
- 含覆盖范围预检、叠加规则校验、一键禁用
- 权限：`write_discounts`

#### 3.10 营销推送

- 客户分群（RFM 计算，基于已同步 customers + orders）
- 人群包导出/同步到邮件平台（复用现有 email service）
- 频控与黑名单规则

---

### Phase 3 — 跨渠道扩展（第 11-16 周）

**目标**：对接广告平台、SEO、履约/WMS，闭环更多业务场景。

#### 3.11 广告渠道

| 任务 | 实现 |
|------|------|
| 广告数据归因对齐 | UTM + 点击 ID 关联站内订单，输出可归因占比 |
| 投放诊断 | 计划/广告组/素材表现分析 |
| 预算消耗监控 | Pacing 告警 |
| 变更执行（可选） | Google/Meta API 写回，需独立授权 |

基础设施：扩展 `app/server/adPlatform/`（凭证已有）

#### 3.12 SEO / 社媒

| 任务 | 实现 |
|------|------|
| 落地页漏斗追踪 | 接入 GA4 / Pixel 事件流 |
| SEO 基础体检 | 扫描 title/description/结构化字段问题 |
| 自然流量周报 | 自动化（已有 report 框架） |
| 多语言 SEO 关键词扩展 | 复用翻译 + LLM（国际化已有基础） |

#### 3.13 履约与 WMS 对接

| 任务 | 实现 |
|------|------|
| 物流轨迹增强 | 对接承运商 API（停滞/退回/丢件检测） |
| 多仓 ATP 计算 | 已有库存数据 + 安全库存模型 |
| 调拨/补货清单 | 方案产出 → 导出表格 |
| WMS 推送（可选） | 接口对接，按需 |

#### 3.14 竞品监控

| 任务 | 实现 |
|------|------|
| 竞品价格抓取 | 定时爬取（合规范围内） |
| 促销/上新监控 | 快照对比 |
| 差距→行动清单 | LLM 生成 + 分发到对应 Playbook |
| 竞品周报 | 自动化（复用 report 框架） |

---

### Phase 4 — 多模态增强（第 17 周起，按需）

**原则**：只做"窄场景、可验证、低风险"的多模态；核心诊断仍以结构化数据为主。

| 场景 | 优先级 | 说明 |
|------|--------|------|
| 商品图片质检 | 高 | 分辨率/白底/水印/主图合规（已有图片翻译基础，扩展） |
| 竞品页面截图解析 | 中 | 提取卖点/价格/促销标识 |
| 广告素材归类与疲劳检测 | 中 | 主题/风格聚类 |
| 客服截图/工单附件理解 | 低 | 非结构化转结构化标签 |

> 多模态均封装为可插拔原子 Skill，输出结构化结果（标签/评分），由 Playbook 消费；结果必须可复核，支持人工覆盖。

---

## 四、优先级矩阵

| 任务 | 频率 | 价值 | 风险 | 可度量 | 优先级 |
|------|------|------|------|--------|--------|
| 数据同步骨架（订单/库存/退款） | 每日 | 极高 | 低（只读） | 是 | P0 |
| 经营体检报告升级 | 每日 | 高 | 低 | 是 | P0 |
| 缺货/退款/SLA 告警 | 每日 | 高 | 低 | 是 | P1 |
| 商品页质量→转化改进 Playbook | 每周 | 高 | 低（只读） | 是 | P1 |
| 上新流水线 Playbook | 每周 | 高 | 低 | 是 | P1 |
| 退款治理 Playbook | 每周 | 高 | 低 | 是 | P1 |
| 客户分群 + 复购分析 | 每周 | 高 | 低 | 是 | P1 |
| 商品内容写回 | 按需 | 高 | 中（可回滚） | 是 | P2 |
| 促销配置写回 | 按需 | 高 | 中 | 是 | P2 |
| 国际化 SEO 扩展 | 每周 | 中 | 低 | 是 | P2 |
| 广告归因对齐 | 每日 | 高 | 低 | 是 | P3 |
| 竞品监控 | 每周 | 中 | 低 | 是 | P3 |
| 履约 WMS 对接 | 每日 | 中 | 中 | 是 | P3 |
| 多模态图片质检 | 按需 | 中 | 低 | 是 | P4 |

---

## 五、实现规范

### 5.1 新增 Skill 的文件结构

```
app/server/ai/skills/{domain}/
├── {skillName}.ts          # Skill 实现（LangChain Tool）
├── {skillName}.schema.ts   # Zod 输入/输出 schema
└── index.ts                # 注册到 globalToolRegistry
```

### 5.2 新增 Playbook 的文件结构

```
app/server/ai/playbooks/{name}/
├── {name}Graph.ts          # LangGraph StateGraph 定义
├── {name}Nodes.ts          # 各节点实现
├── {name}State.ts          # 状态类型
└── index.ts
```

### 5.3 写回操作强制要求（Phase 2+）

- [ ] `dry_run` 预览模式（展示 diff，默认开启）
- [ ] `idempotency_key` 防重复提交
- [ ] 审计日志（操作人 / 时间 / 对象 / 变更前后 / 原因）
- [ ] 回滚快照（可逆操作）或强风控（不可逆操作如发送消息）
- [ ] 默认人工确认（L2）；高风险操作需二次确认

### 5.4 Skill 版本化

每个 Skill 携带 `skill_id` + `version` 字段，规则/提示词/阈值变更时递增版本，便于 A/B 对比与回溯。

---

## 六、关键里程碑

| 里程碑 | 目标周 | 验收标准 |
|--------|--------|---------|
| M0：数据地基 | 第 2 周 | 订单/退款/库存/客户数据实时同步，指标口径统一 |
| M1：只读智能体上线 | 第 6 周 | 经营日报 + 3 个核心告警 + 3 个 Playbook（只读）可演示 |
| M2：闭环采集上线 | 第 6 周 | case_id 绑定、采纳状态记录、7 天复盘自动生成 |
| M3：受控写回上线 | 第 10 周 | 商品内容/促销写回（含 dry-run + 审计 + 回滚）通过内测 |
| M4：广告/SEO 扩展 | 第 14 周 | 广告归因对齐上线，SEO 体检周报自动化 |
| M5：竞品 + 履约 | 第 16 周 | 竞品周报 + 物流异常告警上线 |

---

## 七、当前分支任务

> 本节追踪当前开发周期的具体任务。

- [ ] Phase 0：Prisma schema 扩展（Order / Refund / Customer / InventoryLevel / Fulfillment）
- [ ] Phase 0：Shopify Webhook 注册（orders/paid, orders/fulfilled, refunds/create, inventory_levels/update）
- [ ] Phase 0：MetricsCalculator 实现（GMV / Net Sales / 退款率 / 复购率）
- [ ] Phase 1：经营体检报告升级（接入真实数据，增加异常告警列表）
- [ ] Phase 1：告警中心（缺货 / 超卖 / SLA / 退款率）
- [ ] Phase 1：转化下滑 Playbook（只读，复用质量评分）
- [ ] Phase 1：case_id 闭环采集（绑定到现有 agentRunLog）
