# 翻译任务质量检查指南

**用途**：当用户说「检查翻译任务质量」「这次翻译质量怎么样」并附上 **任务 ID** 和/或 **完整 job JSON** 时，Agent 必须按本文档执行分析，不得凭印象猜测。

**相关文档**：流水线与存储结构见 [`docs/TRANSLATION_AGENT.md`](./TRANSLATION_AGENT.md)；离线聚合报告见 `worker/src/scripts/exportTranslationReport.ts`。

---

## 用户提问模板

用户通常会这样问：

```
我想检查一个翻译任务的质量。任务 ID：<JOB_ID>（粘贴完整 job JSON）。
```

Agent 收到后：

1. 从 job JSON 提取 `id`、`shopName`、`source`、`target`、`status`、`metrics`、`engineUsage`、`aiModelUsed`、`errorMessage` 等。
2. 若用户只给了 jobId 前缀，用 Blob 脚本或 `exportTranslationReport` 反查 `shopName`。
3. 按下方步骤跑命令、算指标、抽查样本，最后输出结构化结论（见「报告输出格式」）。

---

## 环境

| 项 | 值 |
|---|---|
| 项目路径 | `C:\repo\Spark` |
| Blob 检查脚本 | `node scripts/blob-inspect-translation.mjs <jobId>` |
| 离线质量报告 | `cd worker && npx tsx src/scripts/exportTranslationReport.ts <shopName> <taskId>` |
| Azure 连接串 | 项目根 `.env` 中的 `AZURE_BLOB_CONNECTION_STRING` |
| Blob 容器 | `AZURE_BLOB_TRANSLATION_CONTAINER`（默认 `translation-content`） |

**前置**：确保 `.env` 已配置 `AZURE_BLOB_CONNECTION_STRING`，否则脚本会报错退出。

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
```

---

## Agent 执行清单

- [ ] 解析用户提供的 job JSON，记录 source/target/status/metrics
- [ ] 运行 `blob-inspect-translation.mjs <jobId>` 拿 manifest 与 fallbacks
- [ ] 抽查至少 2 个模块的 chunk 对照
- [ ] 终态任务优先跑 `exportTranslationReport` 拿全量 flags
- [ ] 计算 `noSrc/total` 与 `toTarget/needTranslate`（用 `llmTranslate.ts` 脚本逻辑，勿目测）
- [ ] 检查 METAFIELD 与技术字段误翻
- [ ] 按「报告输出格式」给用户结论，标明任务是否已完成
