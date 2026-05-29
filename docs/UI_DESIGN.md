---
name: Spark Shopify Tools UI
status: draft
design-system-target:
  visual-goal: Shopify embedded app
  component-layer: Ant Design
  styling-layer: Tailwind CSS
  interaction-source: docs/INTERACTION_DESIGN.md
colors:
  text-primary: "#1a1d1f"
  text-secondary: "#6b7280"
  text-footnote: "#9ca3af"
  surface-page: "#f6f6f7"
  surface-card: "#ffffff"
  surface-subtle: "#fafafa"
  surface-muted: "#f5f6f8"
  border-default: "#e2e5e9"
  border-subtle: "#dde1e6"
  divider: "#f0f2f4"
  interactive-primary: "#008060"
  interactive-primary-hover: "#006e52"
  interactive-subtle: "#edfaf5"
  info: "#4070f4"
  success: "#00a67c"
  warning: "#b45309"
  warning-subtle: "#fff7ed"
  critical: "#dc2626"
  critical-subtle: "rgba(220, 38, 38, 0.07)"
typography:
  font-family-base: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
  page-title:
    font-size: 24px
    font-weight: 700
    line-height: 1.25
  section-title:
    font-size: 18px
    font-weight: 600
    line-height: 1.35
  body:
    font-size: 14px
    font-weight: 400
    line-height: 1.6
  caption:
    font-size: 12px
    font-weight: 500
    line-height: 1.45
radius:
  control: 9px
  card: 14px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  section-gap: 24px
shadow:
  card: "0 2px 10px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)"
  modal: "0 16px 40px rgba(0, 0, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.08)"
component-mapping:
  page-shell: shared-app-shell
  page-card: shared-card
  tabs: shared-tabs
  form: shared-form
  modal: shared-modal
  table: shared-table
  status-tag: shared-status-tag
  empty-state: shared-empty-state
component-tokens:
  button:
    primary-bg: "{colors.interactive-primary}"
    primary-bg-hover: "{colors.interactive-primary-hover}"
    primary-text: "#ffffff"
    default-bg: "{colors.surface-card}"
    default-border: "{colors.border-default}"
    default-text: "{colors.text-primary}"
    radius: "{radius.control}"
  input:
    bg: "{colors.surface-card}"
    border: "{colors.border-default}"
    border-hover: "{colors.interactive-primary}"
    text: "{colors.text-primary}"
    placeholder: "{colors.text-footnote}"
    radius: "{radius.control}"
  card:
    bg: "{colors.surface-card}"
    bg-subtle: "{colors.surface-subtle}"
    border: "{colors.border-default}"
    shadow: "{shadow.card}"
    radius: "{radius.card}"
  modal:
    bg: "{colors.surface-card}"
    border: "{colors.border-subtle}"
    shadow: "{shadow.modal}"
    radius: "{radius.card}"
  tag:
    radius: "{radius.pill}"
    success-bg: "rgba(0, 166, 124, 0.12)"
    success-text: "{colors.success}"
    warning-bg: "{colors.warning-subtle}"
    warning-text: "{colors.warning}"
    critical-bg: "{colors.critical-subtle}"
    critical-text: "{colors.critical}"
    neutral-bg: "{colors.surface-muted}"
    neutral-text: "{colors.text-secondary}"
  table:
    header-bg: "{colors.surface-subtle}"
    row-bg: "{colors.surface-card}"
    border: "{colors.divider}"
  alert:
    info-bg: "rgba(64, 112, 244, 0.08)"
    info-text: "{colors.info}"
    warning-bg: "{colors.warning-subtle}"
    warning-text: "{colors.warning}"
    critical-bg: "{colors.critical-subtle}"
    critical-text: "{colors.critical}"
---

# Spark 前端 UI 设计规范

本文档定义 Spark 作为嵌入式 Shopify App 时，所有 tool 页面的视觉系统、组件选型边界与代码落地规则。  
`docs/INTERACTION_DESIGN.md` 负责流程、页面层级与任务模型；本文只回答三个问题：

