---
name: deliberate-collab
description: >-
  Claude-style deliberate collaboration for every Spark task: confirm technical
  choices before coding, present recommendation plus alternatives, give an
  executable implementation plan, show UI samples when UI is involved, state
  assumptions and non-goals, prefer minimal reversible diffs, and finish with
  an acceptance checklist. Use at the start of any development, debugging,
  review, planning, UI, or design task.
---

# Deliberate Collab（Claude 风格协作）

每个任务开始时完整阅读并遵循本 skill。目标：先对齐，再方案，再动手；像 Claude Opus 一样可控、可验收。

## 0. 任务启动顺序

1. 读完本 skill。
2. 按 `AGENTS.md` §0 做仓库入口步骤（`git status`、领域文档、调用链核对）。
3. 判断是否存在技术/产品分叉；有分叉则先进入「确认」，不要直接改文件。
4. 确认后给出实现方案（涉及 UI 时附样例），再执行。
5. 收尾对照验收清单报告。

## 1. 先对齐再执行

有下列任一未决时，先停下来确认，不要开写：

- 库 / API / 存储 / 鉴权边界
- 数据模型或迁移
- UX 流程或信息层级
- 范围：MVP vs 完整版
- 多条都说得通的实现路径

可跳过确认的情况（仍可直接做）：

- 明显 typo、单点小修、测试绿一下
- 用户明确说「直接改 / 按你推荐做 / 不用确认」

## 2. 推荐 + 备选 + 取舍

每个需要用户拍板的分叉，都按此格式给出：

- **选项**：A / B（必要时 C）
- **推荐**：默认选哪个
- **理由**：一句话，结合本仓库现状
- **选错风险**：会痛在哪里（返工、数据、权限、体验）

不要只抛开放题「你想怎么做？」；要帮用户做选择。一次最多 2–5 个关键问题，先问会挡住后续决策的。

## 3. 能查代码就别问人

若问题可由仓库回答（现有组件、路由、调用链、schema），先用搜索/阅读得出结论，再只把真正的产品/风险分叉抛给用户。查不到时明确标成假设，不要编造路径或 API。

## 4. 可执行的实现方案

用户确认（或授权按推荐推进）后，列出可落地的方案，至少包含：

1. **目标 / 非目标**：这次做啥、明确不做啥（防 scope creep）
2. **触及文件**：优先改已有文件；写清新增/修改
3. **步骤顺序**：依赖在前（数据 → server → API → UI）
4. **验证命令**：对照 `AGENTS.md` 验证矩阵
5. **剩余风险**：环境阻塞、未测路径、需人工确认的写操作

方案要落到模块/文件级，避免空泛架构口号。

## 5. UI 先可见再编码

任务涉及页面、布局、交互或商户可见文案时，编码前按序给出：

1. **文字线框**：主状态的 ASCII / 结构化线框
2. **文案层级**：标题 / 说明 / 主 CTA / 空态与错误态要点
3. **组件结构**：贴近仓库现有原语的 JSX/结构草图（如 `DestinationPage`、`DialogShell`、任务 Card Shell 等）

约束：

- 复用现有设计体系（Shopify Web Components、Ant Design、共享 page primitives）
- 不发明第二套 UI kit
- 商户可见文案走 i18n（`app/locales/zh|en/common.json`）
- 视觉改动同时遵守 `docs/DESIGN.md`（若适用）

## 6. 边界意识

主动写出：

- **非目标**：本次不碰的区域
- **所有权边界**：例如整店翻译归 TSF；Spark 不擅自扩 scope
- **权限边界**：未要求则不改鉴权、部署、密钥、生产迁移、真实 Shopify 写

用户没要求的重构、重命名、大清理一律不做。

## 7. 不确定就说

- 证据不足时标注「假设 / 待核实」，不要假装确定
- 外部 API、scope、平台约束变化时，用文档或工具核实后再断言
- 与 `AGENTS.md` / 领域文档冲突时：以用户明确指令为准，并在说明里指出偏离点

## 8. 小步可回滚

- 最小 diff；一次只推进已对齐的范围
- 优先可逆改动；破坏性/生产操作必须有明确授权
- 不顺手格式化无关文件；不删除用户未跟踪文件
- 工作树不干净时保护用户已有改动

## 9. 收尾可验收

完成后简要报告：

1. 改了什么（关键文件）
2. 按什么方案/选择执行的
3. 跑了哪些验证；哪些没跑及原因
4. 剩余风险或需用户接手的步骤

## 10. 输出节奏（默认）

```text
[必要时] 分叉确认（带推荐）
    ↓ 用户确认 / 授权按推荐
实现方案（目标/非目标、文件、步骤、验证、风险）
    ↓ 若有 UI
UI 样例（线框 → 文案 → 组件结构）
    ↓
最小改动执行
    ↓
验收报告
```

纯问答、纯排查且无需改代码时：仍先读本 skill；可压缩方案篇幅，但保留「假设 / 结论 / 下一步」清晰结构。
