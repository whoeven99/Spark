一、决策汇总
#	问题	决策
1
OAuth 凭证归属
Spark 应用申请 OAuth App，客户授权自己的 Google 账号
2
merchantId 获取
Content API 自动读取，多账号时提供选择界面
3
审核轮询时机
同步完成后立即查一次 + 30 分钟后再查一次；后台每天一次 cron
4
商品上限
250 个（不变）
5
删除下架商品
本期不做
6
Google Ads 绑定
本期做

---
二、整体链路
┌──────────────────────────────────────────────────────────────────┐
│                     Spark · Ads Catalog 页面                      │
│                    （/app/ads-catalog，Google Tab）               │
└──────────────────────────────────────────────────────────────────┘
【Step 1】授权 Google Merchant Center（首次必做）
  用户点击「连接 Google Merchant Center」
    → GET /app/ads.google-merchant.start
        生成 state (shop + nonce)，存 Session
        重定向 → accounts.google.com/o/oauth2/v2/auth
          scope=https://www.googleapis.com/auth/content
    → 用户在 Google 授权页同意
    → GET /ads.google-merchant.callback?code=xxx&state=xxx
        校验 state，code 换 access_token + refresh_token
        调用 GET /content/v2.1/accounts/authinfo 读取 merchantIds
        若只有 1 个 → 直接存入 DB
        若多个 → 返回列表，前端弹「选择 Merchant 账号」弹窗
        存入 AdPlatformCredential (platform=google_merchant)
    → 页面显示「已连接：店铺名 (Merchant ID: 12345678)」
【Step 2】（可选）绑定 Google Ads 广告账户
  用户点击「绑定 Google Ads 账户」
    → GET /app/ads.google-ads.start
        scope=https://www.googleapis.com/auth/adwords
    → Google 授权页
    → GET /ads.google-ads.callback?code=xxx&state=xxx
        code 换 token
        调用 Google Ads API ListAccessibleCustomers 读取广告账户列表
        前端展示「选择广告账户」弹窗
        存入 AdPlatformCredential (platform=google，覆盖现有手动配置字段)
    → 页面显示「已绑定 Ads 账户：xxx-xxx-xxxx」
    → 查询 GMC ↔ Ads 关联状态
        调用 Ads API MerchantCenterLinkService.ListMerchantCenterLinks
        若已关联 → 显示绿色「已关联」
        若未关联 → 显示引导「前往 Google Merchant Center 关联广告账户 →」
【Step 3】配置 Feed 筛选条件
  用户在「筛选配置」区域设置：
    - 商品标签（tag）：多选
    - 商品类型（product_type）：多选
    - 品牌 / Vendor：多选
    - 集合（Collection）：多选
    - 仅有库存商品：开关
    - 目标语言（contentLanguage）：下拉，默认 en
    - 目标国家（targetCountry）：下拉，默认 US
    - 默认 Google 类目 ID（googleProductCategory）：文本输入，选填
        提示文案："Google 标准商品分类 ID，例如 166（Apparel & Accessories）。
                  不填则该字段留空，可能影响审核通过率。查询地址：→ Google Product Taxonomy"
        用于补全 google_product_category 字段（Shopify 无对应标准字段，全店统一设置）
  点击「预览」→ GET /api/ads-catalog/preview?platform=google&...筛选参数
    → fetchProductsForCatalog（带筛选条件）
    → validateForGoogle（逐条校验，本地逻辑，不请求 GMC）
    → 返回校验报告：
        {
          totalProducts: 245,
          readyToSync: 231,   // 无任何问题
          hasWarnings: 9,     // 有警告但可同步
          hasErrors: 5,       // 有硬性错误，会被跳过
          products: [
            {
              title: "iPhone Case",
              status: "error" | "warning" | "ok",
              issues: [
                { level: "error",   rule: "MISSING_IMAGE",  message: "缺少主图，GMC 必须有图片" },
                { level: "warning", rule: "NO_GTIN",        message: "未设置条形码，建议填写以提升审核通过率" }
              ]
            }
          ]
        }
    → 前端展示：商品总数 + 可同步数 + 错误/警告商品列表（见 6.1）
  点击「保存配置」→ 写入 GoogleFeedConfig 表