1. 页面应该看起来像什么
2. 组件应该优先怎么选
3. 后续如何从代码层面统一所有 tools 的风格

当前项目会持续集成更多 Shopify 能力，因此视觉规范必须满足两件事：

- **首先像 Shopify App**，而不是像一个外部营销站或独立后台
- **其次可工程化复用**，而不是每个 tool 单独写一套样式

品牌色目前**尚未确定**，因此本文档不建立额外品牌色体系；在品牌未冻结前，统一采用 Shopify Admin 风格的中性色与语义色，并通过统一主题 token 管理。

同时，这份文档不是一次性说明书，而是一个**持续演化的设计系统文档**：

- 设计规范变更时，优先更新本文档，再更新组件与页面实现
- 本文档既服务人类协作，也服务 AI/Agent 生成与审查 UI
- 中期目标是将其演进为更接近 `DESIGN.md` 的结构化设计资产

---

## 0. 机器可读草案说明

文档顶部的 YAML front matter 是一版**机器可读 token 草案**，用途如下：

- 为未来的 `Ant Design theme token` 提供初始语义值
- 为 `Tailwind theme` 提供统一的颜色、间距、圆角和阴影来源
- 为共享组件层提供稳定的组件映射命名

当前约束：

1. front matter 是草案，不代表工程已经全部接入
2. 具体组件 API 仍以共享封装层为准
3. 当正文规则与 token 草案冲突时，先修正文档并同步 token，不允许两层长期不一致
4. `"{colors.xxx}"` 这类写法表示语义引用，后续应被映射到 `Ant Design theme token` 与 `Tailwind theme`

---

## 1. 适用范围

| 包含 | 不包含 |
|------|--------|
| `app/routes/page/**`、`app/routes/component/**` 的展示层 | `app/server/**`、Prisma、Webhook、模型调用 |
| `app/routes/app.tsx` 与各 tool 页的页面壳、局部导航 | 业务规则本身 |
| `app/hooks/**` 中直接影响视觉状态的前端逻辑 | 纯数据变换逻辑 |
| 通用样式与视觉 primitive | 服务端权限与计费判断 |

冲突处理顺序：

1. 当前用户需求
2. Shopify 官方设计体系
3. 本文档
4. `docs/INTERACTION_DESIGN.md`
5. 现有页面实现

---

## 2. 设计目标

所有 tool 页统一满足以下目标：

1. **Shopify 原生感**：进入页面后，应像 Shopify Admin 内部能力，而不是第三方拼装页面。
2. **工具一致性**：不同 tool 在页面结构、表单节奏、卡片样式、反馈方式上保持同一语言。
3. **低品牌依赖**：在品牌色未确定前，仍可依靠语义令牌稳定输出一致 UI。
4. **代码可约束**：规范必须能映射到共享 token、共享组件、共享样式层，而不是停留在文字描述。
5. **可持续扩展**：后续新增 Shopify 场景时，只扩展模式，不重写整套视觉系统。

---

## 3. 文件哲学与结构

参考 Stitch `DESIGN.md` 的思路，Spark 的视觉规范文件应同时承担**规则文件**和**设计系统资产**两种角色。

### 3.1 Living Artifact

本文档是**持续演化的活文档**，不是静态说明：

- 新增组件模式时，要同步补本文档
- 调整主题 token 时，要先更新本文档中的语义定义
- 页面实现若偏离本文档，必须在评审中显式说明原因

### 3.2 双层结构

一份可被工程与 AI 同时消费的视觉规范，至少要包含两层：

| 层 | 作用 | Spark 当前落点 |
|----|------|----------------|
| 机器可消费层 | 精确 token、组件映射、主题约束 | `Ant Design theme token`、`Tailwind theme`、共享组件 API |
| 人可理解层 | 设计意图、使用边界、Do/Don't、评审标准 | 本文档 markdown 正文 |

原则：

- token 负责回答“具体用什么值”
- prose 负责回答“为什么这样设计”
- 两层必须同时维护，不能只保留视觉截图或零散样式代码

