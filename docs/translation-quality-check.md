# 翻译任务质量检查指南

**用途**：当用户说「检查翻译任务质量」「这次翻译质量怎么样」并附上 **任务 ID** 和/或 **完整 job JSON** 时，Agent 必须按本文档执行分析，不得凭印象猜测。**每次质量检查都默认顺带查询 QPS 速率并给用户画一张 QPS 图**（见第 6 节；日志过 7 天 TTL 才跳过）。

**相关文档**：流水线与存储结构见 [`docs/TRANSLATION_AGENT.md`](./TRANSLATION_AGENT.md)；**迭代 Playbook（一键诊断）**见 [`docs/translation-playbook.md`](./translation-playbook.md)；离线聚合报告见 `worker/src/scripts/exportTranslationReport.ts`。

---

## 用户提问模板

用户通常会这样问：

```
我想检查一个翻译任务的质量。任务 ID：<JOB_ID>（粘贴完整 job JSON）。
```

Agent 收到后：

1. 从 job JSON 提取 `id`、`shopName`、`source`、`target`、`status`、`metrics`、`engineUsage`、`aiModelUsed`、`errorMessage` 等。
2. 若用户只给了 jobId 前缀，用 Blob 脚本或 `exportTranslationReport` 反查 `shopName`。
3. 按下方步骤跑命令、算指标、抽查样本，**并跑 QPS 汇总+出图**，最后输出结构化结论（见「报告输出格式」）。

---

## 环境

| 项 | 值 |
|---|---|
| 项目路径 | `C:\repo\Spark` |
| Blob 检查脚本 | `node scripts/blob-inspect-translation.mjs <jobId>` |
| 离线质量报告 | `cd worker && npx tsx src/scripts/exportTranslationReport.ts <shopName> <taskId>` |
| 质量指标扫描 | `node scripts/qps-quality-scan.mjs <jobId>`（全量算 noSrc/toTarget/fallback/unchanged + METAFIELD 枚举误翻） |
| 大字段诊断 | `node scripts/qps-bigfields.mjs <jobId>`（扫描 init chunk，按字符长度分桶并列出 Top 20 最大字段） |
| QPS 原始日志 | `node scripts/qps-fetch.cjs <jobId>`（Cosmos 原始快照，调试用） |
| QPS 汇总+出图数据 | `node scripts/qps-summary.cjs <jobId>`（分阶段汇总 + 时间序列 + 写 `scripts/qps-data.json`） |
| Azure 连接串 | 项目根 `.env` 中的 `AZURE_BLOB_CONNECTION_STRING` |
| Blob 容器 | `AZURE_BLOB_TRANSLATION_CONTAINER`（默认 `translation-content`） |
| Cosmos 连接 | 项目根 `.env` 中的 `COSMOS_ENDPOINT` / `COSMOS_KEY`（QPS 脚本用） |
| QPS 容器 | `COSMOS_QPS_LOGS_CONTAINER`（默认 `translation_v4_qps_logs`，**7 天 TTL**） |

**前置**：

- Blob 类脚本需 `.env` 的 `AZURE_BLOB_CONNECTION_STRING`。
- QPS 类脚本需 `.env` 的 `COSMOS_ENDPOINT` + `COSMOS_KEY`。
- QPS 日志 **7 天自动过期**：超过 7 天的旧任务查不到速率数据，此时跳过出图并在报告中注明「QPS 日志已过期」。

---

## 分析步骤

### 1. 基础信息（来自 job JSON）

从用户粘贴的 job 或 Cosmos 记录读取：

| 字段 | 路径 | 说明 |
|---|---|---|
| 源语言 | `job.source` | 如 `zh-CN` |
| 目标语言 | `job.target` | 如 `pl`、`en` |
| 状态 | `job.status` | `COMPLETED` / `WRITEBACK_QUEUED` / `TRANSLATING` / `FAILED` 等 |
| Token 用量 | `job.metrics.usedTokens` | 翻译阶段 LLM 累计 token；进行中时 Redis 可能更新更快 |
| 引擎分布 | `job.engineUsage` | 各模型 `units` + `chars`，多引擎路由时看此项 |
| 实际模型 | `job.aiModelUsed` / `job.aiProvider` | worker 写入的真实引擎 |
| 进度计数 | `job.metrics.*` | `translateFallback`、`writebackFailed`、`verifyFailed` 等 |

**状态解读**：

- `COMPLETED`：流水线终态，可做全文质量分析。
- `WRITEBACK_QUEUED` / `WRITING_BACK`：译文已生成，写回 Shopify 中；可分析 Blob 译文质量，但店铺侧可能尚未全部生效。
- `TRANSLATING` / 更早阶段：仅能做部分 chunk 抽查，需注明「任务未完成」。
- `FAILED`：先看 `errorStage` + `errorMessage`，再决定是否仍有部分 Blob 可读。

