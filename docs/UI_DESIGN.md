# Spark 前端 UI 设计规范

本文档**仅约束嵌入式 Shopify App 的前端展示层**（页面结构、组件选用、布局、样式、文案呈现与交互反馈）。不涉及服务端逻辑、鉴权、计费计算、翻译流水线等。

Agent 在优化或新增 UI 前必须先阅读本文档，并优先对照文内「标杆页面」与「组件白名单」实现。

---

## 1. 适用范围

### 1.1 受约束路径

| 路径 | 说明 |
|------|------|
| `app/routes/page/**` | 页面级 React 组件 |
| `app/routes/component/**` | 按功能域拆分的展示组件 |
| `app/routes/app.tsx` | 应用壳、导航、`s-app-nav` |
| `app/routes/app.*.tsx` | 路由入口中**仅 JSX 展示部分**（loader/action 逻辑不在此规范范围） |
| `app/routes/auth.login/**` | 登录页 UI |
| `app/hooks/**` | 仅当改动直接影响 UI 状态展示时参照本文档 |

### 1.2 不在范围

- `app/server/**`、`prisma/**`、Webhook、API action 业务实现
- `docs/PROJECT_CONTEXT.md` 中的架构与部署约定（冲突时：UI 展示以本文档为准；数据与安全以 `docs/PROJECT_CONTEXT.md` 为准）

---

## 2. 技术边界（硬约束）