### 3.3 Foundation, Not Prescription

本文档是设计系统**基础层**，不是封死一切变化的模板：

- 允许新增与业务相关的自定义章节
- 允许为特定工具定义扩展模式
- 但所有扩展都必须复用统一的颜色、间距、排版和组件语义

### 3.4 演进目标

中期建议将当前 `UI_DESIGN.md` 继续演进为更结构化的设计系统文档：

1. 顶部增加机器可读的主题 token 区
2. 正文保留人类可读的设计 rationale
3. 为共享组件建立稳定的设计映射表
4. 让 AI 与工程都从同一份规范生成和审查 UI

---

## 4. 设计来源与基线

视觉决策统一按以下来源理解：

| 来源 | 角色 | 说明 |
|------|------|------|
| Shopify 官方设计语言 | 上位约束 | 优先遵循嵌入式 App 的 Admin 风格、配色关系、信息密度与反馈方式 |
| `Ant Design` | 统一组件层 | 作为后续 tools 的主组件基础库，承接表单、表格、弹层、状态与复合交互 |
| `Tailwind CSS` | 统一样式层 | 负责布局、间距、排版、颜色映射与局部风格控制 |
| `app/routes/component/shared/**` | 本地共享封装层 | 对 `Ant Design` 做二次封装，沉淀跨 tool 复用的视觉模式 |
| `pageUiStyles.tsx` | 迁移桥接层 | 在迁移期承接旧页面 token，后续逐步并入统一主题系统 |
| 现有 tools 页面 | 迁移存量 | 只用于识别可复用结构与待收敛问题，不再作为视觉基线 |

结论：

- 后续所有 tools 的统一标准，应由 **Shopify 设计语言 + Ant Design 统一组件层 + Tailwind 样式层**共同决定
- 现有业务页面只作为迁移输入，不再承担视觉基线角色
- 不允许继续把某个业务页面的局部视觉细节直接上升为全站默认

---

## 5. 核心视觉原则

### 5.1 Shopify First

页面视觉先对齐 Shopify App 的内容密度、颜色关系和信息结构；实现层统一优先使用 `Ant Design` 组件，并通过 `Tailwind CSS` 与主题 token 把视觉收敛到 Shopify 风格。

### 5.2 中性色为底，语义色表达状态

页面主要依赖留白、边框、层级、间距来建立信息结构，而不是依赖大面积品牌色。颜色只承担以下职责：

- 交互可点击
- 状态成功 / 警告 / 错误
- 当前选中 / 推荐 / 待确认

### 5.3 一致性优先于局部精致

同一类问题必须复用同一类视觉解法。例如：

- 表单 section 用统一的卡片容器
- 状态 badge 用统一语义色与圆角
- 页脚说明用统一的辅助文案区块
- 空态、错误、加载态采用统一模板

### 5.4 层级靠排版与结构，不靠装饰

避免营销化的视觉手段：

- 大面积渐变横幅
- 过强阴影
- 大片彩色底卡
- 与业务无关的插画式装饰

工具页的重点应该是“清楚、可信、可执行”。

### 5.5 可访问性是默认要求

所有页面默认满足：

- 明确的标题层级
- 可见焦点态
- 不只靠颜色传达状态
- 合理的触控尺寸与表单标签
- loading / empty / error / success 均可被识别

---

## 6. 色彩与令牌策略

### 6.1 总原则

品牌色未确定前，统一采用**语义化命名**，避免在文档或页面中绑定“品牌绿”“品牌蓝”这类长期会变的表达。

推荐令牌分组：

| 分组 | 示例 | 用途 |
|------|------|------|
| 文本 | `textPrimary`、`textSecondary`、`textFootnote` | 标题、正文、辅助文案 |
| 背景 | `surface`、`surfaceSubtle`、`surfaceMuted` | 页面卡片、弱背景、分组底色 |
| 边框 | `border`、`divider`、`borderStrong` | 容器分隔、控件边框 |
| 交互 | `interactive`、`interactiveHover`、`interactiveSubtle` | 主按钮、可点状态、选中态 |
| 反馈 | `success`、`warning`、`critical`、`info` | 语义状态与反馈 |
| 阴影/圆角 | `shadowCard`、`shadowModal`、`radiusCard`、`radiusControl` | 一致的层级与容器形态 |