**Token 对照**：

- 报告主数字：`job.metrics.usedTokens`
- 若与预期偏差大，结合 `engineUsage` 看是否大量字段被 `alreadyInTarget` 跳过（见下文 Token 浪费率）。

---

### 2. Blob 模块概览

```bash
node scripts/blob-inspect-translation.mjs <jobId>
```

关注输出：

- `manifest.json`：`source → target`、各 `MODULE` 的 `totalItems` / `chunks`
- `Available translate chunks`：哪些模块已产出译文
- `Fallbacks`：`translate/fallbacks.json` 条数与样例（引擎回退原文）

无参数运行可列出所有 job，用于匹配 jobId 前缀。

#### 2.1 大字段分布（可选，排查慢翻 / 高 token）

当 TRANSLATE 阶段耗时或 token 异常偏高时，跑：

```bash
node scripts/qps-bigfields.mjs <jobId>
```

输出：

- `total fields`：init 阶段纳入的字段总数
- `size buckets`：按字符长度分桶（`<1k` / `1-3k` / `3-6k` / `6-12k` / `>12k`）
- `fields >=6000 chars`：超长字段数量（易触发长文切片、拉高 LLM 延迟与 token）
- `top 20 largest`：模块、`key`、`resourceId`、字符数

**解读**：`>12k` 或 Top 20 里大量 `body_html` / `METAFIELD` 超长 JSON → 优先抽查这些 resource；与 QPS 图里 TRANSLATE 高延迟、`lq` 偏低对照。

---

### 3. 侧边对照（抽查具体翻译）

```bash
# 某模块全部 chunk 会按脚本逻辑展示；默认看 chunk 0
node scripts/blob-inspect-translation.mjs <jobId> PRODUCT

# 指定第 N 个 chunk（0-based）
node scripts/blob-inspect-translation.mjs <jobId> PRODUCT 0
node scripts/blob-inspect-translation.mjs <jobId> METAFIELD 0
```

对照时重点看：

- `ORIGINAL` vs `TRANSLATED` 语义是否到位
- `status`：`translated` vs `fallback`
- `(not yet translated)`：init 有字段但 translate chunk 缺 key（漏翻 / 进行中）

**抽查建议**（按目标语言与模块）：

| 优先级 | 模块 | 原因 |
|---|---|---|
| 高 | `PRODUCT` | 标题、描述、SEO，商家最关心 |
| 高 | `METAFIELD` | 易误翻 CSS enum、技术 key |
| 中 | `COLLECTION`、`PAGE`、`ARTICLE` | 营销文案 |
| 低 | `MENU`、`LINK` | 短文本，易肉眼校验 |

每个任务至少抽查 **2 个模块 × 各 1 个 chunk**，有问题再加深。

---

### 4. 重点检查指标

以下指标需 Agent **从 Blob 全量或 `exportTranslationReport` 输出统计**，不要编造。

#### 4.1 Token 浪费率：`noSrc / total`

**定义**：

- `total`：所有非 `skip` 字段数（`handle` 等跳过字段不计）
- `noSrc`：原文 `original` **不包含**源语言脚本字符的字段数  
  - 判定逻辑与 `worker/src/services/llmTranslate.ts` 中 `containsSourceScript(text, source)` 一致  
  - 例：source=`zh-CN` 时，原文纯英文标题计为 `noSrc`

**公式**：`浪费率 = noSrc / total`

**阈值**：**> 50%** → 高度怀疑 **店铺实际内容语言与 job.source 不符**（如店铺主数据是英文，却设 source=`zh-CN`）。此时 LLM 仍可能翻译这些英文字段，导致 **token 大量消耗在「本可跳过」的内容**上。

**处理建议**：向用户说明应把 source 改为与实际主内容一致的语言，或确认店铺是否混用多语言。

---

#### 4.2 目标语言正确率：`toTarget / needTranslate`

> 用户口语可能说 `toPl/hasSrc`（波兰语场景）；通用化为 `toTarget / needTranslate`。

**定义**（按 `job.target` 调整脚本特征）：

- `needTranslate`：`noSrc` 的补集 ∩ 非 skip —— 即原文**含源语言脚本**、确实需要翻译的字段数（`hasSrc`）
- `toTarget`：在 `needTranslate` 中，译文**呈现目标语言特征**的字段数  
  - 判定与 `alreadyInTarget(translated, source, target)` 的 target 侧逻辑一致  
  - 例：target=`pl` 时，译文含波兰语变音符号 `ąćęłńóśźż` 等计为命中  
  - 例：target=`en` 时，译文为拉丁字母且无明显源语言脚本计为命中

