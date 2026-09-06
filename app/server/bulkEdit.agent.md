# 批量编辑 Agent 说明

本文件收纳「批量编辑」这一族能力的实现细则。这些细则原先内联在根 `AGENTS.md` 第 4 节，占该文件约 23%，但只在改动本族代码时才需要；下沉到此处后由 `.cursor/rules/bulk-edit-agent.mdc` 按路径条件触发加载。

改动本族任何文件前先读本文件。全局边界（哪些 `POST /api/bulk-*` 是唯一写回入口、对话内审核白名单、`TaskProposalField` 远端资源字段约定）仍以根 `AGENTS.md` 第 3、7 节为准。

当前在线能力：批量调价 / 打标 / 上下架，以及只读的站内 SEO 体检。批量改 SEO、调整合集、改自定义字段，以及价目表 / 成本价 / 库存三个表格导入已删除，不要再加回入口或写回路由。

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

纯算 `app/lib/seoAudit.ts`（阈值 + 问题检测 + 重复检测 + **SEO 知识库**）、只读 `app/server/shopify/productSeoAuditReader.server.ts`、Skill `app/server/ai/skills/seoAudit/` 只暴露 `run_seo_audit`。解决的是「商户还不知道自己 SEO 哪里有问题」。搜索标题/描述没有 Spark 内批量改写入口，`fixability` 为 `manual`；正文过薄走商品文案优化。

几条不能退化的约束：长度判定一律用 **`seoDisplayWidth` 半角当量**（CJK 记 2）而不是字符数——Google 按像素截断，中文标题 30 个字就到线了，按字符数判断会让中文店永远报不出超长；**只判定已上架商品**（`publishedAt != null`），未上架页面不会被收录，算进覆盖率只会让结论失真；重复检测的两个口径**故意不同**——标题带商品名回落一起比（空标题时 Shopify 会回落，实际渲染出来的才会打架），描述只比商户明确填过的值（空描述输出什么由主题决定，全比会把一堆空值报成重复）；每类问题最多带 5 个样例，`affectedCount` 仍是真实总数，上下文不随店铺规模膨胀。

**图片 alt 检查刻意不做**：`featuredMedia` 会额外要求 `read_files` / `read_images`，加 scope 会让所有已安装店铺弹一次重新授权，不值得；现有 `read_products` 已覆盖全部检查项。

每条 issue 带 `fixability`（`product_content` / `manual`）指明往哪个能力引导，`handle_non_descriptive` 恒为 `manual`（改 handle 会断链接、要配 301）。`SEO_AUDIT_GUIDANCE` 是唯一的 SEO 知识出处，工具会随结果一起交给模型，不要再往 prompt 里散写 SEO 常识。

## 2. 新增同类能力时的检查清单

1. 四层齐备，mutation 只出现在 apply 一处。
2. 写回路由校验 `confirm: true` + `pending_review`。
3. 任务类型加进 `app/routes/component/chat/chatInlineReviewTasks.ts` 白名单，并配 `ChatPanel` 渲染分支与签名为 `{ task, onBack, showBackButton?, onTaskUpdated? }` 的 `XxxTaskDetailPage`（prod 导航没有任务页，审核必须在对话内闭环）。
4. 在 `app/lib/workspaceRecommendedActions.ts` 登记，否则首页推荐操作里不会出现。
5. 商户可见文案同步 `app/locales/zh/common.json` 与 `app/locales/en/common.json`。
6. 涉及远端资源下拉时走 `TaskProposalField` 的资源字段分支，开卡时预取选项，展示层用 `field.options` 的 label 而不是裸值。
7. 根 `AGENTS.md` 第 3 节的 `POST /api/bulk-*` 唯一写回入口清单补一行；本文件补一节细则。