### 6.2 当前阶段的具体要求

1. 页面中**禁止新增裸写十六进制色值**。
2. 所有新颜色必须先进入统一主题 token；迁移期仍可先落到兼容层，但后续要并入 `Ant Design theme token + Tailwind theme`。
3. 现有代码中已存在的绿色、蓝色、渐变，可视为迁移存量；后续改版时优先向语义令牌收敛。
4. 在品牌色未冻结前，`interactive` 默认映射到 Shopify 风格主交互色，而不是自定义品牌色。
5. “推荐”“当前”“待确认”都属于**状态语义**，不要把它们做成品牌风格展示位。

### 6.3 状态语义映射

| 状态 | 推荐表现 |
|------|----------|
| 默认 | 白底或浅底 + 常规边框 |
| 当前 / 已生效 | 轻度强调边框 + 轻微选中背景 + 清晰主操作状态 |
| 推荐 | 比默认更高层级，但不高于错误/告警 |
| 待确认 | warning 语义，不与 destructive 混用 |
| 错误 / 风险 | `critical` 语义 + 明确修复动作 |

---

## 7. 排版、间距与容器

### 7.1 排版层级

| 层级 | 规格建议 | 场景 |
|------|----------|------|
| 页面主标题 | `1.5rem` 左右，`700` | tool 页标题 |
| 区块标题 | `1.125rem–1.25rem`，`600–700` | 表单区、状态区、结果区 |
| 正文 | `0.875rem` 左右，`1.4–1.6` 行高 | 描述、表单说明、列表 |
| 辅助文案 | `0.75rem–0.8125rem` | hint、meta、脚注 |

规则：

- 用字重和留白区分层级，不靠颜色堆层级
- 同一页面的标题层级不超过 4 层
- 辅助文案永远不能比主操作更抢眼

### 7.2 容器与圆角

| 元素 | 建议 |
|------|------|
| 页面主卡片 | 中性色背景 + 统一圆角 + 轻边框 + 轻阴影 |
| 输入控件 | 比卡片更小一档圆角 |
| badge / pill / progress | 完全圆角 |
| modal / popover | 与主卡片同体系，但阴影更高一层 |

### 7.3 间距规则

| 场景 | 建议 |
|------|------|
| 页面区块间距 | `1.5rem` 左右 |
| 卡片内边距 | `1rem–1.25rem` |
| 表单字段上下间距 | `0.75rem–1rem` |
| 双栏布局列间距 | `1.5rem` |

### 7.4 页面骨架

```tsx
<s-page heading={t("xxx.pageTitle")}>
  <div style={pageContentStyle}>
    {/* 可选 banner */}
    {/* status / config / task / review / footnote sections */}
  </div>
</s-page>
```

要求：

- `pageContentStyle` 目前仅作为历史兼容层；接入 Tailwind 后，其职责逐步迁移到共享布局组件
- 页面说明优先放在首个 section 的副标题，不做营销式 hero
- 双栏页面统一使用 `twoColumnLayoutStyle` 系列样式

---

## 8. Tool 页面视觉模式

交互流程定义见 `docs/INTERACTION_DESIGN.md`；本文只规定每种页面承载方式的视觉重点。

| 页面类型 | 视觉重点 | 说明 |
|----------|----------|------|
| Tool Home | 概览、最近任务、快捷入口 | 强调入口清晰，不做内容堆叠 |
| Config Page | 表单优先、说明次之 | 第一屏优先出现真实输入区 |
| Task List | 状态可扫描、批量信息清楚 | 强调 badge、进度、影响范围 |
| Review Gate | 差异清楚、确认动作单一 | 结果与应用动作分层显示 |
| Result Panel | 下一步明确 | 至少给保存、复制、重试或应用之一 |

