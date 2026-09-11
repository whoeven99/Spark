# 批量编辑 Agent 说明

本文件收纳「批量编辑」这一族能力的实现细则。这些细则原先内联在根 `AGENTS.md` 第 4 节，占该文件约 23%，但只在改动本族代码时才需要；下沉到此处后由 `.cursor/rules/bulk-edit-agent.mdc` 按路径条件触发加载。

改动本族任何文件前先读本文件。全局边界（哪些 `POST /api/bulk-*` 是唯一写回入口、对话内审核白名单、`TaskProposalField` 远端资源字段约定）仍以根 `AGENTS.md` 第 3、7 节为准。

当前在线能力：商户入口是**导出商品**与**导入商品**。调价 / 打标 / 上下架 / Vendor·类型·SEO / 合集 / 复制 / 归档仍走各自四层与 apply，但首页与启发式开卡收成导入；旧规则 Skill 保留给进行中任务。另有只读站内 SEO 体检。独立的价目表 / 成本价 / 库存导入路由不要加回；成本、库存、Handle、删除、Metafield、用表格新建商品一期仍不写回。

## 0. 共享架构

全族统一走读写分离四层，新增同类能力时照抄这个分层，不要把计算或 mutation 混进别的层：

1. **纯算** `app/lib/<name>.ts`：无 IO、可单测，产出 changeset 与变更/回滚 CSV。
2. **只读** `app/server/shopify/<name>Reader.server.ts`：只查询，不含任何 mutation。
3. **试算（dry-run）** `app/server/<name>/<name>DryRun.server.ts`：零 mutation，结果落 `pending_review`。
4. **写回（apply）** `app/server/<name>/<name>Apply.server.ts`：全仓库该 mutation 的唯一调用处。

配套约定：

- 写回路由 `POST /api/bulk-*` 必须带 `confirm: true` 且任务处于 `pending_review`。Agent 回合内（chat-stream / Skill / dry-run）禁止走到写回。
- Skill 只暴露「只读列表」与「开卡」两类工具，不注册任何 mutation 工具。
- 写回默认并发 2、失败行不阻塞其余行。调用量大或有限流风险的按各节额外说明配速。

## 1. 规则驱动的批量编辑

改的是结构化字段，目标由一句话规则即可说清。

### 1.1 变体批量调价

纯算 `app/lib/bulkPriceEdit.ts`（整数分计算、changeset、变更/回滚 CSV）、只读 `app/server/shopify/variantPriceReader.server.ts`、试算 `app/server/bulkPriceEdit/bulkPriceEditDryRun.server.ts`（零 mutation，落 `pending_review`）、写回 `app/server/bulkPriceEdit/bulkPriceEditApply.server.ts`（唯一 `productVariantsBulkUpdate` 调用处，按 productId 分批 ≤250 变体、并发 2、失败行不阻塞）。Skill `app/server/ai/skills/bulkPriceEdit/` 只暴露只读 `list_variant_prices` 与开卡 `open_bulk_price_edit_form`，不含 mutation 工具。

### 1.2 商品批量打标

与调价同构：纯算 `app/lib/bulkTagEdit.ts`（大小写不敏感去重、前缀清理、changeset、变更/回滚 CSV）、只读 `app/server/shopify/productTagsReader.server.ts`、试算 `app/server/bulkTagEdit/bulkTagEditDryRun.server.ts`、写回 `app/server/bulkTagEdit/bulkTagEditApply.server.ts`（唯一 `tagsAdd` / `tagsRemove` 调用处，先减后加、并发 2、失败行不阻塞）。用增量 mutation 而非 `productUpdate(tags:)` 整体覆写，避免抹掉读写之间别处新增的标签。Skill `app/server/ai/skills/bulkTagEdit/` 只暴露只读 `list_product_tags` 与开卡 `open_bulk_tag_edit_form`。

### 1.3 商品批量上下架

与调价/打标同构：纯算 `app/lib/bulkStatusEdit.ts`（目标状态 + 库存前置条件、changeset、变更/回滚 CSV）、只读 `app/server/shopify/productStatusReader.server.ts`（读 `status` / `totalInventory` / `tracksInventory` / `publishedAt`）、试算 `app/server/bulkStatusEdit/bulkStatusEditDryRun.server.ts`、写回 `app/server/bulkStatusEdit/bulkStatusEditApply.server.ts`（唯一 `productUpdate(product.status)` 调用处，并发 2、失败行不阻塞）。