【Step 4】触发同步
  用户点击「同步到 Google Merchant Center」
    → 前端先请求预校验（复用 preview 接口）
    → 若有硬性错误商品：
        弹确认框「有 5 个商品存在必填字段缺失，将被自动跳过，其余 240 个正常同步」
        [继续同步（跳过问题商品）]  [取消，先去修复]
    → 若只有警告商品：
        弹提示「有 9 个商品可能存在质量问题，可能在 GMC 审核中被拒绝」
        [继续同步]  [查看详情]
    → 无问题：直接同步，无弹框
    → POST /api/ads-catalog/sync
        body: { platform: "google", filters: {...}, contentLanguage, targetCountry }
    → fetchProductsForCatalog（Shopify GraphQL，带筛选条件，max 250）
    → validateForGoogle（再次校验，过滤掉硬性错误商品）
    → mapShopifyToGoogle（字段映射，仅处理通过校验的商品）
    → upsertGoogleMerchantProducts（Content API custombatch，每批 100 条）
    → 创建 AITask，实时展示进度（现有 AITaskCardShell）
    → 同步完成后：
        ① 立即触发一次 GMC 状态查询（见 Step 5）
        ② 安排 30 分钟后再查一次（延迟任务）
【Step 5】GMC 审核状态感知
  查询逻辑（复用于同步后即时查 + 30min 延迟查 + 每日 cron）：
    → GET /content/v2.1/{merchantId}/products?maxResults=250
    → 逐条检查 status 和 issues[].servability
    → 写入 / 更新 GmcProductStatus 表
    → 若有 disapproved 商品或账户级问题 → 更新页面 badge + 飞书通知
  前端展示：
    → 任务卡片 badge：「3 个商品未通过审核」（红色）
    → 点击「查看详情」弹窗：
        商品标题 | offerId | 状态 | 拒绝原因
    → 账户被暂停时：页面顶部 banner「您的 GMC 账户已被暂停，请前往 GMC 处理」

---
三、新增路由清单
路由文件	方法	说明
app/routes/app.ads.google-merchant.start.tsx
loader
生成 OAuth2 授权 URL，重定向到 Google
app/routes/ads.google-merchant.callback.tsx
loader
接收 code，换 token，读 merchantIds，写 DB
app/routes/api.ads-catalog.google-merchant-accounts.ts
loader
返回该授权账号下的 Merchant 账号列表（多账号选择用）
app/routes/app.ads.google-ads.start.tsx
loader
生成 Google Ads OAuth2 授权 URL
app/routes/ads.google-ads.callback.tsx
loader
接收 code，换 token，读 Ads 客户列表，写 DB
app/routes/api.ads-catalog.google-status.ts
loader
拉取 GMC 中商品的审核状态（前端轮询 / 定时调用）

---
四、数据模型变更
4.1 现有模型（不变）
AdPlatformCredential 表保持不变，凭证结构调整如下：
platform = "google_merchant"（原字段复用，token 来源从手动变为 OAuth）
{
  accessToken: string;    // OAuth2 access_token（1h 有效，同步前自动刷新）
  refreshToken: string;   // OAuth2 refresh_token（长期有效）
  clientId: string;       // Spark 应用的 OAuth Client ID
  clientSecret: string;   // Spark 应用的 OAuth Client Secret
  merchantId: string;     // 客户选定的 GMC Merchant ID
}
platform = "google"（覆盖现有手动配置字段）
{
  accessToken: string;    // Google Ads OAuth2 access_token
  refreshToken: string;   // Google Ads OAuth2 refresh_token
  clientId: string;       // Spark 应用的 OAuth Client ID（与 GMC 共用或单独）
  clientSecret: string;   
  customerId: string;     // 客户选定的 Google Ads Customer ID（格式: 123-456-7890）
  developerToken: string; // Spark 应用的 Developer Token（不变，应用级别）
}
兼容说明：现有 app.ads.google.config.tsx 的手动配置页可保留作为 fallback，新 OAuth 流走新路由。两套凭证写同一条 DB 记录，新 OAuth 流写入会覆盖旧手动配置。
4.2 新增模型
// Feed 筛选配置（持久化，支持复用）
model GoogleFeedConfig {
  id              String   @id @default(cuid())
  shop            String
  name            String   @default("默认配置")
  // 筛选条件
  filterTags      Json?    // string[]，为空表示不限制
  filterTypes     Json?    // string[]，商品类型
  filterVendors   Json?    // string[]，品牌/vendor
  filterCollectionIds Json? // string[]，Collection GID
  filterInStockOnly   Boolean @default(false)
  // GMC 推送参数
  contentLanguage String   @default("en")
  targetCountry   String   @default("US")
  // 自动同步（本期 UI 不暴露，预留字段）
  autoSyncEnabled Boolean  @default(false)
  lastSyncAt      DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@unique([shop, name])
  @@index([shop])
}
// GMC 商品审核状态缓存
model GmcProductStatus {
  id               String   @id @default(cuid())
  shop             String
  merchantId       String
  offerId          String                    // GMC 中的 offerId
  shopifyProductId String?                   // 对应 Shopify product GID
  title            String?
  status           String                    // approved / disapproved / pending / expiring
  issues           Json?                     // GMC issues 数组
  checkedAt        DateTime
  updatedAt        DateTime @updatedAt
  @@unique([shop, offerId])
  @@index([shop, status])
  @@index([shop, merchantId])
}

