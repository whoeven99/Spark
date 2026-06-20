# 翻译功能完整指南

**改动翻译相关代码前必读本文档。** 覆盖范围：页面、API、Worker 四阶段流水线、存储结构、状态机、恢复机制。

---

## 整体架构

```
[用户] 在聊天页 或 翻译管理页 发起任务
          ↓
[App]  POST /api/translate/v4/tasks
          写 Cosmos (status=INIT_QUEUED) + lpush Redis hint
          ↓
[Worker] scheduler.ts 每 30s 轮询，每 5min 重置僵死任务
    ├─ initWorker     INIT_QUEUED     → INITIALIZING   → TRANSLATE_QUEUED
    ├─ translateWorker TRANSLATE_QUEUED → TRANSLATING   → WRITEBACK_QUEUED
    ├─ writebackWorker WRITEBACK_QUEUED → WRITING_BACK  → VERIFY_QUEUED / COMPLETED
    └─ verifyWorker   VERIFY_QUEUED   → VERIFYING      → COMPLETED
```

---

## 文件地图

### App 侧

| 文件 | 职责 |
|---|---|
| `app/routes/app.translation-v4.tsx` | 翻译页面路由，loader 加载任务列表 |
| `app/routes/page/TranslationV4Page.tsx` | 翻译管理页 UI（任务列表、进度轮询、操作） |
| `app/routes/component/translation/TranslationTaskChatCard.tsx` | 聊天内嵌创建任务的表单卡片 |
| `app/lib/translationTaskFormPayload.ts` | 聊天卡片 payload 类型 + coerce 工具 |
| `app/routes/api.translate.v4.tasks.ts` | GET 列表 / POST 创建任务 |
| `app/routes/api.translate.v4.task-progress.ts` | GET 任务进度（Cosmos + Redis 合并） |
| `app/routes/api.translate.v4.task-action.ts` | POST 任务控制（cancel / pause / resume） |
| `app/server/translation/v4/types.ts` | 全部类型定义（状态枚举、Job 结构、Metrics） |
| `app/server/translation/v4/cosmosV4Store.server.ts` | App 侧 Cosmos 操作（读/写/claim） |
| `app/server/translation/translateBlobStore.server.ts` | App 侧 Azure Blob 工具函数 |
| `app/server/translation/translateRedis.server.ts` | App 侧 Redis 单例 |

### Worker 侧（`worker/src/`）

