# 批量编辑与表格导入 Agent 说明

本文件收纳「批量编辑」与「按表格导入」这一族能力的实现细则。这些细则原先内联在根 `AGENTS.md` 第 4 节，占该文件约 23%，但只在改动本族代码时才需要；下沉到此处后由 `.cursor/rules/bulk-edit-agent.mdc` 按路径条件触发加载。

改动本族任何文件前先读本文件。全局边界（哪些 `POST /api/bulk-*` 是唯一写回入口、对话内审核白名单、`TaskProposalField` 远端资源字段约定）仍以根 `AGENTS.md` 第 3、7 节为准。

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

写回用 2026-07 的新签名 `productUpdate(product: ProductUpdateInput!)`；旧的 `input: ProductInput!` 已 deprecated（SEO 与商品描述两处仍在用，暂未迁移）。Skill `app/server/ai/skills/bulkStatusEdit/` 只暴露只读 `list_product_status` 与开卡 `open_bulk_status_edit_form`。

### 1.4 商品批量入 / 出 Collection

纯算 `app/lib/bulkCollectionEdit.ts`（方向 + 目标合集、changeset、变更/回滚 CSV）、只读 `app/server/shopify/collectionReader.server.ts`（合集详情含 `ruleSet` / `sources`、合集列表、`Product.inCollection` 归属）、试算 `app/server/bulkCollectionEdit/bulkCollectionEditDryRun.server.ts`、写回 `app/server/bulkCollectionEdit/bulkCollectionEditApply.server.ts`（唯一 `collectionAddProducts` / `collectionRemoveProducts` 调用处）。

几条不能退化的约束：**方向没有默认值**，没选加入/移出就报错不建任务；**智能合集在试算期直接判失败**（成员由条件决定，手动增删写不进去；`ruleSet != null` 或 `sources` 含 `CollectionConditionsSource` 即视为智能合集），因此开卡下拉也只放手动合集；`collectionAddProducts` 是**全有或全无**——批次里有一个商品已在合集里就整批回滚，所以批次失败后必须退化成逐个重试，不能把整批记成失败；`collectionRemoveProducts` 返回**异步 Job**，提交成功不等于已移出，有界轮询没跑完要如实标 `pendingJob`，不谎报完成。

两个 mutation 在 2026-07 已 deprecated，指向 `collectionUpdate` 的 `sources → inclusion`，但那条路只接受 `condition` / `subCollections` 来源，普通手动合集走它等于凭空造一个规则来源，语义不同；等 Shopify 给手动成员补非 source 入口再迁移。Skill `app/server/ai/skills/bulkCollectionEdit/` 只暴露只读 `list_collections` 与开卡 `open_bulk_collection_edit_form`（开卡会读一次 Shopify 预取合集下拉选项，因为卡片渲染在 SSE 同步回调里没法再发请求）。

### 1.5 商品 SEO 批量改写

与调价/打标同构：纯算 `app/lib/bulkSeoEdit.ts`（模板渲染、占位符白名单校验、空占位符分隔符清理、词边界截断、changeset、变更/回滚 CSV）、只读 `app/server/shopify/productSeoReader.server.ts`、试算 `app/server/bulkSeoEdit/bulkSeoEditDryRun.server.ts`、写回 `app/server/bulkSeoEdit/bulkSeoEditApply.server.ts`（唯一 `productUpdate(input.seo)` 调用处，只传本次变化的子字段以免覆盖另一半、并发 2、失败行不阻塞）。

模板渲染是确定性的，不调模型、零 token 成本。占位符只有 `{title}` / `{vendor}` / `{productType}`，未知占位符在解析期就报错，不允许静默写成字面量。改的是搜索引擎元数据，与「商品文案优化」改正文描述是两件事，不要混用。Skill `app/server/ai/skills/bulkSeoEdit/` 只暴露只读 `list_product_seo`（可带模板试算）与开卡 `open_bulk_seo_edit_form`。

### 1.6 站内 SEO 体检（只读诊断，批量改 SEO 的上游）

纯算 `app/lib/seoAudit.ts`（阈值 + 问题检测 + 重复检测 + **SEO 知识库**）、只读 `app/server/shopify/productSeoAuditReader.server.ts`、Skill `app/server/ai/skills/seoAudit/` 只暴露 `run_seo_audit`。解决的是「商户还不知道自己 SEO 哪里有问题」，与批量改 SEO 的「已经想好怎么改」是上下游关系，不要合并。

几条不能退化的约束：长度判定一律用 **`seoDisplayWidth` 半角当量**（CJK 记 2）而不是字符数——Google 按像素截断，中文标题 30 个字就到线了，按字符数判断会让中文店永远报不出超长；**只判定已上架商品**（`publishedAt != null`），未上架页面不会被收录，算进覆盖率只会让结论失真；重复检测的两个口径**故意不同**——标题带商品名回落一起比（空标题时 Shopify 会回落，实际渲染出来的才会打架），描述只比商户明确填过的值（空描述输出什么由主题决定，全比会把一堆空值报成重复）；每类问题最多带 5 个样例，`affectedCount` 仍是真实总数，上下文不随店铺规模膨胀。

