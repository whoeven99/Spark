---
name: deliberate-collab
description: >-
  Claude-style deliberate collaboration when a Spark task has real forks or
  needs alignment: confirm technical choices before coding, present
  recommendation plus alternatives, give an executable plan, show UI samples
  when UI is involved, state assumptions and non-goals, prefer minimal
  reversible diffs. Use on demand—not at the start of every task.
---

# Deliberate Collab（Claude 风格协作）

有分叉或需要先对齐时使用本 skill。目标：先对齐，再动手；路径清晰时直接干，不必先走完本文件。

默认节奏见 `AGENTS.md` §0：查代码 → 直接做 → 按风险自选验证。

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
- 只有一条路明显更优，且选错的代价只是「再改一次文件」，不牵涉数据、权限或大范围返工

## 2. 推荐 + 备选 + 取舍

每个需要用户拍板的分叉，都按此格式给出：

- **选项**：A / B（必要时 C）
- **推荐**：默认选哪个
- **理由**：一句话，结合本仓库现状
- **选错风险**：会痛在哪里（返工、数据、权限、体验）

不要只抛开放题「你想怎么做？」；要帮用户做选择。一次最多 2–5 个关键问题，先问会挡住后续决策的。

## 3. 能查代码就别问人

若问题可由仓库回答（现有组件、路由、调用链、schema），先用搜索/阅读得出结论，再只把真正的产品/风险分叉抛给用户。查不到时明确标成假设，不要编造路径或 API。

## 4. 可执行的实现方案（需要时）

用户确认（或授权按推荐推进）后，可列出：

1. **目标 / 非目标**
2. **触及文件**
3. **步骤顺序**
4. **打算怎么验证**（自选，对照 `AGENTS.md` §11 参考表即可）
5. **剩余风险**

## 5. UI（大改或有体验分叉时）

编码前可按需给出文字线框、文案层级、贴近现有原语的组件结构。小改文案/样式不必先交样例。

约束：复用现有设计体系；商户可见文案走 i18n；视觉大改可参考 `docs/DESIGN.md`。

## 6. 边界意识

- **非目标**：本次不碰的区域
- **所有权边界**：例如整店翻译归 TSF
- **权限边界**：未要求则不改鉴权、部署、密钥、生产迁移、真实 Shopify 写

用户没要求的重构、重命名、大清理一律不做。

## 7. 不确定就说

- 证据不足时标注「假设 / 待核实」
- 外部 API、scope、平台约束变化时核实后再断言
- 与 `AGENTS.md` / 领域文档冲突时：以用户明确指令为准，并指出偏离点

## 8. 小步可回滚

- 最小 diff；优先可逆改动
- 破坏性/生产操作必须有明确授权
- 不顺手格式化无关文件；不删除用户未跟踪文件
- 保护脏工作树

## 9. 收尾

简要说明改了什么与剩余风险即可；不必按固定验收模板汇报。
