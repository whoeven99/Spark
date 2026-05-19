# Spark 前端 UI 设计规范

本文档定义嵌入式 Shopify App 的**全站视觉与交互风格**。设计语言以 **计费与订阅页**（`/app/billing`）为标杆提炼，并通过 `pageUiStyles.tsx` 向其它页面推广；不涉及服务端、鉴权与业务计算。

**标杆实现**（改 UI 前先对照）：

| 文件 | 职责 |
|------|------|
| `app/routes/page/BillingPage.tsx` | 分区结构、状态展示、转化布局 |
| `app/routes/component/billing/billingPage.module.css` | 卡片、徽章、分段控件、表格等样式参考 |
| `app/routes/page/pageUiStyles.tsx` | 全站色值令牌与可复用布局 primitive |

---

## 1. 适用范围

| 包含 | 不包含 |
|------|--------|
| `app/routes/page/**`、`app/routes/component/**` 展示层 | `app/server/**`、Prisma、Webhook |
| `app/routes/app.tsx` 导航与壳 | 计费金额、token 计算逻辑 |
| `app/hooks/**`（仅影响 UI 时） | |

冲突时：UI 展示以本文档为准；数据与安全以 `docs/PROJECT_CONTEXT.md` 为准。

---

## 2. 设计原则

1. **先状态、后操作**：页顶可选告警 → 当前状态卡片（指标 / 进度）→ 主操作区 → 对比或说明 → 页脚信任/脚注。
2. **卡片化分区**：白底、12px 圆角、1px 浅灰边框、轻阴影；避免大面积色块横幅。
3. **克制用色**：灰白为底；**品牌绿**表示当前/成功/主进度；**蓝**表示推荐/强调列；**琥珀**表示待确认或用量告警。
4. **对齐 Shopify Admin**：优先 `s-*` 组件；自定义样式仅补充 Admin 未覆盖的定价/仪表盘类排版。
5. **全站一致**：色值来自 `pageColorTokens`，禁止在页面内随意写 `#e3e3e3` 等新灰度。

---

## 3. 色彩

统一使用 `pageColorTokens`（定义于 `pageUiStyles.tsx`，与 `billingPage.module.css` 对齐）。

| 令牌 / 语义 | 色值 | 用途 |
|-------------|------|------|
| `textPrimary` | `#202223` | 标题、主数字、价格 |
| `textBody` | `#303030` | 列表正文、特性项 |
| `textSecondary` | `#6d7175` | 副标题、标签、meta |
| 弱化脚注 | `#8c9196` | 区段脚注、辅助说明 |
| `border` | `#e1e3e5` | 卡片、分段容器边框 |
| `divider` | `#f1f2f3` | 表行、进度条轨道 |
| `surface` | `#ffffff` | 卡片、选中分段项 |
| `surfaceMuted` | `#f6f6f7` | 芯片底、信任条、表偶数行 |
| `surfaceSubtle` | `#fafafa` | 次要浅底 |
| `brandGreen` | `#008060` | 主强调、当前态、进度条 |
| `brandGreenDark` | `#208060` | 进度渐变 |
| `brandGreenDeep` | `#006e52` / `#1a6b52` | 深绿文案、渐变 |
| `brandGreenLight` | `#f1f8f5` | 胶囊 badge 底、当前卡顶渐变 |
| 品牌绿描边 | `#b7e0d0` | 状态胶囊边框 |
| `brandBlue` | `#2c6ecb` | 推荐描边、丝带、表高亮列 |
| 折扣黄 | `#ffea8a` / `#5c4813` | 角标 pill |
| 警告琥珀 | `#b98900`、`#fff4e5`、`#7a5200`、`#8a6116` | 待确认、低余额（如用量 ≥85%） |
| `critical` / `criticalText` | `#bf0711` / `#8a2712` | 破坏性操作（测试环境等） |

**语义映射（全站通用）**

