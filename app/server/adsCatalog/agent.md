# 广告 Agent 说明

本文件收纳广告这一族（Catalog / 创建 / 编辑 / 洞察）的实现细则。这些细则原先内联在根 `AGENTS.md` 第 4 节的一个表格单元里，但只在改动本族代码时才需要；下沉到此处后由 `.cursor/rules/ads-agent.mdc` 按路径条件触发加载。

改动本族任何文件前先读本文件。全局边界（外部平台所有权、Theme 扩展与 Pixel 审核期姿态、一级导航 `/app/ads`）仍以根 `AGENTS.md` 第 1、3、5 节为准。

## 1. 代码位置

| 域 | 目录 |
|---|---|
| Catalog（OAuth、目录同步、Pixel） | `app/server/adsCatalog/` |
| 广告创建 | `app/server/adsCreate/` |
| 广告编辑 | `app/server/adsEdit/` |
| 广告洞察 | `app/server/adsInsights/` |

页面在 `/app/ads`（`app.ads.tsx` 左栏能力目录 + Outlet）。OAuth 回调见 `app/routes/ads.*.callback.tsx`（`google-ads`、`google-merchant`、`google-analytics`、`google-search-console`、`meta-ads`、`meta-catalog`、`tiktok-catalog`）。

## 2. 缓存与实时性

下拉选项类只读列表（Meta Page、TikTok Pixel / Catalog、广告主）走 `enumerationCache.server.ts` 的进程内 TTL 缓存，路由支持 `?refresh=1` 强刷。

**绑定校验、同步预检、上传确认等需要实时状态的路径禁止接缓存。** 这些路径拿到过期数据会让商户在错误的账户上完成不可逆绑定。

## 3. Google Ads 凭证失效判据

- 按 `accessTokenExpiresAt` 判断是否刷新 access token。
- 按 `loginCustomerIdVerifiedAt` 判断是否重新探测 login-customer-id。

两个时间戳在对应值变化时**必须**失效，否则会拿旧 login-customer-id 打错账户。

## 4. 洞察的读库与回源

`structure` 视图默认读库（`adsInsights/store.server.ts`）：

- 命中新鲜快照直接返回，过期才回源。
- 回源固定拉 30 天，再按请求区间切窗口（不要按请求区间去回源，否则不同区间互相打架）。
- `?refresh=1` 强刷。
- 回源失败用过期快照兜底，不要报错空页。

`keywords` / `searchTerms` / `creatives` 这些深层级明细，以及沙盒模式，仍实时拉、不落库。

洞察总览 `adsInsights/overview.server.ts` 是纯库内聚合，**不回源**；凭证只 select `platform` / `externalAccountId` / `updatedAt`。

## 5. 计数与健康

- 商品审核计数统一走 `productStatusSummary.server.ts` 的 `groupBy` 全量统计。**不能用分页样本行数当总数。**
- 接入链路健康 `adsHealth.server.ts` 由凭证 JSON 派生，只输出可见标识（不含 token）。
- 唯一需要实时探测的 GMC↔Ads 关联走 `/api/ads-overview/link-status`，由前端异步调用，失败降级为「未知」而不是「未关联」。

## 6. Theme App Embed 配置下发

Theme 扩展本体在 `extensions/spark-tiktok-pixel/`，审核期整包 `toml.off`（见根 `AGENTS.md` 第 1 节）。配置下发口径：

- **TikTok Pixel**：经 `spark_tiktok.pixel_config` 下发。
- **Google 再营销/转化**：经 app-owned Shop metafield `google_remarketing_config` 下发，含 `tagId`（AW-数字）、可选 `conversionLabel`、`enhancedConversions`。配了 label 时店面事件按 `send_to=AW-ID/label` 上报为 Google Ads 转化。整条链路受 Customer Privacy API 营销同意门禁控制。
- **Ciwi Image Switcher**：经 App Proxy 做图片替换与 IP 地区跳转。

Theme block 只发送**非 purchase** 店面事件。purchase 由商户手动安装的实验性 Custom Pixel 发送，Google 官方不支持该运行方式，UI 必须持续展示数据损失、重复上报与 Support 不保障告警。**审核期向导不生成/不展示 purchase Custom Pixel 粘贴。**

Google Pixel 三步向导在 `/app/ads/google-pixel`（Nabu 风格：添加像素 / 开启 App Embed / 创建像素）。App Embed 启用状态经 `read_themes` 读取主题 `config/settings_data.json` 检测（`appEmbedStatus.server.ts`）。

## 7. 存储约定

以下三条在根 `AGENTS.md` 第 5 节也有，改库相关代码时以这里为准：

- `AdPlatformCredential.externalAccountId` 是索引列，由 `credentialStore.server.ts` 按平台从凭证 JSON 派生（GMC merchantId、Meta/TikTok catalogId、广告账户 ID），webhook 靠它反查店铺。不要再用 `json_extract` 扫全表。
- `AdMetricDaily` 只存广告级**可加**指标。更高层级和更长区间一律 SUM 上卷；CTR / CPC / ROAS 等派生指标查询时算，不落库。`reach` / `frequency` 是去重指标，跨天无法还原，因此不入库、上卷后返回 null。新增指标前先判断它是否可加。
- 审核状态（`GmcProductStatus` / `MetaProductStatus`）与广告实体（`AdEntity`）都是「全量重建」写法：`$transaction` 里 `deleteMany` + 分批 `createMany`，不要退回逐条 upsert。因此**拉取必须翻完分页**——截断会把没拉到的商品当成已下架。