| 文件 | 职责 |
|---|---|
| `index.ts` | 入口，注册异常处理，调 startScheduler |
| `scheduler.ts` | 30s 轮询驱动 init/translate/writeback/verify/**analysis** Worker；5min 重置僵死任务 |
| `services/cosmosV4.ts` | Worker 侧 Cosmos 操作（与 App 侧逻辑一致，独立副本） |
| `services/cosmosAnalysis.ts` | 商店扫描分析任务 Cosmos（`shop_analysis_jobs`） |
| `services/blobV4.ts` | Worker 侧 Blob 读写（JSON 序列化） |
| `services/redisV4.ts` | Worker 侧 Redis，含 hint 队列和 progress hash |
| `services/shopifyFetch.ts` | Shopify GraphQL 拉取可翻译资源 + 写回翻译 |
| `services/llmTranslate.ts` | 翻译引擎：LLM（OpenAI）或 Google Translate |
| `workers/initWorker.ts` | 阶段 1：从 Shopify 拉取原文，写 Blob |
| `workers/translateWorker.ts` | 阶段 2：调 LLM 翻译，写 Blob |
| `workers/writebackWorker.ts` | 阶段 3：把译文写回 Shopify，支持断点续传 |
| `workers/verifyWorker.ts` | 阶段 4：重试 writeback 失败的资源 |
| `workers/analysisWorker.ts` | 商店扫描分析：拉取源语言内容 → LLM 生成档案与术语草稿 |

---

## 状态机

```
CREATED
  → INIT_QUEUED        (createV4Job 写入时的初始状态)
    → INITIALIZING     (initWorker claim)
      → INIT_DONE      (init 完成，仅中间态，立即流转)
        → TRANSLATE_QUEUED
          → TRANSLATING
            → TRANSLATE_DONE  (中间态，立即流转)
              → WRITEBACK_QUEUED
                → WRITING_BACK
                  → VERIFY_QUEUED   (有 writeback 失败时)
                    → VERIFYING
                      → COMPLETED
                  → COMPLETED       (无失败时直接完成)

任意阶段均可流转到:
  FAILED     (errorStage="INIT"|"TRANSLATE"|"WRITEBACK"|"VERIFY")
  PAUSED     (用户暂停, errorStage 记录当前阶段)
  CANCELLED  (用户取消)
```

**活跃状态**（`ACTIVE_V4_STATUSES`）：所有 `_QUEUED`、processing、`_DONE` 状态，页面会对这些状态开启 3s 进度轮询。

**终态**（`TERMINAL_V4_STATUSES`）：`COMPLETED`、`FAILED`、`CANCELLED`。

---

## 四阶段 Worker 详解

### 阶段 1 — Init Worker

**状态迁移**：`INIT_QUEUED → INITIALIZING → TRANSLATE_QUEUED`

**执行流程**：
1. claim job（乐观锁，etag 防并发）
2. 设 `blobPrefix = "tasks/v4/{shopName}/{jobId}"`
3. 对每个 module 拉取可翻译资源（`worker/src/services/shopifyFetch.ts`），按 **数量(`chunkSize=50`) + 字符总量(`MAX_CHUNK_CHARS`,默认 50000)双限制**切 chunk(谁先到达先切；单个资源保持完整,超限则独占一个 chunk),写 Blob：
   - **PRODUCT / ARTICLE / PAGE / COLLECTION**：先按硬编码 Shopify Admin `query` 分页拉资源 GID，再 `translatableResourcesByIds` 取字段
   - **其他模块**：`translatableResources(resourceType, first, after)` 分页
   - `{blobPrefix}/init/{MODULE}/chunk-{00}.json` → `TranslatableResource[]`
4. 写 manifest：`{blobPrefix}/manifest.json`
5. 更新 Cosmos：`status=TRANSLATE_QUEUED`，metrics 初始化
6. `lpush translate:v4:hint:translate`

**Init 模块 query（硬编码，对齐 Spring 默认筛选）**：

| 模块 | Shopify query |
|------|----------------|
| PRODUCT | （无，拉全部含草稿） |
| COLLECTION | （无，拉全部含草稿） |
| PAGE | （无，拉全部含草稿） |
| ARTICLE | （无，拉全部含草稿） |

**创建任务互斥**：`POST /api/translate/v4/tasks` 在写入 Cosmos 前检查同 `shopName + source + target` 是否已有 `ACTIVE_V4_STATUSES` 中的任务；有则返回 **409**。`PAUSED` / `COMPLETED` / `FAILED` / `CANCELLED` 允许新建。

**Blob — init chunk 结构**：
```json
[
  {
    "resourceId": "gid://shopify/Product/123",
    "fields": [
      { "key": "title", "value": "原文标题", "digest": "sha256hash" }
    ]
  }
]
```

---

### 阶段 2 — Translate Worker

**状态迁移**：`TRANSLATE_QUEUED → TRANSLATING → WRITEBACK_QUEUED`

**执行流程**：
1. claim job
2. 对每个 module，遍历 `init/{MODULE}/` 下所有 chunk
3. **断点续传**：若对应 `translate/{MODULE}/chunk-{nn}.json` 已存在，跳过
4. 调 `translateBatch(fields, source, target, aiModel, testMode)` 翻译
5. 写 translate chunk：`{blobPrefix}/translate/{MODULE}/chunk-{nn}.json`
6. 更新 Cosmos：`status=WRITEBACK_QUEUED`
7. `lpush translate:v4:hint:writeback`

**Blob — translate chunk 结构**：
```json
[
  {
    "resourceId": "gid://shopify/Product/123",
    "translations": [
      { "key": "title", "originalValue": "原文", "translatedValue": "Translated", "digest": "sha256hash", "status": "translated" }
    ]
  }
]
```

**翻译引擎路由**：
- `testMode=true` → 直接返回 `原文 - test`（跳过 API 调用）
- `aiModel="google-translate"` → Google Translate API
- 其他 → 走 DeepSeek `chat/completions`（`DEEPSEEK_MODEL`，默认 `deepseek-chat`），`temperature=0.1`

**Chunk 级批量 + 去重**（`translateResources`）：
- worker 现在**每个 chunk 调一次 `translateResources`**(不再逐 resource),把整 chunk 所有待翻单元(短字段 / HTML 文本节点 / 长文切片)**跨资源合并**后按引擎大批翻译,大幅减少调用次数(对慢的 DeepSeek 尤其关键)。
- **去重**:同一 chunk 内相同 `(引擎顺序, 文本)` 只翻一次,所有出现处复用(如重复的 "Shipping Protection")。
- 仍受 `MAX_CHARS_PER_BATCH=5000` 限制分批;批间 heartbeat 防僵死;断点续传仍按 chunk 落盘。
- `translateBatch`(单资源)保留为 `translateResources` 的薄封装。

**引擎路由(成本分级 + 失败级联)**（`engineOrderFor` / `translateItemsRouted`）：

两个引擎家族:**llm**(DeepSeek)和 **google**(Google Translate)。是否纳入候选按 env 探测(配了对应 key 才算可用)。

- `aiModel="google-translate"` → **锁定 Google**
- 其他 → **成本分级自动路由**:
  - 短/简单字段(plain 且 `<80` 字符、非 `meta_description`)→ **Google 优先**,失败级联 DeepSeek
  - 富文本(html、`meta_description`、长 plain)→ **DeepSeek 优先**,失败级联 Google
- **失败级联**:主引擎失败(JSON 坏 / API 错 / 占位符损坏)→ 自动换候选列表里的下一个引擎;全失败才回退原文标 `fallback`。

> 占位符掩码、实体清理对**所有引擎**生效(在 `translateItemsRouted` 统一处理)。TM 缓存按字段 tier 的主引擎模型名隔离。job 的 `aiModel="google-translate"` 仍向后兼容锁 Google。

**源语言自动识别**（`buildSystemPrompt` / `callGoogleTranslate`）：
- 翻译**不再写死源语言**,只认目标语言。LLM prompt 改为"自动识别输入语言 → 翻成 target,无论输入是什么语言都翻;已是 target 的原样返回";Google 请求省略 `source` 让其自动检测。
- 修复多语言目录(英/西/葡/韩/日 混装)被当成 zh-CN 而**原样漏翻**的问题。
- 配套:TM 缓存 key 版本从 `tm:v4` 升到 `tm:v5`,丢弃之前被"漏翻 passthrough"冻住的旧缓存。

**翻译记忆（TM 缓存）**（`worker/src/services/translationMemory.ts`）：
- 翻译前按 `tm:v4:{shop}:{target}:{model}:{digest}` 查 Redis，命中则跳过引擎调用；翻译成功后写回缓存。
- key 用 Shopify 的字段 `digest`（源内容哈希）做天然失效：源文改动 → digest 变 → 自动失配重译。
- 仅缓存成功译文（fallback 不缓存）；value 超 8KB 不缓存；`skip` 字段不查缓存。
- 关闭：`TRANSLATION_TM_DISABLED=true`；TTL：`TRANSLATION_TM_TTL_DAYS`（默认 60 天）。

**Prompt 结构（缓存友好）**（`callLLMOnce` / `buildSystemPrompt`）：
- 拆成 `system`（静态指令 + 术语表，对同一 source/target/glossary 字节级稳定）+ `user`（仅待翻译 JSON payload）。
- 变动的待翻译值只出现在 user 消息末尾，使 OpenAI 自动前缀缓存能命中（同一 job 的连续 batch 受益）。
- system 还要求保留占位符/变量（`{{name}}`、`%s`、`{0}`）。

**术语表注入**（`worker/src/services/glossary.ts`）：
- 从 Blob `glossary/{shop}.json` 读取，按 target 过滤后注入 system 前缀；缺失则不注入。
- 行内确定性排序保证前缀字节稳定（不破坏缓存）。进程内缓存 5 分钟，避免每个 batch 读 Blob。
- 格式：`{ terms: [{ source, translations: {<locale>: "..."}, doNotTranslate?, note? }] }`；`doNotTranslate` 对所有语言生效。
- **写入入口（admin/app 端）尚未实现**，当前需手动写 Blob；后续 PR 补管理界面。

**占位符保护**（`maskPlaceholders` / `restorePlaceholders`）：
- 送 LLM 前把变量替换成哨兵 `⟦n⟧`，翻完还原——防止模型翻译变量名（如 `{{quantity}}`→`{{quantité}}`、`[qty]`→`[qté]` 会破坏 Shopify 变量替换）。
- 覆盖：`{{ x }}`(Liquid)、`%{x}`(Ruby)、`${x}`、`%s/%d/%1$s`、`{0}`、`[name]`（**不含** markdown 链接 `[text](url)`）。
- 还原前校验哨兵是否完好；若模型把哨兵搞坏 → 回退原文(占位符至少保持完整)并标记 `fallback`，避免静默损坏。

**HTML 实体/空白清理**（`callLLM` / `translateHtmlLLM`）：
- prompt 要求模型输出字面字符、不要 HTML 转义引号/撇号、不增删首尾空白。
- 防御性后处理:对 LLM 输出只反转义 `&#39;/&apos;/&quot;/&#34;` → `'`/`"`（**不动** `&amp;/&lt;/&gt;`，保证 HTML 合法）；HTML 文本节点还原前 `trim()`，避免模型注入的首尾空白叠加到模板已保留的空白上。

**LLM 重试与回退**（`callLLM`）：
- LLM 返回 JSON 解析失败、或漏返回部分 key 时，只对未解析的 key 重试（最多 2 次，共 3 次尝试）。
- 全部尝试后仍未解析的 key → 回退原文，`status="fallback"`。
- 每个字段结果带 `status: "translated" | "fallback"`。一个 plain 字段若有任一切分片段回退，则整字段标记 fallback。

**字段分类**（`classifyField(key)`）：
- `skip`：`handle`（Shopify URL slug，跳过不翻）
- `html`：`body_html`、`summary_html`、`content`、以 `_html` 结尾 → 先提取文本节点，翻译后还原
- `plain`：其余字段

**批量策略**：`MAX_CHARS_PER_BATCH=5000`，超 `LONG_TEXT_THRESHOLD=4000` 的长文本按段落/句子拆分。

---

### 阶段 3 — Writeback Worker

**状态迁移**：`WRITEBACK_QUEUED → WRITING_BACK → VERIFY_QUEUED`

**执行流程**：
1. claim job
2. 读 `{blobPrefix}/writeback/progress.json`（已写回的 resourceId 集合，断点续传用）
3. 对每个 translate chunk 中的每个 resource（未在 writtenSet 中）：
   - 过滤：`translatedValue.trim()` 非空的字段（与原文相同也写回，避免目标语言栏空白）
   - 调 Shopify `translationsRegister` mutation（**同一 `resourceId` 一次传多条 `TranslationInput`**；字段过多时按 `WRITEBACK_TRANSLATIONS_BATCH` 默认 100、上限 250 分批）
   - 成功：`userErrors` 为空且 mutation 返回的 `translations` 覆盖全部 key
   - 成功：加入 writtenSet，`writebackDone++`
   - 失败：加入 failedResources，`writebackFailed++`
   - 每 20 条资源持久化一次 `progress.json`（断点续传检查点）
4. 写 `writeback/failed.json`（可为空数组），**一律** `status=VERIFY_QUEUED`，`lpush hint:verify`

**Shopify API**（[translationsRegister](https://shopify.dev/docs/api/admin-graphql/latest/mutations/translationsRegister)）：
- 同一 resource 支持批量注册多个 `key`（`translations: [TranslationInput!]!`）
- GraphQL 输入数组通常上限 **250** 条/次；单 resource 还可能触发 `TOO_MANY_KEYS_FOR_RESOURCE`
- 需 `write_translations` scope；`translatableContentDigest` 必须与 init 阶段 digest 一致

---

### 阶段 4 — Verify Worker

**状态迁移**：`VERIFY_QUEUED → VERIFYING → COMPLETED`

**目的**：防止 `translationsRegister` 返回成功但店铺侧未真正落库（历史上有过「API 无 userErrors 但译文未生效」的情况）。

**执行流程**：
1. claim job
2. 汇总待校验资源：`writeback/progress.json` 中已写回的资源（从 translate blob 取期望译文）+ `writeback/failed.json` 中写回失败的资源
3. 对每个资源 **`translatableResource` 读回**目标 locale 的 `translations`，与期望逐 key 比对（trim 后相等；`outdated=true` 视为未生效）
4. 不一致 → 仅对 mismatch 的 key **重试 `registerTranslations`** → 再次读回比对
5. 统计 `verifyDone` / `verifyFailed`；若 `writebackDone=0` 且全部写回失败 → `FAILED`（`errorStage=WRITEBACK`），否则 `COMPLETED`（部分失败见 metrics）

---

## Blob Storage 路径

| 路径 | 内容 | 写入阶段 |
|---|---|---|
| `tasks/v4/{shop}/{id}/manifest.json` | `{taskId, shopName, source, target, modules:{[mod]:{totalItems,chunks}}, createdAt}` | Init |
| `tasks/v4/{shop}/{id}/init/{MODULE}/chunk-{nn}.json` | `TranslatableResource[]` | Init |
| `tasks/v4/{shop}/{id}/translate/{MODULE}/chunk-{nn}.json` | `[{resourceId, translations:[...]}]` | Translate |
| `tasks/v4/{shop}/{id}/translate/fallbacks.json` | `[{resourceId, module, key}]`（回退原文的字段，供 UI 展示） | Translate（有 fallback 时） |
| `glossary/{shop}.json` | `{terms:[{source, translations, doNotTranslate?, note?}]}`（按店术语表，翻译时注入 prompt） | 手动/后续管理界面 |
| `tasks/v4/{shop}/{id}/writeback/progress.json` | `{written: resourceId[]}` | Writeback（每 20 条更新） |
| `tasks/v4/{shop}/{id}/writeback/failed.json` | `[{resourceId, translations:TranslationInput[]}]` | Writeback |

---

## Redis Keys

| Key | 类型 | 内容 | 用途 |
|---|---|---|---|
| `translate:v4:hint:init` | List | `{taskId, shopName}` | 通知 initWorker 有新任务 |
| `translate:v4:hint:translate` | List | `{taskId, shopName}` | 通知 translateWorker |
| `translate:v4:hint:writeback` | List | `{taskId, shopName}` | 通知 writebackWorker |
| `translate:v4:hint:verify` | List | `{taskId, shopName}` | 通知 verifyWorker |
| `translate:v4:progress:{taskId}` | Hash | 11 个指标计数器 + `currentModule` + `updatedAt` | 实时进度（TTL 7 天） |

**Progress hash 字段**：`initTotal`, `initDone`, `translateTotal`, `translateDone`, `translateFailed`, `translateFallback`, `translateUnitTotal`, `translateUnitDone`, `writebackTotal`, `writebackDone`, `writebackFailed`, `verifyTotal`, `verifyDone`, `verifyFailed`, `currentModule`, `updatedAt`

**节点级进度**：translate 进度有两套计数 —— 资源级(`translateDone/translateTotal`)和**节点级**(`translateUnitDone/translateUnitTotal`,HTML 文本节点 + plain 切片,init 阶段算出总数)。worker **每个 batch 都写一次 Redis 进度**(便宜、平滑),Cosmos 心跳节流(~30s)、指标每 chunk 落盘。前端翻译条用节点驱动填充、标签同时显示"资源 a/b · 节点 x/y";老任务无节点数时自动回退资源数。

---

## Cosmos DB Schema

- **Database**：`translation`（env `COSMOS_TRANSLATION_DATABASE_ID`）
- **Container**：`translation_v4_jobs`（env `COSMOS_TRANSLATION_V4_JOBS_CONTAINER`）
- **Partition key**：`shopName`
- **Item id**：UUID（jobId）

**`TranslationV4Job` 字段**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | UUID，Cosmos item id = jobId |
| `shopName` | string | Partition key，如 `xxx.myshopify.com` |
| `shopifyAccessToken` | string | 执行 Shopify GraphQL 的 token |
| `source` | string | 源语言，如 `zh-CN` |
| `target` | string | 目标语言，如 `en` |
| `modules` | TranslationV4Module[] | 待翻译模块 |
| `aiModel` | string | **请求的**翻译模型（创建任务时填，默认 `DEEPSEEK_MODEL` 或 `deepseek-chat`） |
| `aiModelUsed` | string \| null | **实际使用的**模型（worker 翻译完写入真实值，如 `deepseek-v4-flash`、`google-translate`、testMode 时 `test`） |
| `aiProvider` | string \| null | 实际引擎：`deepseek` / `azure` / `openai` / `google` / `auto`(路由) / `test` |
| `engineUsage` | `{[model]:{units,chars}}` \| null | **按引擎汇总**:每个引擎/模型翻译了多少 units(去重后的文本单元)+ chars(源字符)。多引擎路由时看这个,如 `{"google-translate":{units:120,chars:3400},"deepseek-v4-pro":{units:38,chars:51000}}` |
| `limitPerType` | number | 每个模块最多翻译条目数（1–500） |
| `isCover` | boolean | 是否覆盖已有译文 |
| `isHandle` | boolean | 是否翻译 handle 字段 |
| `testMode` | boolean | 测试模式（跳过实际翻译，返回原文） |
| `status` | TranslationV4Status | 当前状态 |
| `claimedBy` | string \| null | 持有该任务的 Worker ID |
| `claimedAt` | string \| null | claim 时间 ISO 8601 |
| `lastHeartbeat` | string \| null | Worker 最近心跳时间 |
| `blobPrefix` | string | Blob 路径前缀 `tasks/v4/{shop}/{id}` |
| `metrics` | TranslationV4Metrics | 各阶段进度计数 |
| `errorMessage` | string \| null | 错误详情 |
| `errorStage` | string \| null | `INIT`/`TRANSLATE`/`WRITEBACK`/`VERIFY` |
| `createdBy` | string | 创建来源，如 `api` |
| `createdAt` / `updatedAt` | string | ISO 8601 |

---

## API 端点

### POST `/api/translate/v4/tasks` — 创建任务

**请求 body**（均可选，除 `target`）：
```json
{
  "target": "en",
  "source": "zh-CN",
  "modules": ["PRODUCT", "COLLECTION", "PAGE", "ARTICLE"],
  "limitPerType": 20,
  "isCover": false,
  "isHandle": false,
  "testMode": false,
  "aiModel": "deepseek-chat"
}
```

- `limitPerType` 上下限：1–500，默认 20
- `aiModel` 默认取 `DEEPSEEK_MODEL` 环境变量，再退回 `deepseek-chat`
- 创建后同步 `lpush translate:v4:hint:init`

### GET `/api/translate/v4/tasks?shopName=` — 列表

返回 `{ ok: true, jobs: TranslationV4Job[] }`，按 `createdAt DESC` 排序，最多 30 条。

### GET `/api/translate/v4/task-progress?taskId=&shopName=` — 进度

同时查 Cosmos + Redis，Redis 计数器优先（实时性更高），Cosmos 字段作兜底。
返回完整 job 对象 + 合并后 metrics + `currentModule` + `progressUpdatedAt`。

### POST `/api/translate/v4/task-action` — 控制

```json
{ "taskId": "uuid", "shopName": "xxx.myshopify.com", "action": "cancel|pause|resume" }
```

| action | 效果 |
|---|---|
| `cancel` | `status=CANCELLED`，`claimedBy=null` |
| `pause` | `status=PAUSED`，`errorStage=当前阶段`，`claimedBy=null` |
| `resume` | 根据 `errorStage` 恢复到对应 `_QUEUED`，推 Redis hint |

**resume 状态映射**（`errorStage → 恢复 status`）：
- `TRANSLATE` → `TRANSLATE_QUEUED`
- `WRITEBACK` → `WRITEBACK_QUEUED`
- `VERIFY` → `VERIFY_QUEUED`
- 其他 / 无 → `INIT_QUEUED`

---

## 翻译质量报告（离线分析）

`worker/src/scripts/exportTranslationReport.ts`：读取某任务 `translate/` 下的 before/after blob，生成字段清单 + 质量红旗报告。

```bash
# 需配置 Blob env（同 worker）
cd worker && npx tsx src/scripts/exportTranslationReport.ts <shopName> <taskId> [outPath]
```

输出：每模块的字段 key 清单（classify、条数、平均长度、fallback/unchanged/empty 计数）+ 质量红旗（fallback、疑似漏翻 unchanged、空译文、长度比异常、HTML 标签数不一致、占位符丢失）+ 每类抽样。分析逻辑在 `worker/src/services/translationReport.ts`（纯函数，已覆盖单测）。

**线上质量测试流程**：设 `WORKER_STAGES=init,translate` 跑任务（不写回店铺）→ 跑本脚本读 blob → 据报告优化 prompt/过滤/术语表。

---

## 僵死任务重置

`scheduler.ts` 每 **5 分钟**调用 `resetStaleJobs(staleMinutes=10)`：

对处于 processing 状态（`INITIALIZING` / `TRANSLATING` / `WRITING_BACK` / `VERIFYING`）的任务，若 `lastHeartbeat < now - 10min`，则重置回对应 `_QUEUED` 状态，清空 `claimedBy`，Worker 下次轮询时重新认领。

---

## Worker 调度机制

Worker 认领任务的两条路径（优先级从高到低）：
1. **Hint 队列**（Redis lpop）：任务创建/流转时立即推送，Worker 优先消费，延迟最低
2. **Cosmos 轮询兜底**（`findPendingJobs(status, limit=3)`）：每 30s 兜底扫描，防止 hint 丢失

**并发安全**：`claimJob` 使用 Cosmos etag 乐观锁，同一任务只有一个 Worker 能 claim 成功，其余返回 null 后直接跳过。

---

## 支持的翻译模块

```typescript
type TranslationV4Module =
  | "PRODUCT" | "COLLECTION" | "PAGE" | "ARTICLE"
  | "METAOBJECT" | "ONLINE_STORE_THEME"
```

---

## 聊天内嵌入口（Chat Card）

`TranslationTaskChatCard` 组件由 AI Agent 通过 `open_translation_task_form` 工具触发，渲染在聊天气泡中。

**payload 类型**（`app/lib/translationTaskFormPayload.ts`）：
```typescript
type TranslationTaskFormPayload = {
  sourceLocale: string    // 默认 "zh-CN"
  targetLocale: string    // 必填
  limitPerType: number    // 1–200，默认 20
  resourceTypes: string[] // 翻译模块列表
}
```

表单提交到 `POST /api/translate/v4/tasks`，成功后弹 toast 并提供「查看任务页面」链接。

---

## 环境变量

| 变量 | 用于 | 说明 |
|---|---|---|
| `COSMOS_ENDPOINT` | App + Worker | CosmosDB 端点 |
| `COSMOS_KEY` | App + Worker | CosmosDB 密钥 |
| `COSMOS_TRANSLATION_DATABASE_ID` | App + Worker | 数据库名，默认 `translation` |
| `COSMOS_TRANSLATION_V4_JOBS_CONTAINER` | App + Worker | 容器名，默认 `translation_v4_jobs` |
| `BLOB_TRANSLATE_V3_CONNECTION_STRING` | App + Worker | Blob 连接字符串（优先） |
| `AZURE_BLOB_CONNECTION_STRING` | App + Worker | Blob 连接字符串（兜底） |
| `AZURE_BLOB_TRANSLATION_CONTAINER` | App + Worker | Blob 容器名，默认 `translation-content` |
| `REDIS_URL` | App + Worker | Redis 完整 URL（优先） |
| `REDIS_HOSTNAME` / `REDIS_HOST` / `REDISCACHEHOSTNAME` | App + Worker | Redis 主机（备选） |
| `REDIS_PASSWORD` / `REDISCACHEKEY` | App + Worker | Redis 密码 |
| `REDIS_PORT` | App + Worker | Redis 端口，默认 `6380` |
| `REDIS_TLS` | App + Worker | 设为 `"false"` 关闭 TLS（Azure Cache 默认开启） |
| `DEEPSEEK_API_KEY` | Worker | DeepSeek API 密钥（翻译 LLM 与分析 LLM 均使用） |
| `DEEPSEEK_MODEL` | Worker | DeepSeek 模型，如 `deepseek-v4-flash`（默认 `deepseek-chat`） |
| `DEEPSEEK_BASE_URL` | Worker | DeepSeek 端点，默认 `https://api.deepseek.com` |
| `GOOGLE_TRANSLATE_API_KEY` | Worker | Google Translate API 密钥（短字段成本路由可选） |
| `TRANSLATION_TM_DISABLED` | Worker | 设为 `"true"` 关闭翻译记忆缓存 |
| `TRANSLATION_TM_TTL_DAYS` | Worker | 翻译记忆缓存 TTL（天），默认 60 |
| `WORKER_STAGES` | Worker | 逗号分隔启用的阶段，如 `init,translate,writeback,verify,analysis`（**默认全开**）。若设为 `init,translate` 等未含 `analysis` 的值，**商店扫描分析不会执行**；用于线上质量测试时可跳过 writeback/verify |
| `COSMOS_SHOP_ANALYSIS_CONTAINER` | App + Worker | 商店扫描分析 Cosmos 容器，默认 `shop_analysis_jobs`（分区键 `/shopName`） |
| `TRANSLATION_MAX_CHUNK_CHARS` | Worker | init 阶段单个 chunk 的字符总量上限，默认 50000（防止 chunk blob 过大 / 内存过高） |

---

## 改动注意事项

1. **新增任务状态**：同步更新 `v4/types.ts`（`TranslationV4Status`）和 `worker/src/services/cosmosV4.ts`（Worker 侧副本），两处必须保持一致。
2. **修改 Cosmos 字段**：`app/server/translation/v4/cosmosV4Store.server.ts` 和 `worker/src/services/cosmosV4.ts` 是独立副本，均需同步修改。
3. **修改 Blob 路径**：init / translate / writeback / verify 四个 Worker 的读写路径必须一致，断点续传依赖固定路径格式。
4. **修改 Redis Key**：`app/routes/api.translate.v4.task-action.ts` 中有本地 `HINT_KEYS` 常量（与 Worker 侧 `redisV4.ts` 独立定义），需同步。
5. **Worker 不引用 App 代码**：`worker/` 是独立 Node 进程，所有类型和服务均为独立副本，不要跨包 import。
6. **etag 乐观锁**：`claimJob` / `updateV4Job` 均依赖 Cosmos `_etag` 做并发控制，修改这两个函数时不得移除 `IfMatch` 条件。

---

*最后更新：2026-05-27*