| 状态 | 视觉 |
|------|------|
| 默认 | 白底 + `#e1e3e5` 边框 |
| 当前 / 生效 | 绿框 + `#f1f8f5` 浅顶渐变 + 实心绿 CTA |
| 推荐 | 蓝框 + 轻阴影（桌面可 `translateY(-2px)`） |
| 待确认 | 琥珀框 + 浅琥珀底 CTA |
| 告警 | `s-banner tone="warning"` 或琥珀进度/徽章 |

---

## 4. 字体、圆角与阴影

| 层级 | 规格 | 示例场景 |
|------|------|----------|
| 主数字 | `1.5rem–1.75rem`，`font-weight: 700` | Token 余额、价格 |
| 区块标题 | `1.125rem–1.25rem`，`600–700` | 「您的 Token 额度」「选择计划」 |
| 正文 / 列表 | `0.8125rem`，行高 `1.4–1.45` | 特性列表、表单说明 |
| 标签 / 脚注 | `0.75rem` 及以下 | 池标签、信任说明 |

| 元素 | 值 |
|------|-----|
| 卡片圆角 | `12px`（`pageColorTokens.radiusCard`） |
| 按钮 / 芯片 / 输入 | `8px`（`radiusControl`） |
| 胶囊 badge / 进度条 | `999px` |
| 卡片阴影 | `0 1px 2px rgba(0,0,0,0.04)` |
| 推荐/强调卡片 | 可叠加 `0 4px 16px rgba(44,110,203,0.12)` |

---

## 5. 布局与间距

### 5.1 页面骨架（全站默认）

```tsx
<s-page heading={t("xxx.pageTitle")}>
  <div style={pageContentStyle}>
    {/* 可选 s-banner */}
    {/* 若干 section：状态区 → 操作区 → 说明/对比 → 页脚 */}
  </div>
</s-page>
```

- **`pageContentStyle`**：`max-width: 1120px`；`display: flex; flex-direction: column; gap: 1.5rem`。
- **不用**页顶宽横幅介绍整页；场景说明放在**第一个区块的副标题**（计费页 `quotaSubtitle` 模式）。
- 需要侧栏时：外层 `twoColumnLayoutStyle`（`gap: 1.5rem`，`flexWrap: wrap`，列 `minWidth: 0`）。

### 5.2 区块标题行（全站复用）

对标计费页 `usageHeader` / `plansSectionHead`：

```
[ 主标题 + 副标题（左） ]     [ 状态胶囊 / 分段控件（右） ]
```

- 主标题：`1.125rem`，`#202223`。
- 副标题：`0.8125rem`，`#6d7175`，`max-width` 约 `28–36rem`。
- 状态胶囊：浅绿底 `#f1f8f5` + 绿字 + 细绿边框（`planBadge`）。

### 5.3 间距令牌

| 令牌 | 值 | 用途 |
|------|-----|------|
| 页面区块间距 | `1.5rem` | `pageContentStyle` gap |
| 双栏列间距 | `1.5rem` | `twoColumnLayoutStyle` |
| 卡片内边距 | `1rem–1.25rem` | 仪表盘、套餐卡 |
| 卡片栅格间距 | `1rem` | 三列网格 gap |
| Shopify `s-stack` | `small` / `base` / `large` | 组件内部列表 |

### 5.4 响应式断点（与计费页一致）

| 断点 | 行为 |
|------|------|
| `≤900px` | 多列卡片栅格改为单列，可 `max-width: 22rem` 居中 |
| `≤640px` | 页脚操作区纵向堆叠 |
| `≤520px` | 标题行纵向居中；芯片/grid 单列 |

---

## 6. 组件模式（抽象自计费页，推广到全站）

以下模式在计费页命名最全；其它页面应使用 `pageUiStyles` 中等价 primitive，或复用相同 CSS 语义。