**图片 alt 检查刻意不做**：`featuredMedia` 会额外要求 `read_files` / `read_images`，加 scope 会让所有已安装店铺弹一次重新授权，不值得；现有 `read_products` 已覆盖全部检查项。

每条 issue 带 `fixability`（`bulk_seo_edit` / `product_content` / `manual`）指明往哪个能力引导，`handle_non_descriptive` 恒为 `manual`（改 handle 会断链接、要配 301）。`SEO_AUDIT_GUIDANCE` 是唯一的 SEO 知识出处，工具会随结果一起交给模型，不要再往 prompt 里散写 SEO 常识。

### 1.7 商品自定义字段批量改写

纯算 `app/lib/bulkMetafieldEdit.ts`（按 metafield 类型规范化取值、模板渲染、changeset、变更/回滚 CSV）、只读 `app/server/shopify/productMetafieldReader.server.ts`（`metafieldDefinitions(ownerType: PRODUCT)` 定义列表 + `Product.metafield(namespace:key:)` 当前值）、试算 `app/server/bulkMetafieldEdit/bulkMetafieldEditDryRun.server.ts`、写回 `app/server/bulkMetafieldEdit/bulkMetafieldEditApply.server.ts`（唯一 `metafieldsSet` / `metafieldsDelete` 调用处）。

几条不能退化的约束：字段标识用 **`namespace.key`** 而不是 definition GID（`metafieldDefinition(id:)` 已 deprecated，官方推荐按 identifier 查）；只支持 `single_line_text_field` / `multi_line_text_field` / `number_integer` / `number_decimal` / `boolean` / `url` 六种标量类型，其余（list.*、JSON、引用类型）在试算期直接判失败，不要为了「先支持上」把 JSON 当字符串写进去；每个值写回前必须过 `normalizeMetafieldValue` 按类型校验（单行文本不许含换行、整数走 `BigInt` 防精度丢失、URL 只收 http/https），渲染不做 SEO 那套空占位符分隔符清理——结构化字段要的是字面量。

写回策略随 mutation 行为分叉：`metafieldsSet` 单批 ≤25 且**整批原子**，但 userErrors 带 `elementIndex`，所以失败时按下标剔掉坏行再重发剩下的，只有拿不到下标才退化成逐行隔离；`metafieldsDelete` 的 userErrors 是通用 `UserError`（**无 code 无下标**），整批失败只能逐行重试归因，另外它对本来就不存在的字段返回 null 而非报错，那对「清空」是成功、不计失败。

scope 用现有 `read_products` / `write_products` 即可，不需要新增。Skill `app/server/ai/skills/bulkMetafieldEdit/` 只暴露只读 `list_product_metafields` 与开卡 `open_bulk_metafield_edit_form`（开卡预取定义下拉，标签里带类型说明，商户才知道这个字段只收整数）。

## 2. 表格导入

与第 1 节的关键区别：目标值来自**商户上传的表格**而不是一句话能说清的规则，解决的是「导出 CSV → 手改 → 重新导入」里改动无规律的那一半。

### 2.1 表格导入公共层

「按表格导入」类能力共用：纯算 `app/lib/sheetImport.ts`（行数上限 1000、匹配率下限 50%、数量级异常阈值 50 倍、金额解析、SKU 规范化、列名校验 `SheetImportMappingError`）、解析 `app/server/sheetImport/parseSheet.server.ts`（读 Blob **原始字节**重新解析，不能用 `parsed.txt`——那份文本被截断到 2 万字符且列结构已拍平）、内部 Skill `app/server/ai/skills/sheetImport/` 提供只读 `preview_import_sheet` 让模型看真实表头。

价格导入、成本导入与库存导入都引用这一份，不要再各自复制一套金额/数量解析或行数上限（库存用的是同层里的 `parseImportQuantity`，只接受非负整数）。

### 2.2 价目表导入（外部数据驱动，非规则驱动）

纯算 `app/lib/bulkPriceImport.ts`（在公共层基础上做 SKU 匹配分类、变更/回滚/未写入 CSV）、只读 `app/server/shopify/variantSkuReader.server.ts`（按 `sku:` 查，Shopify 不保证 SKU 唯一）、试算 `bulkPriceImportDryRun.server.ts`、写回 `/api/bulk-price-import` → 复用 `applyBulkPriceEdit`。因此它**不新增** mutation，`productVariantsBulkUpdate` 仍只有一个调用处。

几条不能退化的约束：千分位分组必须是「首组 1-3 位 + 其余每组正好 3 位」，否则 `12.34.56.78` 会被静默拼成天价；解析不出金额一律标错不猜；一个 SKU 命中多个变体报冲突而不是挑一个；匹配率 < 50% 直接判为列映射选错并让任务失败；新价与现价相差 ≥ 50 倍时打备注。

