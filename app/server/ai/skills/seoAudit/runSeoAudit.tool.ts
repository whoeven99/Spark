import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext } from "../../core/toolRegistry.server";
import { fetchProductsForSeoAudit } from "../../../shopify/productSeoAuditReader.server";
import {
  runSeoAudit,
  SEO_AUDIT_GUIDANCE,
  SEO_DESCRIPTION_MAX_WIDTH,
  SEO_DESCRIPTION_MIN_WIDTH,
  SEO_TITLE_MAX_WIDTH,
  SEO_TITLE_MIN_WIDTH,
  type SeoAuditFixability,
  type SeoAuditIssue,
} from "../../../../lib/seoAudit";
import { OPEN_BULK_SEO_EDIT_FORM_TOOL_NAME } from "../bulkSeoEdit/bulkSeoEdit.form.tool";
import { OPEN_PRODUCT_IMPROVE_FORM_TOOL_NAME } from "../marketing/marketing.form.tool";
import { BULK_SEO_EDIT_MAX_PRODUCTS } from "../../../../lib/bulkSeoEdit";

export const RUN_SEO_AUDIT_TOOL_NAME = "run_seo_audit";
const LOG_PREFIX = "[RunSeoAudit]";

/**
 * 扫描上限。重复标题要覆盖足够多商品才判得准，所以比一般只读工具放得宽；
 * 但返回给模型的只有汇总 + 每类问题最多 5 个样例，上下文不会随店铺规模膨胀。
 */
const MAX_PRODUCTS = 500;

type SuggestedNextAction = {
  fixability: SeoAuditFixability;
  tool: string;
  products: Array<{ id: string; title: string }>;
  instruction: string;
};

/**
 * 把可批量修的问题样例收成下游开卡动作，减少「只总结不开卡」。
 * bulk_seo_edit 优先；product_content 次之；manual 不开卡。
 */
export function buildSeoAuditSuggestedNextActions(
  issues: SeoAuditIssue[],
): SuggestedNextAction[] {
  const bulkById = new Map<string, string>();
  const contentById = new Map<string, string>();

  for (const issue of issues) {
    if (issue.fixability === "bulk_seo_edit") {
      for (const sample of issue.samples) {
        if (!bulkById.has(sample.productId)) {
          bulkById.set(sample.productId, sample.productTitle);
        }
      }
    } else if (issue.fixability === "product_content") {
      for (const sample of issue.samples) {
        if (!contentById.has(sample.productId)) {
          contentById.set(sample.productId, sample.productTitle);
        }
      }
    }
  }

  const actions: SuggestedNextAction[] = [];

  if (bulkById.size > 0) {
    const products = [...bulkById.entries()]
      .slice(0, BULK_SEO_EDIT_MAX_PRODUCTS)
      .map(([id, title]) => ({ id, title }));
    actions.push({
      fixability: "bulk_seo_edit",
      tool: OPEN_BULK_SEO_EDIT_FORM_TOOL_NAME,
      products,
      instruction:
        "解释完问题后立刻调用本工具打开批量改 SEO 确认卡，products 原样预填；开卡不等于写回。可按最常见问题预填 titleTemplate/descriptionTemplate（仅用 {title}/{vendor}/{productType}）。",
    });
  }

  if (contentById.size > 0) {
    const products = [...contentById.entries()]
      .slice(0, 5)
      .map(([id, title]) => ({ id, title }));
    actions.push({
      fixability: "product_content",
      tool: OPEN_PRODUCT_IMPROVE_FORM_TOOL_NAME,
      products,
      instruction:
        "正文过薄无法靠 SEO 模板修。解释后立刻调用本工具打开文案优化卡；多商品时优先用列表里的第一件预填 productId，并说明其余可在卡片或后续批量处理。",
    });
  }

  return actions;
}

export function createRunSeoAuditTool(context: AgentContext): DynamicStructuredTool {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: RUN_SEO_AUDIT_TOOL_NAME,
    description:
      "对店铺商品做一次站内 SEO 体检（只读，不改任何数据）。返回搜索标题/描述的覆盖率、按严重程度排序的问题清单、每类问题的受影响商品数与样例，以及每类问题的成因与改法。用于回答「我的店 SEO 有什么问题」「帮我看看 SEO 怎么优化」这类还不知道问题在哪的需求。",
    schema: z.object({
      keyword: z
        .string()
        .optional()
        .describe("只体检标题含该关键词的商品；留空则扫描全店（推荐留空，重复标题才判得准）"),
      maxProducts: z
        .number()
        .int()
        .min(1)
        .max(MAX_PRODUCTS)
        .optional()
        .describe(`最多扫描多少个商品，默认 ${MAX_PRODUCTS}`),
    }),
    func: async ({ keyword, maxProducts }) => {
      const requestId = crypto.randomUUID();
      try {
        const { products, truncated } = await fetchProductsForSeoAudit(admin, {
          maxProducts: Math.min(maxProducts ?? MAX_PRODUCTS, MAX_PRODUCTS),
          query: keyword,
        });

        if (products.length === 0) {
          return JSON.stringify({
            ok: true,
            summary: { scannedProducts: 0, auditedProducts: 0 },
            issues: [],
            suggestedNextActions: [],
            note: "没有查到商品，无法体检。",
          });
        }

        const { summary, issues } = runSeoAudit(products, { truncated });
        const suggestedNextActions = buildSeoAuditSuggestedNextActions(issues);

        console.info(
          `${LOG_PREFIX} done requestId=${requestId} scanned=${summary.scannedProducts} audited=${summary.auditedProducts} issues=${issues.length} nextActions=${suggestedNextActions.length}`,
        );

        return JSON.stringify({
          ok: true,
          thresholds: {
            // 单位是「半角当量宽度」：一个汉字算 2，因为 Google 按像素截断
            titleWidth: { min: SEO_TITLE_MIN_WIDTH, max: SEO_TITLE_MAX_WIDTH },
            descriptionWidth: {
              min: SEO_DESCRIPTION_MIN_WIDTH,
              max: SEO_DESCRIPTION_MAX_WIDTH,
            },
          },
          summary,
          // 每条问题都把成因和改法一起带上，模型据此给建议，不要自己编 SEO 常识
          issues: issues.map((issue) => ({
            ...issue,
            guidance: SEO_AUDIT_GUIDANCE[issue.code],
          })),
          suggestedNextActions,
        });
      } catch (e) {
        console.error(`${LOG_PREFIX} failed requestId=${requestId}`, e);
        return JSON.stringify({
          ok: false,
          errorMsg: e instanceof Error ? e.message : String(e),
        });
      }
    },
  });
}