统一要求：

- 每个主要区块用共享卡片模式承载
- 每个阶段只突出一个主操作
- 状态变化必须在视觉上可扫描
- 结果页不能只有内容，没有下一步动作

---

## 9. 统一组件与样式策略

后续 tools 的视觉统一不再依赖页面内零散写样式，而是统一采用：

- `Ant Design` 作为**组件能力层**
- `Tailwind CSS` 作为**样式组织层**
- Shopify 页面风格作为**视觉目标**

核心原则：

1. `Ant Design` 负责提供稳定的交互组件，不直接照搬默认后台风格。
2. `Tailwind CSS` 负责布局、间距、排版、边框、背景和局部视觉控制。
3. `Ant Design` 的主题 token 与 `Tailwind theme` 必须共用同一套 Shopify 风格语义色。
4. 业务页原则上不再直接拼装大量内联样式，而是消费共享组件和统一 class 体系。
5. 共享组件需要同时包含“视觉约束”与“使用意图”，而不是只封一层技术 API。

### 9.1 统一技术栈

| 层 | 方案 | 职责 |
|----|------|------|
| 组件层 | `Ant Design` | 表单、按钮、Tabs、Card、Modal、Table、Tag、Empty、Alert 等基础与复合组件 |
| 样式层 | `Tailwind CSS` | 布局、间距、排版、栅格、局部视觉细节、响应式规则 |
| 主题层 | `Ant Design theme token` + `Tailwind theme` | 映射 Shopify 风格的文本、背景、边框、交互、反馈色 |
| 共享层 | `app/routes/component/shared/**` | 对 `Ant Design` 做统一封装，屏蔽业务页对底层库的直接依赖 |

### 9.2 颜色与主题要求

| 主题目标 | 做法 |
|----------|------|
| 更像 Shopify App | 颜色组合、信息密度、边框与留白关系参考 Shopify 页面 |
| 不像默认 AntD 后台 | 禁止直接使用 AntD 默认蓝色主色和默认组件观感作为最终视觉 |
| 保持统一 | `Ant Design` 与 `Tailwind` 使用同一套语义 token |
| 适配未来品牌色 | 品牌色确定后，只修改主题映射，不逐页重写组件 |

### 9.3 组件使用规则

1. 业务页优先使用共享封装组件，而不是直接散用 `Ant Design` 组件。
2. 同一 tool 页面不得混用“AntD 默认风格”和“旧页面私有样式风格”。
3. 对于 `Card`、`Tabs`、`Modal`、`Table`、`Form`、`Tag` 等高频模式，优先沉淀共享封装。
4. 仅在共享组件无法覆盖时，才允许业务页直接使用 `Ant Design` 原子组件。

### 9.4 Tailwind 使用规则

1. `Tailwind CSS` 负责布局与视觉实现，不负责重新定义交互模型。
2. 颜色、圆角、阴影、间距应从统一主题扩展配置中取值，不在页面里随意拼新的视觉语言。
3. 优先使用组件级 class 组合与共享样式约定，避免业务页散落长串重复 class。
4. 禁止在同一页面同时维护一套 Tailwind 风格和一套大量内联 style 的平行体系。

---

## 10. 代码落地规则

这是后续统一所有 tools 风格的核心部分。

### 10.1 单一出口

页面级视觉能力统一从以下三层输出：

| 层 | 职责 |
|----|------|
| 统一主题配置 | `Ant Design theme token` + `Tailwind theme`，定义文本、背景、边框、交互与反馈色 |
| `app/routes/component/shared/**` | 共享封装组件，承接卡片、标题行、状态区、空态、结果区等复合模式 |
| `pageUiStyles.tsx` | 历史兼容层；仅在迁移旧页面时临时使用 |

新增视觉模式时，优先顺序如下：