---
五、后端改动详细
5.1 OAuth2 公共配置（新文件）
app/server/adsCatalog/googleOAuth.server.ts
// 封装 Google OAuth2 的 token exchange、account info 读取
// 供 GMC 和 Google Ads 两条 callback 路由复用
export const GOOGLE_OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
// scope 常量
export const GMC_SCOPE = "https://www.googleapis.com/auth/content";
export const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
export async function exchangeCodeForTokens(code, redirectUri): Promise<OAuthTokens>
export async function getGmcMerchantAccounts(accessToken): Promise<MerchantAccount[]>
export async function getAdsCustomers(accessToken, developerToken): Promise<AdsCustomer[]>
5.2 扩展商品筛选与字段补充
app/server/adsCatalog/productFetcher.server.ts 有两处改动：

① 扩展 FetchProductsOptions，支持组合筛选：
export interface FetchProductsOptions {
  productIds?: string[] | null;
  tags?: string[];            // 新增：按 tag 筛选
  productTypes?: string[];    // 新增：按商品类型
  vendors?: string[];         // 新增：按 vendor
  collectionIds?: string[];   // 新增：按 Collection
  inStockOnly?: boolean;      // 新增：仅有库存
  query?: string;             // 保留：自定义 query
  pageSize?: number;
  maxProducts?: number;
}
// 内部组装 Shopify GraphQL query 字符串：
// 示例：tags=["sale", "featured"], inStockOnly=true
// → "status:active AND (tag:sale OR tag:featured) AND inventory_total:>0"
function buildShopifyQuery(options: FetchProductsOptions): string

② 补充 GraphQL 查询字段（现有查询遗漏了语义关键字段）：
variants(first: 100) {          // 改为拉取全部变体（现在只拉 first: 1），支持多变体同步
  edges {
    node {
      id
      title                     // 新增：变体标题（颜色/尺寸等规格）
      sku
      barcode
      price
      compareAtPrice            // 新增：划线价，用于映射 GMC salePrice
      inventoryQuantity
      availableForSale
      inventoryItem {
        inventoryPolicy         // 新增：DENY / CONTINUE，决定 GMC availability 语义
      }
    }
  }
}
category {                      // 新增：Shopify 标准商品分类（用于辅助填写 google_product_category）
  id
  name
  fullName
}

③ 扩展 RawShopifyProductForCatalog 类型，补充上述新字段：
export interface RawShopifyProductForCatalog {
  // ...原有字段不变...
  variantCount: number;                    // 新增
  variants: RawVariantForCatalog[];        // 改为完整变体列表（原来只有第一个变体的摊平字段）
  shopifyCategory?: { id: string; name: string; fullName: string } | null; // 新增
}
export interface RawVariantForCatalog {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;           // 新增
  inventoryQuantity: number | null;
  availableForSale: boolean;
  inventoryPolicy: "DENY" | "CONTINUE";   // 新增
}
5.3 mapShopifyToGoogle 映射器修正
app/server/adsCatalog/mappers/shopifyToGoogle.ts 需修正以下语义问题：

① 价格：区分单变体 / 多变体
// 单变体商品：直接用 variant.price
// 多变体商品：为每个变体生成一条 GoogleMerchantProduct，共用 itemGroupId
// 划线价处理（compareAtPrice > price 时）：
//   price → compareAtPrice（原价，GMC price 字段）
//   salePrice → variant.price（促销价）
//   salePriceEffectiveDate → 可选，不填则 GMC 默认长期有效

② 库存 availability：
// 旧：availableForSale === true || inventoryQuantity > 0 → "in stock"
// 新：
//   availableForSale=false                           → "out of stock"
//   availableForSale=true + inventoryPolicy=CONTINUE → "preorder"
//   availableForSale=true + inventoryPolicy=DENY     → "in stock"