几条不能退化的约束：**目标状态没有默认值**，没选上架/下架就报错不建任务（方向猜错等于整批下线）；**`ARCHIVED` 来源一律跳过**，归档恢复不在本能力范围；**不追踪库存的商品 `totalInventory` 恒为 0**，带库存条件时必须跳过并标 `inventory_untracked`，不能当断货下架；改成 `ACTIVE` 只解除售卖限制，**不改销售渠道发布**，没有 `publishedAt` 的行要在审核表标注「店面可能仍不可见」。

写回用 2026-07 的新签名 `productUpdate(product: ProductUpdateInput!)`；旧的 `input: ProductInput!` 已 deprecated（商品描述仍在用，暂未迁移）。Skill `app/server/ai/skills/bulkStatusEdit/` 只暴露只读 `list_product_status` 与开卡 `open_bulk_status_edit_form`。

### 1.4 站内 SEO 体检（只读诊断）

纯算 `app/lib/seoAudit.ts`（阈值 + 问题检测 + 重复检测 + **SEO 知识库**）、只读 `app/server/shopify/productSeoAuditReader.server.ts`、Skill `app/server/ai/skills/seoAudit/` 只暴露 `run_seo_audit`。解决的是「商户还不知道自己 SEO 哪里有问题」。搜索标题/描述的缺失与超宽 `fixability` 为 `bulk_seo`，引导导入商品（导出 CSV 改 SEO 列后再导入）；重复标题/描述与 handle 仍为 `manual`；正文过薄走商品文案优化。

几条不能退化的约束：长度判定一律用 **`seoDisplayWidth` 半角当量**（CJK 记 2）而不是字符数——Google 按像素截断，中文标题 30 个字就到线了，按字符数判断会让中文店永远报不出超长；**只判定已上架商品**（`publishedAt != null`），未上架页面不会被收录，算进覆盖率只会让结论失真；重复检测的两个口径**故意不同**——标题带商品名回落一起比（空标题时 Shopify 会回落，实际渲染出来的才会打架），描述只比商户明确填过的值（空描述输出什么由主题决定，全比会把一堆空值报成重复）；每类问题最多带 5 个样例，`affectedCount` 仍是真实总数，上下文不随店铺规模膨胀。

**图片 alt 检查刻意不做**：`featuredMedia` 会额外要求 `read_files` / `read_images`，加 scope 会让所有已安装店铺弹一次重新授权，不值得；现有 `read_products` 已覆盖全部检查项。

每条 issue 带 `fixability`（`product_content` / `bulk_seo` / `manual`）指明往哪个能力引导，`handle_non_descriptive` 与重复标题/描述恒为 `manual`（改 handle 会断链接、要配 301；互不相同的 SEO 不能用同一条 set 规则批量写）。`SEO_AUDIT_GUIDANCE` 是唯一的 SEO 知识出处，工具会随结果一起交给模型，不要再往 prompt 里散写 SEO 常识。

### 1.5 批量改 Vendor / 类型 / SEO 字段

与调价同构：纯算 `app/lib/bulkProductFieldEdit.ts`（`set`/`clear`，SEO 超 `seoDisplayWidth` 跳过）、只读 `app/server/shopify/productFieldReader.server.ts`、试算 `app/server/bulkProductFieldEdit/bulkProductFieldEditDryRun.server.ts`、写回 `app/server/bulkProductFieldEdit/bulkProductFieldEditApply.server.ts`（唯一 `productUpdate` 改 vendor / productType / seo 的调用处，并发 2）。SEO 只传变化的那一侧（`seo.title` 或 `seo.description`）。Skill 只暴露 `list_product_fields` 与 `open_bulk_product_field_edit_form`。不要用这个能力改 handle。

### 1.6 批量加入 / 移出合集