1. 扩展统一主题 token
2. 如涉及复合结构，沉淀到共享组件层
3. 为共享组件补充使用意图、variant 语义与 Do/Don't
4. 迁移旧页面时，临时通过 `pageUiStyles.tsx` 过渡
5. 只有业务强相关样式才留在域内局部实现

### 10.2 样式优先级

统一遵循：

1. 统一主题 token
2. 共享封装组件
3. `Tailwind CSS`
4. 迁移期 `pageUiStyles.tsx`
5. 局部 `style`

禁止反向扩散：

- 页面里重新定义一套 token
- 在多个页面复制相同视觉 class / 样式片段
- 为了某个局部需求引入新的平行主题体系

### 10.3 第三方组件接入规则

以 `Ant Design` 为默认组件库时，必须满足以下约束：

1. 业务页不得直接依赖 `Ant Design` 默认主题作为 UI 规范来源。
2. 必须在共享层提供包装组件，逐步隐藏底层库 API。
3. 包装组件只暴露与项目设计语言相关的 variant。
4. 视觉样式必须接入统一主题 token，不能直接使用库默认主题色。

### 10.4 品牌色预留

可在统一主题 token 层预留以下抽象名，但暂不写品牌说明：

- `interactive`
- `interactiveHover`
- `accentSubtle`
- `accentStrong`

待品牌色确定后，只更新 token 映射，不要求逐页改业务代码。

### 10.5 `Ant Design` 主题映射

`Ant Design` 只作为组件能力层，主题值统一映射到 Spark 语义 token：

| AntD token | Spark token / 语义 | 用法 |
|------------|--------------------|------|
| `colorPrimary` | `interactive-primary` | 主按钮、激活态、关键交互 |
| `colorPrimaryHover` | `interactive-primary-hover` | 主按钮 hover、激活态 hover |
| `colorText` | `text-primary` | 标题、正文、主要信息 |
| `colorTextSecondary` | `text-secondary` | 次要信息、辅助说明 |
| `colorTextPlaceholder` | `text-footnote` | placeholder、弱提示 |
| `colorBgBase` | `surface-card` | 基础白底容器 |
| `colorBgLayout` | `surface-page` | 页面背景 |
| `colorFillAlter` | `surface-subtle` | 次级背景、表头、分组块 |
| `colorBorder` | `border-default` | 默认边框 |
| `colorBorderSecondary` | `border-subtle` | 更轻的边框与分隔 |
| `colorError` | `critical` | 错误、危险态 |
| `colorWarning` | `warning` | 待确认、警示态 |
| `colorSuccess` | `success` | 成功、已完成态 |
| `borderRadius` | `radius-control` | 按钮、输入、轻量容器 |
| `borderRadiusLG` | `radius-card` | 卡片、Modal、主要区块 |
| `boxShadowSecondary` | `shadow-card` | Card 等中层容器 |
| `boxShadow` | `shadow-modal` | Modal / Popover 等上层浮层 |

### 10.6 `Tailwind theme` 映射

`Tailwind CSS` 只消费 Spark 语义 token，不再自行生成另一套视觉命名：

| Tailwind 命名 | Spark token | 建议用途 |
|---------------|-------------|----------|
| `text-app-primary` | `text-primary` | 标题、主文本 |
| `text-app-secondary` | `text-secondary` | 辅助文本、meta |
| `bg-app-page` | `surface-page` | 页面背景 |
| `bg-app-card` | `surface-card` | 卡片与浮层主体 |
| `bg-app-subtle` | `surface-subtle` | 分组区、次级背景 |
| `border-app` | `border-default` | 默认边框 |
| `border-app-subtle` | `border-subtle` | 轻边框、分隔线 |
| `bg-app-primary` | `interactive-primary` | 主交互底色 |
| `bg-app-primary-hover` | `interactive-primary-hover` | 主交互 hover |
| `text-app-success` | `success` | 成功文本 |
| `text-app-warning` | `warning` | 警示文本 |
| `text-app-critical` | `critical` | 危险文本 |
| `rounded-app-control` | `radius-control` | 输入、按钮、小容器 |
| `rounded-app-card` | `radius-card` | 卡片、Modal |
| `shadow-app-card` | `shadow-card` | 卡片阴影 |
| `shadow-app-modal` | `shadow-modal` | 浮层阴影 |