③ 类目：
// productType → productTypes[]（保留，语义正确）
// 新增 googleProductCategory 字段（来自同步配置中的「默认 Google 类目 ID」）：
//   若 context.googleProductCategory 有值 → 填入 product.googleProductCategory
//   若无 → 字段留空（校验器会给出警告）

④ 多变体展开逻辑（新增 mapShopifyVariantsToGoogle 函数）：
// 输入：一个 RawShopifyProductForCatalog（可能含多个 variant）
// 输出：GoogleMerchantProduct[]（多变体时一对多）
// 每条记录的 offerId = variant.sku || `${productNumericId}-${variantNumericId}`
// itemGroupId = productNumericId（用于 GMC 把同款变体聚合展示）
// 变体标题追加到主标题：`${product.title} - ${variant.title}`（如 "T-Shirt - Blue / L"）

5.4 同步后触发审核检查
app/server/adsCatalog/adsCatalogAsync.server.ts 的 finishAdsCatalogSync 中，在 completeTask 之后：
// 同步完成后立即查一次
await checkGmcProductStatuses({ shop, merchantId, offsets: syncedOfferIds });
// 30 分钟后再查一次（通过 AITask 延迟任务 or setTimeout，视 worker 架构决定）
scheduleGmcStatusCheck({ shop, merchantId, delayMs: 30 * 60 * 1000 });
5.4 新增 GMC 状态查询服务
app/server/adsCatalog/gmcStatusChecker.server.ts
// 核心逻辑：
// 1. GET /content/v2.1/{merchantId}/products（分页，最多 250）
// 2. 对比 status 字段，写入 GmcProductStatus 表
// 3. 检查账户级状态（accountstatuses API）
// 4. 若有 disapproved → 写通知标记
export async function checkGmcProductStatuses(params: {
  shop: string;
  merchantId: string;
  accessToken: string;
}): Promise<GmcCheckResult>

5.5 新增同步前预校验器（新文件）
app/server/adsCatalog/validators/googleProductValidator.ts
// 职责：接收 RawShopifyProductForCatalog[]，返回每个商品的问题列表
// 与映射逻辑（mapShopifyToGoogle.ts）分离，独立可测试
// 同时复用于「预览」和「同步前拦截」两个入口

// 硬性错误（会被 GMC 直接拒绝，同步时自动跳过）
const HARD_RULES = [
  { rule: "MISSING_LINK",     check: (p) => !p.onlineStoreUrl && !p.handle,         message: "缺少商品链接" },
  { rule: "MISSING_IMAGE",    check: (p) => !p.featuredImage && !p.images.length,    message: "缺少主图" },
  { rule: "MISSING_PRICE",    check: (p) => !p.priceAmount || p.priceAmount === "0", message: "缺少价格或价格为 0" },
  { rule: "MISSING_TITLE",    check: (p) => !p.title,                                message: "缺少标题" },
  { rule: "MISSING_CURRENCY", check: (p) => !p.priceCurrency,                        message: "缺少货币单位" },
  { rule: "NOT_ACTIVE",       check: (p) => p.status !== "ACTIVE",                   message: "商品未上架" },
]