纯算 `app/lib/bulkCollectionEdit.ts`、只读 `app/server/shopify/collectionMembershipReader.server.ts`、试算 `app/server/bulkCollectionEdit/bulkCollectionEditDryRun.server.ts`、写回 `app/server/bulkCollectionEdit/bulkCollectionEditApply.server.ts`（唯一 `collectionUpdate` 改 source selections 的调用处，每批 ≤50）。2026-07 起 `collection_type` 已删除，列表拉全部合集；加入走 `inclusion.selectionsToAdd` 并清 exclusion，移出走 `inclusion.selectionsToRemove` 并加 exclusion，这样条件命中的商品也能移出。没有可写 `CollectionConditionsSource`（仅子合集或他人 shareable source）时 dry-run 整单失败，不要静默跳过。`collectionUpdate` 可能返回异步 job，结果里带 `pendingJob`。Skill 只暴露只读合集列表与开卡。

### 1.7 复制商品

纯算 `app/lib/productDuplicate.ts`（默认后缀 ` (Copy)`、草稿、带图，上限 50）、只读 `app/server/shopify/productDuplicateReader.server.ts`、试算 `app/server/productDuplicate/productDuplicateDryRun.server.ts`、写回 `app/server/productDuplicate/productDuplicateApply.server.ts`（唯一 `productDuplicate` 调用处，`synchronous: true`；过大商品若只返回 job 记失败）。Skill 只开卡。

### 1.8 归档商品

与上下架分开，避免破坏 ACTIVE/DRAFT 白名单。纯算 `app/lib/bulkArchive.ts`、读侧复用 `productStatusReader`、试算 `app/server/bulkArchive/bulkArchiveDryRun.server.ts`、写回 `app/server/bulkArchive/bulkArchiveApply.server.ts`（只写 `status: ARCHIVED`）。已归档跳过。Skill 只开卡。

### 1.9 导出商品（只读）

纯算 `app/lib/productExport.ts`、读侧 `productExportReader` / Catalog fetcher、运行 `app/server/productExport/productExportRun.server.ts`。任务直接 `succeeded`，没有 apply。一期只导出已选（最多 200），格式为 Shopify CSV 或 TikTok Catalog Feed CSV（复用 `shopifyToTiktokFeedCsv`，缺列进 skip 报告）。

### 1.10 导入商品（商户主入口）

一期路径：识别文件 → 校验 → 反馈问题行及改法 → 确认后写回。纯算 `app/lib/productImport.ts` + `app/lib/productImportPlan.ts`，解析 `app/server/productImport/parseImportSpreadsheet.server.ts`（必须读 original buffer，不能用 parsed.txt），只读 `app/server/shopify/productImportReader.server.ts`，试算 `app/server/productImport/productImportDryRun.server.ts`（零 mutation，落 `pending_review`），写回 `app/server/productImport/productImportApply.server.ts`（只编排已有 apply，不新增 GraphQL mutation）。路由 `POST /api/product-import`，门禁 `confirm: true` + `pending_review`。Skill 只开卡 `open_product_import_form`；没有文件也要开卡。

一期写回列：价格、Tags、状态、Vendor / 类型 / SEO、合集；文件能表达则做复制、归档。不做：Handle、删除、Metafields、成本、库存、用表格新建商品。未知列进 `unsupported_column`。Shopify CSV 的 Handle 向下填充。匹配按 SKU / Handle / Product ID。合集按标题匹配，无写出来源的合集记 `collection_not_writable`。

## 2. 新增同类能力时的检查清单

1. 四层齐备，mutation 只出现在 apply 一处。
2. 写回路由校验 `confirm: true` + `pending_review`。
3. 任务类型加进 `app/routes/component/chat/chatInlineReviewTasks.ts` 白名单，并配 `ChatPanel` 渲染分支与签名为 `{ task, onBack, showBackButton?, onTaskUpdated? }` 的 `XxxTaskDetailPage`（prod 导航没有任务页，审核必须在对话内闭环）。
4. 在 `app/lib/workspaceRecommendedActions.ts` 登记，否则首页推荐操作里不会出现。
5. 商户可见文案同步 `app/locales/zh/common.json` 与 `app/locales/en/common.json`。
6. 涉及远端资源下拉时走 `TaskProposalField` 的资源字段分支，开卡时预取选项，展示层用 `field.options` 的 label 而不是裸值。
7. 根 `AGENTS.md` 第 3 节的 `POST /api/bulk-*` 唯一写回入口清单补一行；本文件补一节细则。