### 10.7 核心共享组件 Contract

以下组件应优先建设为共享层能力，并成为业务页唯一可见的高频视觉入口：

| 组件 | 允许 variant | 主要职责 | 禁止事项 |
|------|--------------|----------|----------|
| `shared-card` | `default` `subtle` `critical` | 页面区块、任务卡片、结果承载 | 不暴露任意自定义颜色入口 |
| `shared-tabs` | `default` `compact` | 顶部页签、局部视图切换 | 不允许改成营销化胶囊导航 |
| `shared-modal` | `default` `confirm` | 预估、确认、风险操作 | 不允许在业务页自定义一套浮层视觉 |
| `shared-status-tag` | `neutral` `success` `warning` `critical` `info` | 状态表达与结果标签 | 不允许直接用随机色值区分状态 |
| `shared-form-section` | `default` `subtle` | 表单分组、参数块 | 不允许把说明区做成强视觉主角 |
| `shared-action-bar` | `default` `compact` | 主次操作排列与间距 | 不允许改变按钮优先级语义 |

组件实现要求：

1. 必须以统一主题 token 驱动，不直接暴露底层 AntD 主题色。
2. 必须把视觉 variant 与交互语义绑定，而不是只传 className。
3. 必须支持 i18n、loading、disabled、empty 等常见工具页状态。
4. 必须允许 Tailwind 负责布局，但禁止业务页覆盖组件核心语义样式。

---

## 11. 规范生成与维护

参考 Stitch 的做法，本文档后续应支持三种维护来源：

| 来源 | 用法 |
|------|------|
| 人工维护 | 设计与前端共同编辑本文档，明确主题、组件和页面模式 |
| 现有页面提炼 | 从当前 tools 页面中抽取共性模式，沉淀为共享规则 |
| Agent 辅助补全 | 由 AI 根据页面实现和设计目标补齐 token、Do/Don't、组件映射 |

维护要求：

1. 新增视觉模式时，先更新本文档，再进入代码实现
2. 新增共享组件时，要在本文档中补对应模式说明
3. 主题 token 变更时，要同时更新 `Ant Design` 与 `Tailwind` 的映射
4. 不允许只改代码、不改规范，导致规范失真

---

## 12. 当前项目参考实现

以下文件可作为现阶段迁移与统一时的参考，但不应被机械复制：

| 文件 | 参考价值 |
|------|----------|
| `app/routes/page/pageUiStyles.tsx` | 旧页面 token 与布局桥接层 |
| `app/routes/component/shared/pagePrimitives.module.css` | 跨页面复用样式的收敛方向 |

说明：

- 现有参考只用于提炼结构模式和待收敛问题
- 不再依赖任何单一业务页作为视觉基线
- 所有新实现都应优先依据统一主题与共享组件 contract 落地

### 12.1 `ProductImprovePage` 组件映射草案

`app/routes/page/ProductImprovePage.tsx` 应作为首批迁移样板页，但迁移重点是**组件映射**，不是重写交互结构。