| 模式 | 计费页参考类 | 全站用法 | `pageUiStyles` |
|------|--------------|----------|----------------|
| **状态卡片** | `usageCard` | 核心指标、进度、分项芯片 | `PageSurface`、`PageMetricCard` |
| **指标行** | `usageStatsRow` + 大数字 | 主 KPI + 右侧百分比徽章 | `PageMetricCard` |
| **进度条** | `progressTrack` / `progressFill` | 用量、任务完成度；≥85% 用琥珀色 | 按需 CSS Module |
| **分项芯片** | `poolChips` / `poolChip` | 多池/多维度并列数字 | `PageMetricCard` 网格 |
| **区段脚注** | `quotaFootnote` | 规则说明一行灰字 | `pageHintTextStyle` |
| **选项卡片栅格** | `planGrid` / `planCard` | 套餐、方案、档位选择 | `PageSurface` 网格 |
| **卡片状态** | `planCardCurrent` 等 | 当前 / 推荐 / 待确认 | 边框色 + 浅渐变顶 |
| **分段切换** | `intervalSegmented` | 月/年、模式切换 | 灰底 pill + 白底选中项 |
| **对比表** | `compareTable` | 功能矩阵；推荐列 `compareColHighlight` | `PageSurface` 内 table |
| **可选列表 + 摘要** | `packOptions` + `packSelectionSummary` | 单选卡片 + 选中后摘要条 | 自定义 |
| **页脚信任/说明** | `trustCheckout` | 结账、合规、帮助一行 | `pageTrustFootnoteStyle` |
| **页脚 meta** | `quotaFooter` | 周期、次要操作 | `pageSectionHeaderRowStyle` |

**主操作**：每区块一个 `s-button variant="primary"`，宽度可 `100%`（计费 `planCta`）；当前态用实心绿块 `planCurrentCta`，不用 disabled 灰按钮冒充。

---

## 7. 计费页分区（标杆结构）

其它复杂页可裁剪下列分区，但**顺序与视觉层级**建议保持一致：

```
s-page
└── pageContentStyle
    ├── s-banner?                    告警
    ├── section（状态区）            标题行 + 状态卡片 + 页脚 meta
    ├── section（主操作区）          标题行 + 分段控件 + 卡片栅格
    ├── section（补充购买/扩展）     可选
    ├── section（对比表）            可选
    └── 页脚说明行                   信任/合规文案
```

计费专属、暂不强制全站复制的样式保留在 `billingPage.module.css`（套餐丝带、年付等价价、购包 radio、测试取消条等）。新增类似 UI 时**先抽 token 到 `pageUiStyles`**，再考虑是否下沉到 CSS Module。

---

## 8. 技术边界