// 质量警告（可能导致 GMC 后置审核拒绝，提示但不阻断同步）
const WARNING_RULES = [
  { rule: "TITLE_TOO_SHORT",        check: (p) => p.title.length < 5,                                    message: "标题过短（建议 ≥ 5 个字符）" },
  { rule: "TITLE_ALL_CAPS",         check: (p) => /^[A-Z\s\d]+$/.test(p.title),                          message: "标题全大写，GMC 会降权" },
  { rule: "NO_DESCRIPTION",         check: (p) => !p.descriptionHtml,                                     message: "缺少描述，GMC 要求有商品描述" },
  { rule: "DESCRIPTION_TOO_SHORT",  check: (p) => stripHtml(p.descriptionHtml).length < 20,               message: "描述内容过短（去标签后少于 20 字符）" },
  { rule: "INVALID_GTIN",           check: (p) => p.barcode && !isValidGtin(p.barcode),                   message: "条形码格式不符合 GTIN 规范（校验位错误）" },
  { rule: "NO_IDENTIFIER",          check: (p) => !p.barcode && !p.sku,                                   message: "缺少 GTIN 和 MPN，建议至少填写一项" },
  { rule: "NO_BRAND",               check: (p) => !p.vendor,                                              message: "缺少品牌/vendor，GMC 要求有品牌" },
  { rule: "PRICE_IS_ZERO",          check: (p) => parseFloat(p.priceAmount ?? "0") === 0,                 message: "价格为 0，可能被 GMC 判定为数据异常" },
  { rule: "NO_GOOGLE_CATEGORY",     check: (p) => !p.googleProductCategory,                               message: "未设置 Google 标准类目（google_product_category），建议填写以提升审核通过率和广告精准度" },
  { rule: "OVERSELL_POLICY",        check: (p) => p.availableForSale && p.inventoryPolicy === "CONTINUE", message: "商品设置了超卖继续销售，GMC 中建议标记为 preorder 而非 in stock" },
  { rule: "HAS_COMPARE_AT_PRICE",   check: (p) => p.compareAtPrice && parseFloat(p.compareAtPrice) > parseFloat(p.priceAmount ?? "0"), message: "商品有划线价，建议映射 salePrice 以在 GMC 展示促销角标" },
  { rule: "MULTI_VARIANT_PARTIAL",  check: (p) => p.variantCount > 1,                                     message: "多变体商品仅同步了第一个变体价格，其余变体未推送，建议开启按变体同步" },
]

// ── 字段映射语义说明 ──────────────────────────────────────────────────────
//
// 【价格映射】
//   单变体商品：priceRangeV2.minVariantPrice → price（足够）
//   多变体商品：每个 variant 需作为独立商品推送，用 itemGroupId 关联同款
//               variant.price → price
//               variant.compareAtPrice（若 > price）→ salePrice（促销价），price 改用 compareAtPrice（原价）
//   当前实现只取第一个变体，多变体商品价格不准确，作为 Warning 提示
//
// 【库存映射】
//   availableForSale + inventoryPolicy 共同决定 GMC availability：
//     availableForSale=true  + inventoryPolicy=DENY     → "in stock"
//     availableForSale=true  + inventoryPolicy=CONTINUE → "preorder"（超卖/预售）
//     availableForSale=false                            → "out of stock"
//   注意：inventoryQuantity 在多仓库时只是某一仓的局部数据，不能用于判断总库存
//   应以 availableForSale 为准，需在 productFetcher 中补充拉取 inventoryPolicy 字段
//
// 【类目映射】
//   productType（商家自填字符串）→ productTypes[]（GMC 自定义分类路径）✅ 语义一致
//   google_product_category（Google 标准分类 ID）← 当前完全缺失
//     - Shopify product.category（标准分类）可部分映射，需维护映射表
//     - 短期方案：在同步配置中提供「默认 Google 类目 ID」输入框，全店统一设置
//     - 长期方案：基于 Shopify 标准分类与 Google Taxonomy 建立映射表

export interface ProductIssue {
  level: "error" | "warning";
  rule: string;
  message: string;
}

export interface ProductValidationResult {
  productId: string;
  title: string;
  status: "ok" | "warning" | "error";
  issues: ProductIssue[];
}

export interface FeedValidationReport {
  totalProducts: number;
  readyToSync: number;   // status=ok
  hasWarnings: number;   // status=warning
  hasErrors: number;     // status=error
  products: ProductValidationResult[];
}

export function validateProductsForGoogle(
  products: RawShopifyProductForCatalog[]
): FeedValidationReport

---
六、前端改动详细
6.1 AdsCatalogPage.tsx — Google Tab 改动
凭证区域重构（现有手动填写 → OAuth 按钮）：
Google Merchant Center
┌──────────────────────────────────────────┐
│ 状态：✅ 已连接                            │
│ 店铺名称：My Store（ID: 123456789）        │
│ Access Token 更新时间：2026-06-17 13:00    │
│                         [重新授权] [断开]  │
└──────────────────────────────────────────┘
Google Ads 广告账户（可选）
┌──────────────────────────────────────────┐
│ 状态：✅ 已绑定                            │
│ 广告账户：My Ads Account（123-456-7890）  │
│ GMC 关联状态：✅ 已关联                    │
│                         [更换账户]        │
└──────────────────────────────────────────┘
筛选配置区域新增（现有仅有 productIds 输入框）：
Feed 筛选配置
┌────────────────────────────────────────────────────────┐
│ 商品标签     [sale ×] [featured ×] [+ 添加标签]         │
│ 商品类型     [Electronics ×] [+ 添加]                   │
│ 品牌         [Apple ×] [+ 添加]                         │
│ 仅有库存     [开关]                                      │
│                                                        │
│ 目标语言     [en ▼]    目标国家  [US ▼]                 │
│                                                        │
│ [预览并校验]                         [保存配置]          │
└────────────────────────────────────────────────────────┘