| 当前页面区块 | 目标共享组件 | 底层建议 | 说明 |
|-------------|-------------|----------|------|
| 页面壳 | `shared-app-shell` | `App Bridge` + 共享布局 | 保留现有标题、副标题、badge 和页面节奏 |
| `Config / Tasks` 切换条 | `shared-tabs` | `Ant Design Tabs` | 只替换视觉与交互承载，不改变两页签模型 |
| 配置区主容器 | `shared-card` | `Ant Design Card` | 承接商品选择、语言设置、操作按钮 |
| 商品选择区 | `shared-form-section` | `Ant Design Form` + 自定义选择器 | 保留现有 `ProductSelector` 业务能力，统一容器和表单节奏 |
| 手动 Product ID 展开区 | `shared-disclosure` | `Collapse` 或受控展开组件 | 只作为高级参数入口，不提升视觉优先级 |
| 语言选择器 | `shared-select-field` | `Select` | 统一 label、hint、error、disabled 风格 |
| 主操作按钮组 | `shared-action-bar` | `Button` + `Space` | 保持“生成 / 评分 / 清空”原有优先级 |
| 预估弹窗 | `shared-modal` | `Modal` | 分成说明、预估信息、确认操作三段，但不改变执行顺序 |
| 任务卡片 | `shared-task-card` | `Card` + `Progress` + `Tag` | 承接状态、日志、meta、结果入口 |
| 状态 badge | `shared-status-tag` | `Tag` | 用统一 success / warning / critical / neutral 语义 |
| 空任务态 | `shared-empty-state` | `Empty` | 统一空态说明和下一步动作 |
| 审查结果区 | `shared-review-panel` | `Card` + 表单控件 | 保留审查后写入 Shopify 的原流程 |

### 12.2 `ProductImprovePage` 迁移边界

迁移这个页面时，必须遵守以下边界：

1. 不改 `Config Page -> 任务列表 -> 审查 -> 应用` 的原始任务流
2. 不新增额外概览层，不插入新的信息层级
3. 不改变主次操作的顺序和相对优先级
4. 优先替换容器、表单、弹窗、状态、列表承载组件
5. 优先清理内联样式和局部视觉分叉，不改业务 hook 与任务逻辑

---

## 13. 状态、反馈与文案

| 场景 | 规范 |
|------|------|
| 成功 / 失败 | 使用 `shopify.toast.show()` 或统一封装的近场反馈组件 |
| 需要立即处理 | 使用统一的 `Alert / Banner` 组件表达 |
| 提交中 | 主按钮 loading / disabled，保留上下文，不清空表单 |
| 空状态 | 提供说明 + 下一步动作，不只写“暂无数据” |
| 风险操作 | 与主流程分层，避免与 primary 并列竞争 |
| 文案 | 一律走 i18n；不要在组件中硬编码商户可见文本 |

补充要求：

- 错误信息优先贴近出错区域
- 状态文案要告诉用户“接下来怎么做”
- 不要只依赖颜色区分成功、失败、待确认

---

## 14. 禁止项

- 把某个 tool 做成独立品牌站视觉
- 在页面里新增裸写颜色、阴影、圆角体系
- 使用与 Shopify Admin 明显冲突的默认 AntD 主题
- 大面积 hero、营销横幅、无关插画装饰
- 同一页面出现两套按钮风格、两套表单风格或两套卡片风格
- 硬编码商户可见文案
- 为局部样式问题直接引入全局 CSS 污染

---

## 15. 设计评审与开发自检

每次新增或重构 tool 页时，至少检查以下问题：

1. 这页是否第一眼像 Shopify App，而不是外部站点
2. 是否优先使用了共享封装组件，而不是页面内散落实现
3. 是否只通过 token 使用颜色，而不是页面直接写值
4. 主卡片、表单、状态、结果区是否使用统一容器语言
5. loading / empty / error / success 是否完整
6. 响应式下是否仍保持可读、可点、可操作
7. 如果使用 `Ant Design`，是否已接入统一主题并通过共享封装输出
8. 这次改动是否同时更新了设计系统文档中的相关规则

建议后续再补一份更机器可读的检查清单，例如：

- token 是否来自统一主题
- 组件是否来自共享封装层
- 是否存在默认 AntD 风格泄漏
- 是否存在页面级重复样式定义

用户需求与本文冲突时，以用户当次指令为准，并在实现说明中标注偏离点。

---

## 16. 官方参考

- [Shopify App Home](https://shopify.dev/docs/api/app-home)
- [App Bridge](https://shopify.dev/docs/api/app-bridge)
- [Stitch DESIGN.md Overview](https://stitch.withgoogle.com/docs/design-md/overview)

若 Shopify 官方设计体系与本文冲突，且本文未明确给出项目特例，则以官方为准。