Skill `app/server/ai/skills/bulkPriceImport/` 只暴露开卡 `open_bulk_price_import_form`（读表走公共层的 `preview_import_sheet`）；商品由表格决定，因此 `targets.kind` 为 `none`，`fileId` 走 `TaskProposalField` 的 `hidden` 类型随 params 传递。

### 2.3 成本价导入（写 unitCost，不碰售价）

与价目表导入同构但**是另一个任务类型**：改的是 `inventoryItem.unitCost`，买家看不到，风险与 mutation 都和改售价不同，不要合并成一个表单。纯算 `app/lib/bulkCostImport.ts`（复用公共层，另算前后毛利率）、只读 `app/server/shopify/variantCostReader.server.ts`（按 SKU 取 `price` 与 `inventoryItem.id/unitCost`，需 `read_inventory`）、试算 `bulkCostImportDryRun.server.ts`、写回 `bulkCostImportApply.server.ts`（唯一 `inventoryItemUpdate` 调用处）。

关键约束：`inventoryItemUpdate` **没有批量版**，1000 行就是 1000 次调用，因此写回内置并发 2 + 按 `throttleStatus` 主动限速 + 遇 `THROTTLED` 指数退避重试，不要改成无节制并发；新成本高于售价只打「负毛利」警告并放行（赔本清仓是合法场景），不静默拦截；变体没有 `inventoryItem` 的行标错不写。

写回后调 `upsertSkuCosts` 直更 `ShopSkuCost`，利润/ROI 不必等 24 小时懒同步。Skill `app/server/ai/skills/bulkCostImport/` 只暴露开卡 `open_bulk_cost_import_form`。

### 2.4 库存导入（写某个地点的可售量）

第三个表格导入，同样复用公共层，但语义与前两个都不同：改的是**某一个地点的 `available` 可售量**，绝对值覆盖、不做加减、不写 `on_hand`。纯算 `app/lib/bulkInventoryImport.ts`、只读 `app/server/shopify/locationReader.server.ts`（活跃地点列表；`Location` 的 scope 是 `read_locations` / `read_inventory` / `read_markets_home` 三选一，现有 `read_inventory` 已覆盖，别为地点下拉去加 `read_locations` 触发全店重新授权）与 `variantInventoryReader.server.ts`（按 SKU 取 `inventoryItem.inventoryLevel(locationId:)` 的 available）、试算 `bulkInventoryImportDryRun.server.ts`、写回 `bulkInventoryImportApply.server.ts`（唯一 `inventorySetQuantities` 调用处）。

几条不能退化的约束：**数量必须是整数**，`50.0` 按 50 接受但 `50.5` 一律报错（四舍五入等于替商户做决定），负数同样报错；**变体在该地点没有 InventoryLevel 时报错跳过**，不调 `inventoryActivate`——那会静默改变商品的可发货地点配置；`tracked = false` 的变体跳过，不自动打开追踪；写回**每行带 `changeFromQuantity` 做 CAS**，试算到确认之间被卖掉几件的行会被 Shopify 拒（`CHANGE_FROM_QUANTITY_STALE`），这类行单独计入 `staleCount`、不重试也不当故障，绝不覆盖销量；`@idempotent` 自 2026-04 起必填，幂等键**每行一个且在重试间复用**，整批共用会让后面的行被当成同一次调整丢掉；`inventorySetQuantities` 的批量原子性无文档保证且 CAS 失败逐行发生，因此按行调用 + 并发 2 + `throttleStatus` 配速，与成本价导入同一套限流。

写回要求试算结果里有 `locationId`，需要 `write_inventory`。只写单个地点的 `available`，不写 `on_hand`、不激活地点。Skill `app/server/ai/skills/bulkInventoryImport/` 只暴露开卡 `open_bulk_inventory_import_form`（开卡会预取活跃地点，单地点店自动选中）。

## 3. 新增同类能力时的检查清单

1. 四层齐备，mutation 只出现在 apply 一处。
2. 写回路由校验 `confirm: true` + `pending_review`。
3. 任务类型加进 `app/routes/component/chat/chatInlineReviewTasks.ts` 白名单，并配 `ChatPanel` 渲染分支与签名为 `{ task, onBack, showBackButton?, onTaskUpdated? }` 的 `XxxTaskDetailPage`（prod 导航没有任务页，审核必须在对话内闭环）。
4. 在 `app/lib/workspaceRecommendedActions.ts` 登记，否则首页推荐操作里不会出现。
5. 商户可见文案同步 `app/locales/zh/common.json` 与 `app/locales/en/common.json`。
6. 涉及远端资源下拉（collection / location / metafieldDefinition 一类）时走 `TaskProposalField` 的资源字段分支，开卡时预取选项，展示层用 `field.options` 的 label 而不是裸值。
7. 根 `AGENTS.md` 第 3 节的 `POST /api/bulk-*` 唯一写回入口清单补一行；本文件补一节细则。