预览校验结果面板（点击「预览并校验」后展开）：
┌────────────────────────────────────────────────────────┐
│ 共 245 个商品                                           │
│  ✅ 231 个可直接同步                                    │
│  ⚠️  9 个有质量警告（可同步，但可能被 GMC 后置拒绝）     │
│  ❌  5 个有必填字段缺失（同步时将自动跳过）               │
│                                                        │
│ 问题商品列表：                                           │
│  商品名称            问题                               │
│  iPhone Case 14  ❌ 缺少主图  ⚠️ 无条形码               │
│  Blue T-Shirt    ⚠️ 标题全大写  ⚠️ 描述过短              │
│  Wireless Earbs  ⚠️ 缺少品牌                            │
│                          [展开全部]  [仅显示错误]        │
└────────────────────────────────────────────────────────┘
6.2 审核状态展示
在现有 AdsCatalogTaskCard.tsx 的任务卡片底部新增：
同步结果：✅ 成功 245 个  ⚠️ 3 个商品未通过 GMC 审核  [查看详情]
点击「查看详情」打开弹窗（新组件 GmcReviewDetailModal.tsx）：
GMC 审核详情
┌──────────────────────────────────────────────────────────┐
│ 商品名称           状态        拒绝原因                    │
│ iPhone Case 14    ❌ 已拒绝    缺少 GTIN，图片尺寸不足     │
│ Blue T-Shirt      ⏳ 审核中    —                         │
│ Wireless Earbuds  ✅ 已通过    —                         │
│                                                          │
│ 最后检查时间：2026-06-17 14:30                             │
│                              [刷新状态]  [关闭]           │
└──────────────────────────────────────────────────────────┘
账户封禁 banner（显示在页面顶部）：
⛔ 您的 Google Merchant Center 账户已被暂停。请登录 GMC 查看具体原因并处理。
   [前往 Google Merchant Center →]

---
七、环境变量
需要在 .env 中新增以下变量（Spark 应用级，不是每个客户各自的。需要在google创建一个OAuth App，通过用户授权，获得权限）：
Google OAuth2 应用凭证（GMC + Google Ads 共用 OAuth Client）
GOOGLE_OAUTH_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=xxx
Google Ads Developer Token（应用级，每个使用 Ads API 的请求都需要）
GOOGLE_ADS_DEVELOPER_TOKEN=xxx
OAuth 回调地址（与 Shopify app URL 保持一致）
GOOGLE_OAUTH_REDIRECT_BASE=https://your-spark-app.com

---
八、实现优先级与分期
Phase 1（核心链路，优先）
- GMC OAuth2 授权流（start + callback + merchantId 选择）
- 筛选条件扩展（tag / productType / inStockOnly）
- 同步前预校验（googleProductValidator + 预览校验报告 + 同步前拦截弹框）
- 同步后审核状态检查（即时 + 30 分钟延迟）
- GMC 审核结果展示（任务卡片 badge + 详情弹窗）
Phase 2（广告绑定）
- Google Ads OAuth2 授权流
- 广告账户选择
- GMC ↔ Ads 关联状态查询
- 引导创建 Shopping 广告系列的跳转入口
Phase 3（后期优化）
- 每日 cron 后台审核状态巡检
- 筛选配置持久化（GoogleFeedConfig 表）
- Collection 筛选（需额外 Shopify GraphQL 查询）
- 商品数量上限提升 + 增量同步

---
九、关键外部 API 参考
API	用途	文档
GET /content/v2.1/accounts/authinfo
读取授权账号关联的所有 Merchant ID
Content API
GET /content/v2.1/{merchantId}/products
拉取 GMC 商品列表（含审核状态）
Content API
GET /content/v2.1/{merchantId}/accountstatuses/{merchantId}
查询账户级封禁状态
Content API
POST /content/v2.1/products/batch
批量推送商品（已实现）
Content API
GoogleAdsService.SearchStream
读取 Ads 账户信息
Google Ads API v17
CustomerService.ListAccessibleCustomers
列举可访问的广告账户
Google Ads API v17
MerchantCenterLinkService.ListMerchantCenterLinks
查询 GMC ↔ Ads 关联状态
Google Ads API v17