**公式**：`正确率 = toTarget / needTranslate`（`needTranslate = 0` 时单独说明「无可译源语言内容」）

**阈值**：**< 90%** → 怀疑 **LLM 翻到了错误语言**（如目标波兰语却输出英语）、或大量 unchanged/fallback。

**交叉验证**：

- `metrics.translateFallback` 高 → 占位符损坏或引擎失败
- `translationReport` 的 `unchanged` 高 → 疑似漏翻或已是目标语

---

#### 4.3 Fallback 数量

**来源 1**：job JSON `metrics.translateFallback`

**来源 2**：`blob-inspect` 输出的 `Fallbacks (translated but kept original value)` 列表

**来源 3**：`exportTranslationReport` 的 `totals.fallback`

**含义**：引擎失败或占位符哨兵被破坏时，字段回退原文，`status=fallback`。常见根因：

- 占位符污染（`{{ quantity }}` 被模型改写）
- JSON 解析失败重试耗尽
- HTML 节点还原失败

**阈值**：无绝对值；占可译字段 **> 5%** 需列出 top 模块/key 并建议查 prompt 或术语表。

---

#### 4.4 `(not yet translated)` 数量

运行 `blob-inspect` 侧边对照，统计输出中 `TRANSLATED: (not yet translated)` 行数。

**含义**：init chunk 有该 key，但 translate chunk 缺失 —— 漏翻、任务中断、或 chunk 未写完。

**阈值**：终态 `COMPLETED` 任务应为 **0**；非 0 则标为 **严重问题**。

---

#### 4.5 METAFIELD 过度翻译

重点检查 `METAFIELD` 模块中：

- **CSS / 布局 enum**：`center`、`flex`、`left`、`right`、`space-between` 等是否被译成目标语单词
- **技术标识**：color key、font family 名、JSON 配置值是否应保持英文
- **Shopify 保留值**：纯数字、hex 色值、`#` 开头 token

抽查命令：

```bash
node scripts/blob-inspect-translation.mjs <jobId> METAFIELD 0
```

若 enum 被翻译，在报告中列举 `resourceId` + `key` + 原文/译文对照，并建议加入术语表 `doNotTranslate` 或扩展 `SKIP_KEYS` / 字段过滤。

---

### 5. 离线全量报告（推荐终态任务使用）

```bash
cd worker
npx tsx src/scripts/exportTranslationReport.ts <shopName> <taskId>
```

输出目录（默认 `worker/translation-reports/<shop>-<taskId>/`）：

- `report.json`：全字段聚合 + 质量红旗（`fallback`、`unchanged`、`empty`、`length-ratio`、`html-tag-mismatch`、`placeholder-loss`）
- `<MODULE>.jsonl`：该模块每条 before/after

用 `report.json` 的 `flags` 数组做问题清单，用 `samples` 做报告附录样例。

---

### 6. QPS 速率分析与出图（**每次质量检查必做**）

> 数据来自 Cosmos `translation_v4_qps_logs`：**每个 job 一条文档**（`id = jobId`），`windows[]` 按 30s / 阶段切换 / 收尾追加快照。**每次检查翻译质量都要顺带跑这一步并给用户画一张 QPS 图**（除非日志已过 7 天 TTL）。

#### 6.1 拉数据

```bash
# 分阶段汇总（INIT/TRANSLATE/WRITEBACK/VERIFY）+ 时间序列，并写 scripts/qps-data.json
node scripts/qps-summary.cjs <jobId>

# 需要原始 job 文档（含 windows[]）排查时
node scripts/qps-fetch.cjs <jobId>
```

`qps-summary.cjs` 输出两块：

- `=== PER STAGE ===`：每阶段 `windows / totalDur / shopifyCalls(peak,429) / llmCalls(peak) / tokens / avgLat / throttle / err / bucketMin`
- `=== TIMESERIES ===`：逐快照 CSV（`t,stage,sQps,sCalls,s429,bucket,lQps,lCalls,lTok,lLatMs,lConc,lThr,lErr`）

并把**出图就绪的紧凑数组**写到 `scripts/qps-data.json`（字段：`t`秒 / `st`阶段 / `sq`Shopify QPS / `lq`LLM QPS / `tok` / `lat`ms / `conc`并发 / `bkt`桶余量 / `err`）。

#### 6.2 出图（用 visualize widget）

读 `scripts/qps-data.json`，用图表 widget 画**双轴时间线**：

- X 轴：分钟（`t/60`）
- 左 Y 轴：`sq`（Shopify calls/s，虚线）+ `lq`（LLM calls/s，实线）
- 右 Y 轴：`conc`（LLM 并发）
- 背景按 `st` 分四个阶段色带（INIT / TRANSLATE / WRITEBACK / VERIFY）
- 顶部指标卡：总时长、LLM 峰值、Shopify 峰值、429 次数