1. **组件**：仅 [Shopify App Home](https://shopify.dev/docs/api/app-home)（`s-page`、`s-button`、`s-banner` 等）；禁止 MUI / Ant Design / shadcn 等。
2. **反馈**：`shopify.toast.show()`；配额类用 `s-banner` + 可选 `s-link`。
3. **链接**：`<s-link href="...">`，保留 `location.search`。
4. **i18n**：可见文案一律 `t('namespace.key')`；日期/数字用 `i18n.language` + `toLocaleString`。
5. **角色名**：统一 **AI Assistant**。
6. **样式优先级**：`s-*` 属性 → `pageUiStyles.tsx` → 域内 `*.module.css` → 局部 `style`（尽量少）。
7. **禁止**：全局 CSS、Tailwind、硬编码色值、硬编码句子。

---

## 9. `pageUiStyles.tsx` 导出（全站入口）

| 导出 | 用途 |
|------|------|
| `pageColorTokens` | 色值、圆角、阴影**唯一来源** |
| `pageContentStyle` | 单栏页容器 |
| `twoColumnLayoutStyle` / `twoColumnMainStyle` / `twoColumnSideStyle` | 双栏页 |
| `PageSurface` / `PagePanel` | 白底圆角分区（对标 `usageCard`） |
| `PageMetricCard` | 顶栏强调 + 指标网格 + 页脚 |
| `PageSectionHeader` | 页内主标题 + 副标题 + 可选胶囊（替代页顶横幅） |
| `pageSectionHeaderRowStyle` | 标题行布局 |
| `pageBlockTitleStyle` / `pageSectionSubtitleStyle` | 主标题 / 副标题 |
| `pageStatusBadgeStyle` | 绿色状态胶囊 |
| `pageSectionTitleStyle` / `pageSectionMajorTitleStyle` | 卡片内区块标题 |
| `pageAccentBadgeStyle` | 绿色文字 badge（简化版） |
| `pageHintTextStyle` / `pageMetaTextStyle` | 表单 hint、meta 行 |
| `pageTrustFootnoteStyle` | 页脚灰底信任/说明 |
| `pageFieldLabelStyle` / `pageSelectStyle` / `pageTextareaStyle` | 表单控件 |
| `pageEmptyStateStyle` / `formErrorBoxStyle` | 空态、错误 |
| `stickyAsideColumnStyle` | 侧栏固定 |

`pageIntroBannerStyle` 已**不作为全站默认**；新页面用「区块标题 + 副标题」替代（见 §5.2）。

---

## 10. Shopify 组件白名单

| 用途 | 组件 |
|------|------|
| 页面根 | `s-page`（必填 `heading`） |
| 告警 | `s-banner` |
| 布局 | `s-stack`、`s-box`（简单场景） |
| 文案 | `s-paragraph`、`s-unordered-list` |
| 操作 | `s-button`、`s-link` |
| 表单 | `s-text-field` |
| 状态 | `s-badge` |
| 导航 | `s-app-nav` |

页面级分区优先 `PageSurface` / `pageContentStyle`，而非堆叠 `s-section` 替代自定义栅格。

---

## 11. 反馈与文案

| 场景 | 做法 |
|------|------|
| 成功/失败 | `shopify.toast.show` |
| 需立即注意 | 页顶 `s-banner` |
| 提交中 | `s-button` `disabled` + i18n 进行中文案 |
| 空数据 | 灰字说明 + 可选 secondary 引导 |
| 文案键 | `billing.*`、`chat.*`、`translation.*` 等，见 `app/locales/` |

---

## 12. 禁止与推荐

**禁止**

- 第三方 UI 库、全局 CSS、Tailwind
- 页顶大面积渐变引导条（改用区块副标题）
- 与 §3 色板脱节的渐变/阴影
- 硬编码商户可见文案
- 未授权修改 `app.tsx` 导航

**推荐**

- 新页：`s-page` → `pageContentStyle` → 状态卡片 → 主操作 → 脚注
- 改色/间距：只改 `pageColorTokens` 或 `billingPage.module.css` + 同步 `pageUiStyles`
- 对照 `BillingPage.tsx` 做视觉自检
- 双栏 `flexWrap` + `minWidth: 0` 防溢出

**聊天页说明**：`ChatPage` 消息流区域可为交互密度保留 `chatPageStyles.ts`；**新增非聊天区块**（侧栏、卡片入口）仍应遵循本规范。

---

## 13. Agent 执行清单

1. 阅读本文档 + 打开 `BillingPage.tsx`、`pageUiStyles.tsx`。
2. 确认改动在 §1 范围内；色值用 `pageColorTokens`。
3. 新 UI 映射到 §6 组件模式之一，避免发明新视觉语言。
4. 文案同步 `app/locales/en` 与 `zh`。
5. 说明中注明参照的 §6 模式与是否触及 `billingPage.module.css`。

用户需求与本文冲突时，以用户当次指令为准并标注偏离点。

---

## 14. 官方参考

- [Shopify App Home](https://shopify.dev/docs/api/app-home)
- [App Bridge](https://shopify.dev/docs/api/app-bridge)

与 Shopify 官方冲突且无本文特例时，以官方文档为准。
