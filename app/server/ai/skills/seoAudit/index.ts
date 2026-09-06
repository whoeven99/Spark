import type { ToolDefinition } from "../../core/toolRegistry.server";
import { OPEN_PRODUCT_IMPROVE_FORM_TOOL_NAME } from "../marketing/marketing.form.tool";
import { createRunSeoAuditTool, RUN_SEO_AUDIT_TOOL_NAME } from "./runSeoAudit.tool";

export const seoAuditSkillDefinition: ToolDefinition = {
  name: "seoAudit",
  displayName: "SEO 体检",
  category: "商品目录",
  stage: "diagnose",
  visibility: "public",
  description:
    "对店铺商品做站内 SEO 体检：算出搜索标题/描述的覆盖率，找出重复标题、缺失描述、超长截断、链接不可读、正文过薄等问题，并给出每类问题的成因与改法",
  systemPromptExtension: [
    "商户问「我的店 SEO 有什么问题」「帮我看看 SEO 怎么优化」这类**还不知道问题在哪**的需求时，按下面三步走，不要跳步：",
    `1) 先诊断：调用 ${RUN_SEO_AUDIT_TOOL_NAME}（只读、不改数据、不消耗额度）。除非商户明确说只看某一类商品，否则不要传 keyword —— 重复标题要扫全店才判得准。`,
    "2) 再解释：按返回的 issues 顺序（已按严重程度排好）用短列表讲清：影响多少商品、为什么是问题、怎么改。成因和改法直接用 issue.guidance，不要另编 SEO 常识；举例用 samples 里的真实商品。",
    "3) 然后立刻行动（同一回合，不要只口头问「要不要改」）：",
    `   - 若返回了 suggestedNextActions：按数组顺序调用其中的 tool，products 原样预填；开卡本身是安全闸，不等于写回。`,
    `   - 若没有 suggestedNextActions 字段：有 fixability=product_content 的 issue → 立刻调用 ${OPEN_PRODUCT_IMPROVE_FORM_TOOL_NAME}（可先开一张代表性商品卡）；manual → 说明需要商户在 Shopify 后台逐个改搜索标题/描述或 handle，Spark 当前没有批量改 SEO 入口。`,
    "   - 商户点了 SEO 体检是为了改，不是听课。",
    "关于长度：阈值单位是「半角当量宽度」，一个汉字算 2。跟商户解释时说「约 30 个汉字」比说「60 字符」更好懂。",
    "这个工具只读，永远不要说「我已经帮你优化了 SEO」。",
  ].join("\n"),
  createTool: (context) => [createRunSeoAuditTool(context)],
};