#### 6.3 从 QPS 能读出的结论（写进报告）

| 信号 | 看哪个字段 | 含义 |
|---|---|---|
| 是否被限流 | `s429` / `throttle` | >0 说明撞到 Shopify/LLM 限速；全 0 = 余量充足 |
| 翻译是否延迟瓶颈 | `avgLat` | 单请求 40s+ 且 `lq` 长期很低 = 卡在每个请求的延迟，不是数量 |
| 并发是否喂得满 | `conc` vs 实际 `lCalls` | 允许并发远高于在途请求数 = 调度喂不饱，可提速 |
| Shopify 写回压力 | `bucket`（桶余量） | 逼近 0 但无 429 = 安全；触 0 + 429 = 需降并发 |
| 阶段耗时占比 | PER STAGE 的 `totalDur` / 时间轴跨度 | 定位最大头阶段（通常 TRANSLATE） |

> 注意：PER STAGE 的 `totalDur` 是「有活动的窗口时长之和」，不是墙钟；阶段墙钟用时间轴里该阶段 `t` 的首尾差。任务级真实墙钟另见 job 的 `stageTimings`（worker 记录的每阶段 start/end）。

---

## 报告输出格式

Agent 完成分析后，用以下结构回复用户（中文）：

```markdown
## 翻译质量报告 — <jobId 前 8 位>…

### 基础信息
- 店铺 / 语言 / 状态 / usedTokens
- 引擎：aiModelUsed (aiProvider)，engineUsage 摘要

### 指标摘要
| 指标 | 值 | 判定 |
|------|-----|------|
| Token 浪费率 noSrc/total | xx% | 正常 / 偏高(>50%) |
| 目标语正确率 toTarget/needTranslate | xx% | 正常 / 偏低(<90%) |
| fallback | n (x%) | |
| not yet translated | n | |
| writebackFailed / verifyFailed | | |

### 问题与样例
- 分条列出：模块、resourceId、key、原文→译文、问题类型
- METAFIELD enum 误翻单独一小节（如有）

### QPS / 速率（附图）
- 嵌入 QPS 双轴时间线图（见 6.2）
- 一句话结论：是否被限流（429/throttle）、瓶颈在延迟还是数量、并发是否喂满、各阶段耗时占比
- 若 QPS 日志已过 7 天 TTL：注明「速率数据已过期，跳过出图」

### 结论与建议
- 一句话总评：可发布 / 需返工 / 任务未完成
- 可操作建议：改 source、补术语表、重跑 writeback、调模型等
```

---

## 快速命令备忘

```bash
# 列出所有 job
node scripts/blob-inspect-translation.mjs

# 任务概览
node scripts/blob-inspect-translation.mjs <jobId>

# 侧边对照
node scripts/blob-inspect-translation.mjs <jobId> PRODUCT 0
node scripts/blob-inspect-translation.mjs <jobId> METAFIELD 0

# 全量质量报告（需 shopName）
cd worker && npx tsx src/scripts/exportTranslationReport.ts <shopName> <taskId>

# 质量指标一把梭（noSrc/toTarget/fallback/unchanged + 枚举误翻）
node scripts/qps-quality-scan.mjs <jobId>

# 大字段分布（init 阶段 Top 20 最大字段，排查慢翻/高 token）
node scripts/qps-bigfields.mjs <jobId>

# QPS：分阶段汇总 + 写 scripts/qps-data.json（再用图表 widget 出图）
node scripts/qps-summary.cjs <jobId>
node scripts/qps-fetch.cjs <jobId>   # 原始快照，排查用
```

---

## Agent 执行清单

- [ ] 解析用户提供的 job JSON，记录 source/target/status/metrics
- [ ] 运行 `blob-inspect-translation.mjs <jobId>` 拿 manifest 与 fallbacks
- [ ] 抽查至少 2 个模块的 chunk 对照
- [ ] 终态任务优先跑 `exportTranslationReport` 拿全量 flags
- [ ] 计算 `noSrc/total` 与 `toTarget/needTranslate`（跑 `qps-quality-scan.mjs`，勿目测）
- [ ] TRANSLATE 慢或 token 偏高时，跑 `qps-bigfields.mjs` 看大字段分布
- [ ] 检查 METAFIELD 与技术字段误翻
- [ ] **跑 `qps-summary.cjs <jobId>` 并用 `scripts/qps-data.json` 给用户画 QPS 双轴图**（日志过 7 天则注明跳过）
- [ ] 按「报告输出格式」给用户结论（含 QPS 附图小节），标明任务是否已完成