1. **组件体系**：使用 [Shopify App Home Web Components](https://shopify.dev/docs/api/app-home)（`s-page`、`s-section`、`s-stack` 等）。禁止引入 MUI、Ant Design、shadcn、Chakra 等第三方 UI 库。
2. **应用桥**：用户可见的成功/失败轻提示用 `useAppBridge()` → `shopify.toast.show(message)`，不自建 toast 组件。
3. **路由内链**：页面间跳转使用 `<s-link href="...">`，并保留嵌入式 query（`location.search`），与现有页面一致。
4. **国际化**：所有面向商户的可见文案必须通过 `react-i18next` 的 `t('...')`；禁止在组件内硬编码中文/英文句子（调试 `console` 除外）。
5. **角色名**：助手统一展示为 **`AI Assistant`**（badge 或文案键），与 `docs/PROJECT_CONTEXT.md` 一致。
6. **样式优先级**：
   - 首选：`s-*` 自带属性（`padding`、`gap`、`tone`、`variant` 等）
   - 次选：共享 `app/routes/page/pageUiStyles.tsx`（页引导、卡片、指标、双栏）
   - 再次：与页面同域的 `*.module.css`（**仅**计费定价专属组件）
   - 再次：局部 `style={{ ... }}` 或聊天域 `chatPageStyles.ts`
   - 禁止：新增全局 CSS 文件、随意引入 Tailwind

---

## 3. 页面骨架

### 3.1 标准单栏页

适用于：诊断报告、简单表单页。

```tsx
<s-page heading={t("xxx.pageTitle")}>
  <s-section heading={t("xxx.sectionTitle")}>
    <s-stack direction="block" gap="base">
      {/* 内容 */}
    </s-stack>
  </s-section>

  <s-section slot="aside" heading={t("xxx.asideTitle")}>
    {/* 次要说明、提示列表 */}
  </s-section>
</s-page>
```

**标杆**：`app/routes/app.additional.tsx`（诊断报告）

### 3.2 双栏响应式页

适用于：翻译创建 + 监控、生成描述、整图翻译。

- 外层：`display: flex; flexWrap: wrap; gap: 1.5rem; alignItems: flex-start`
- 主栏：`flex: 1 1 360px` 或 `flex: 2 1 360px`，`minWidth: 0`
- 侧栏：`flex: 1 1 360px` 或 `flex: 3 1 480px`

**标杆**：`app/routes/page/TranslationPage.tsx`、`GenerateDescriptionPage.tsx`、`PictureTranslatePage.tsx`

### 3.3 聊天全屏工作区

`ChatPage` 在 `s-section` 内使用固定视口高度与内部滚动，属于**特例**；新页面不要复制其 `calc(100dvh - 140px)` 除非明确要做聊天类 UI。

**标杆**：`app/routes/page/ChatPage.tsx`

### 3.4 计费营销型布局

计费页使用 `billingPage.module.css` 实现套餐卡片、对比表、开关等**定价专属**排版；共享的视觉语言（页引导、卡片、指标区）已提取到 `app/routes/page/pageUiStyles.tsx`，其它业务页应优先复用该文件，而不是复制 CSS Module。

**标杆**：`app/routes/page/BillingPage.tsx` + `app/routes/component/billing/billingPage.module.css`

### 3.5 计费页设计体系（Spark 共享视觉语言）

计费页是当前最完整的「状态展示 + 决策转化」页面。其设计思路可抽象为 **四层信息架构**，并通过 `pageUiStyles.tsx` 向其它页面复用。

#### 3.5.1 信息架构（自上而下）

| 层级 | 计费页实现 | 其它页映射 |
|------|------------|------------|
| **页引导** | `pageIntroBannerStyle("billing")` + `billing.pageIntro` | 各页 `pageIntro` / `intro` / `pageSubtitle`，统一放在 `s-page` 下第一块 |
| **告警** | 余额不足时 `s-banner tone="warning"` | 生成描述页等同理，附 `s-link` 跳转计费 |
| **当前状态** | 区块标题 + 绿色 `planBadge` + **额度卡**（`usageCard`） | 诊断页核心看板 → `PageMetricCard`；翻译/生成描述 → `PageSurface` 表单区 |
| **主操作 / 对比** | 套餐栅格、月/年切换、对比表、购包 | 仅定价类页面保留；表单页用双栏 `PageSurface` |

阅读路径：**先知道页面做什么 → 再看当前状态 → 最后操作或选方案**。

#### 3.5.2 视觉令牌（与 `billingPage.module.css` 对齐）

| 用途 | 值 | 说明 |
|------|-----|------|
| 正文/标题 | `#202223` | 区块标题、指标数值 |
| 次要说明 | `#6d7175` | 引导文案、指标标签 |
| 边框 | `#e1e3e5` | 卡片、表格 |
| 分隔线 | `#f1f2f3` | 指标区、表行 |
| 品牌绿 | `#008060` / `#208060` | 当前方案、强调 badge、开关选中态 |
| 推荐蓝 | `#2c6ecb` | 推荐套餐描边（仅计费） |
| 待确认琥珀 | `#b98900` | PENDING 订阅态（仅计费） |
| 圆角 | `12px` 卡片 / `8px` 按钮与 meta | 全站卡片统一 |
| 阴影 | `0 1px 2px rgba(0,0,0,0.04)` | 轻阴影，避免过重 |
| 区块间距 | `1.5rem` | `pageContentStyle` 纵向 gap |
| 内容最大宽 | `1120px` | 单栏与双栏外层 `pageContentStyle` |

#### 3.5.3 共享 primitive（`pageUiStyles.tsx`）

| 导出 | 用途 | 来源（计费页） |
|------|------|----------------|
| `pageColorTokens` | **全站色值单一来源**（禁止页面内硬编码 `#e3e3e3` 等） | §3.5.2 视觉令牌 |
| `pageContentStyle` | 单栏内容区 max-width + 纵向间距 | `.page` |
| `pageIntroBannerStyle(tone)` | 左色条 + 浅渐变引导条 | 计费页引导（泛化多 tone） |
| `PageSurface` | 白底 12px 圆角分区 | 套餐/对比表外框语义 |
| `PageMetricCard` | 顶栏强调 + 指标网格 + 页脚 | `usageCard` |
| `pageSectionHeaderRowStyle` | 标题与 badge 同行 | `usageHeader` |
| `pageAccentBadgeStyle` | 绿色状态 badge | `planBadge` |
| `pageStatusCardStyle` | 带 badge 的状态行容器 | 健康诊断行 |
| `PagePanel` | 替代 `s-box background="subdued"` 的白底卡片 | 各分区容器 |
| `pageFieldLabelStyle` / `pageSelectStyle` / `pageTextareaStyle` | 表单控件统一样式 | 计费表单语义 |
| `pageEmptyStateStyle` | 虚线空态 | 生成结果空态 |
| `formErrorBoxStyle` | 表单错误提示 | — |
| `twoColumnLayoutStyle` 等 | 双栏响应式 | §3.2 |

**何时仍用 CSS Module**：套餐卡片三态（current / pending / recommended）、月年 switch、对比表、购包 radio — **仅** `BillingPage` 保留在 `billingPage.module.css`。

#### 3.5.4 跨页应用对照

| 页面 | 模板 | 已应用的计费设计语言 |
|------|------|----------------------|
| 计费 | 3.4 + 3.5 | 完整参考实现 |
| 诊断报告 | 3.1 + 3.5 | 页引导、`PageMetricCard` 核心看板、`PageSurface` 分区 |
| 翻译 | 3.2 + 3.5 | 页引导、`pageContentStyle`、双栏 `PageSurface` |
| 生成描述 | 3.2 + 3.5 | 页级引导、双栏 `PageSurface`、空态/错误盒 |
| 整图翻译 | 3.2 + 3.5 | 同翻译页 |
| AI Assistant | 3.3 + 3.5 | 页引导、侧栏 `PageSurface`（聊天主区仍用 §3.3 特例） |

新增页面默认流程：`pageIntroBannerStyle` →（可选 `s-banner`）→ `pageContentStyle` → `PageSurface` / `PageMetricCard` → 主操作。

---

## 4. 组件白名单

| 用途 | 组件 | 备注 |
|------|------|------|
| 页面根 | `s-page` | 必须设 `heading` |
| 分区 | `s-section` | 侧栏用 `slot="aside"` |
| 布局 | `s-stack` | `direction`: `block` / `inline`；`gap`: `none` / `small` / `base` / `large` |
| 容器 | `s-box` | 简单内嵌块；**页面级分区优先** `PageSurface`（§3.5） |
| 正文 | `s-paragraph` | 不要用裸 `<p>` 展示主文案 |
| 列表 | `s-unordered-list` + `s-list-item` | 提示、诊断结论 |
| 按钮 | `s-button` | `variant`: `primary` / `secondary`；`tone`: 按需；提交用 `type="submit"` |
| 表单 | `s-text-field` | 带 `label`；注意 Web Component 的 Enter 行为（见 `ChatInput`） |
| 状态 | `s-badge` | `tone`: `success` / `warning` / `critical` / `info` / `neutral` |
| 告警 | `s-banner` | `tone="warning"` 等；余额不足等 |
| 链接 | `s-link` | 站内路径带 query |
| 导航 | `s-app-nav` + `s-link` | 见 `app/routes/app.tsx` |

未在白名单的 `s-*` 组件：使用前查阅 Shopify 文档，并在 PR 中说明用途。

---

## 5. 布局与间距

| Token / 写法 | 使用场景 |
|--------------|----------|
| `gap="small"` | 紧凑列表、表单项之间 |
| `gap="base"` | 默认区块内间距 |
| `gap="large"` | 翻译页等多块 `s-section` 之间 |
| `1.5rem`（flex 容器 gap） | 双栏页面列间距 |
| `padding="small"` / `base` | 卡片、输入区 |

**对齐**：工具栏类一行操作用 `s-stack direction="inline"` + `justifyContent="space-between"` + `alignItems="center"`。

**主操作**：每区块最多一个 `variant="primary"`； destructive 场景使用合适 `tone`，不堆多个 primary。

---

## 6. 色彩与字体（与现网一致）

优先使用 Shopify 语义（`s-badge tone`、`s-banner tone`、`background="subdued"`）。若必须用自定义色，与现有文件保持一致：

| 用途 | 参考值 |
|------|--------|
| 正文/标题深灰 | `#202223` |
| 次要说明 | `#6d7175` |
| 边框 | `#e1e3e5` / `#e3e3e3` |
| 浅底卡片 | `#fafafa` |
| 品牌绿（计费强调） | `#008060`、`#208060` |

聊天流式气泡等**仅聊天域**允许使用 `chatPageStyles.ts` / 局部 gradient，不要扩散到其它业务页。

---

## 7. 文案与 i18n

1. 文案键按页面命名空间：`chat.*`、`translation.*`、`billing.*`、`generate.*`、`pictureTranslate.*`、`additional.*`、`nav.*`、`common.*`。
2. 带变量的字符串用 `t('key', { count, value })`，不在 TSX 里拼接句子。
3. 新增键写入 `app/locales/<lang>/common.json`（通过 `app/i18n/resources.ts` 聚合）。
4. 语言切换 UI 在 `app.tsx`：选项标签用**各语言原生写法**（`LANGUAGE_NATIVE_LABELS`），不随 `t()` 变化。
5. 日期/数字：用 `toLocaleString` / `toLocaleDateString`，并传入 `i18n.language`（见 `BillingPage`）。

---

## 8. 反馈与状态

| 场景 | 做法 |
|------|------|
| 操作成功/失败 | `shopify.toast.show(...)` |
| 需用户注意的配额/权限 | 页顶 `s-banner` + 可选 `s-link` 去计费 |
| 提交中 | `s-button` 的 `disabled` 或 loading 文案（`t('common.loading')` 等），避免重复点击 |
| 列表加载 | 优先 `s-stack` + 骨架（见 `ChatStreamingSkeleton` + module css） |
| 空数据 | `s-paragraph` 说明 + 可选 secondary 按钮引导操作 |

表单校验错误：先 toast 简短说明；字段级错误若已有 `s-text-field` 错误态则沿用，不新增自定义红色 div 体系。

---

## 9. 领域组件约定

| 域 | 目录 | 说明 |
|----|------|------|
| 聊天 | `component/chat/` | 消息气泡、输入、流式骨架；卡片：`GenerateDescriptionChatCard`、`PictureTranslateChatCard`、`TranslationTaskChatCard` |
| 翻译 | `component/translation/` | 任务监控、JSON Runtime 状态面板 |
| 计费 | `component/billing/` | 定价专属样式在 `billingPage.module.css`；共享 primitive 在 `page/pageUiStyles.tsx` |
| 商品 | `component/product/` | `ProductSelector` 等 |
| 整图翻译 | `component/pictureTranslate/` | `PictureTranslateShell` / `Form` / `ResultPanel`；`variant="page" \| "card"` |

**页面 vs 卡片**：同一业务能力若同时存在独立页与聊天卡片，共享逻辑放 hook/context，UI 只改展示密度，不复制两套业务状态机。

---

## 10. 禁止事项（Don't）

- 引入非 Shopify 的 UI 组件库或图标库（除非项目已有且本文档后续显式允许）
- 在 `app/routes` 下新增全局 `.css`（`* .module.css` 除外）
- 硬编码商户可见文案
- 用 `<div>` 替代 `s-page` / `s-section` 做页面级结构
- 为「好看」添加大面积渐变、阴影、圆角体系与 Admin 风格脱节（**计费页顶栏渐变、套餐三态除外**；其它页仅允许 `pageIntroBannerStyle` 浅渐变）
- 修改 `app/routes/app.tsx` 导航结构，除非任务明确要求
- 把 `AI Assistant` 改成其它品牌名

---

## 11. 推荐事项（Do）

- 新页面从 **3.1 / 3.2 / 3.5 模板** 复制结构，再填内容；定价页才用 **3.4**
- 对照 **标杆文件** 与 `pageUiStyles.tsx`，保持 gap、卡片、badge 用法一致
- 双栏布局小屏自动折行（`flexWrap: 'wrap'` + `minWidth: 0`）
- 破坏性操作前用浏览器 `confirm` 或现有对话框模式（`chatPageStyles` 的 modal 样式），不新建 UI 框架
- 改动后自检：lint、嵌入式宽度下是否溢出、是否所有字符串已 i18n

---

## 12. 标杆页面索引

| 页面 | 文件 | 学习点 |
|------|------|--------|
| **共享样式** | `app/routes/page/pageUiStyles.tsx` | 页引导、PageSurface、PageMetricCard、双栏、空态 |
| AI Assistant | `app/routes/page/ChatPage.tsx` | 聊天布局、快捷问题、aside、流式 UI |
| 诊断报告 | `app/routes/app.additional.tsx` | 页引导 + `PageMetricCard` 指标看板 + `PageSurface` |
| 翻译 | `app/routes/page/TranslationPage.tsx` | 表单 + 双栏 + toggle 式 resource 按钮 |
| 生成描述 | `app/routes/page/GenerateDescriptionPage.tsx` | 计费 banner、页引导、双栏、商品选择 |
| 整图翻译 | `app/routes/page/PictureTranslatePage.tsx` | Provider + 双 section |
| 计费 | `app/routes/page/BillingPage.tsx` | 完整四层架构；定价 UI 见 CSS Module |
| 应用壳 | `app/routes/app.tsx` | 导航、`s-app-nav`、语言切换 |

---

## 13. Agent 执行清单

优化 UI 时按顺序执行：

1. 阅读本文档，确认改动落在 **§1.1** 范围内。
2. 打开 **§12 标杆页面** 与 `pageUiStyles.tsx`，对齐结构与组件。
3. 仅改展示相关代码；不改动 loader/action/server 除非用户明确要求。
4. 新增文案：同步 `app/locales/` 下各语言 JSON（至少 `en` 与 `zh`，与其它页面一致）。
5. 完成 **§11 Do** 与 **§10 Don't** 自检。
6. 在改动说明中列出：遵循的模板（3.1 / 3.2 / 3.3 / 3.4 / 3.5）与参照的标杆文件。

若用户需求与本文档冲突，以**用户当次明确指令**为准，并在说明中标注偏离点。

---

## 14. 官方参考

- [Shopify App Home](https://shopify.dev/docs/api/app-home)
- [App Bridge](https://shopify.dev/docs/api/app-bridge)

与 Shopify 官方模式冲突且无本文档特例时，以官方文档为准。

---

## 15. 外部设计参考 (Turso & Render)

在特定场景下（如脱离 Shopify 官方约束的独立页、外部展示模块、或需要引入高级科技感设计的定制化页面），可以参考以下现代云平台的设计系统特征，但**请注意：在 Shopify 嵌入式应用内部，仍必须优先遵守上文的 Shopify 规范**。

### 15.1 Turso 设计系统特征
Turso 采用现代、硬核且精致的极客美学（Hacker Aesthetic），主要基于 Radix Themes 构建：
- **核心色彩**：以深邃的深空黑（Deep Space `#0d1318`）为主背景，搭配极客青/黑客蓝绿（Hacker Teal `#4ff7d1`）作为主要交互与强调色。
- **辅助色彩**：使用电光紫（Electric Violet `#d946ef`）与霓虹粉（Neon Pink `#a21caf`）作为点缀。
- **字体排版**：使用 Inter 字体，字重分布从 400 到 800，基础字号 14px，采用 Minor Third (1.2) 缩放比例。
- **布局特点**：8px 基础网格间距，40px 区块间距；卡片和通用元素通常采用 12px 的圆角（Border Radius），强调精准和功能性。

> 💡 **MCP 探索建议**：若想获取更多具体色值、阴影和间距代码，可以尝试通过 `WebFetch` 工具读取之前搜索保存的本地文件：`C:\Users\whoeven\.cursor\projects\c-repo-Spark\agent-tools\65ded69f-c6f6-4cc4-812c-326b87a0eb6d.txt` (Turso 的 Refero 设计变量导出)。

### 15.2 Render 设计系统特征
Render 的设计更偏向轻量、明亮且具有呼吸感的现代云原生风格：
- **视觉基础**：以清爽的纯白（White `#ffffff`）作为主背景（也支持夜间模式），搭配深灰色文字（Dark Charcoal `#0d0d0d`）。
- **品牌渐变与强调色**：广泛使用日落紫（Sunset Violet）与暮光（Twilight）渐变；强调色包括葡萄紫（Grape Glow `#8a05ff`）、数字绿（Digital Emerald `#009e7a`）、深李子紫（Deep Plum `#48008c`）、亮粉与天蓝等。
- **字体排版**：展示类字体使用 Robertt，基础字号 16px，采用 Minor Third (1.2) 缩放比例，最大可达 80px 的超大标题。
- **界面组件**：界面设计上包含丰富的面包屑导航、全局搜索与卡片化服务管理面板。注重无障碍设计（符合低视力标准）与高对比度。

> 💡 **MCP 探索建议**：若想获取 Render 具体 UI 代码片段与变量，可查看本地保存的变量快照：`C:\Users\whoeven\.cursor\projects\c-repo-Spark\agent-tools\20aee621-3ab5-4b8b-9519-ecb7759b75be.txt`。
