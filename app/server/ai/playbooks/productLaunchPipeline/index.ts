import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getShopChatModel } from "../../core/shopChatGraph.server";
import type {
  PlaybookDefinition,
  PlaybookRunParams,
  PlaybookRunResult,
  PlaybookStepResult,
} from "../../core/playbookRegistry.server";

// ──────────────────────────────────────────────
// Shopify GraphQL 查询
// ──────────────────────────────────────────────

function buildProductQuery(productId: string) {
  return `
    query ProductDetail {
      product(id: "${productId}") {
        id
        title
        status
        descriptionHtml
        description
        images(first: 5) { nodes { url altText } }
        variants(first: 20) {
          nodes {
            title
            price
            inventoryQuantity
            sku
          }
        }
        metafields(first: 5, namespace: "seo") {
          nodes { key value }
        }
        tags
        productType
        vendor
      }
    }
  `;
}

// ──────────────────────────────────────────────
// 完整度检查
// ──────────────────────────────────────────────

interface ProductCheckResult {
  hasDescription: boolean;
  descriptionLength: number;
  imageCount: number;
  variantCount: number;
  hasPrice: boolean;
  hasSku: boolean;
  isPublished: boolean;
  hasTags: boolean;
  missingFields: string[];
  score: number; // 0-100
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkProductCompleteness(product: any): ProductCheckResult {
  const missingFields: string[] = [];

  const hasDescription = !!(
    product.description?.trim() || product.descriptionHtml?.trim()
  );
  const descriptionLength = product.description?.length ?? 0;
  const imageCount = product.images?.nodes?.length ?? 0;
  const variantCount = product.variants?.nodes?.length ?? 0;
  const hasPrice = product.variants?.nodes?.some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v: any) => parseFloat(v.price) > 0
  );
  const hasSku = product.variants?.nodes?.some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v: any) => !!v.sku?.trim()
  );
  const isPublished = product.status === "ACTIVE";
  const hasTags = product.tags?.length > 0;

  if (!hasDescription) missingFields.push("商品描述");
  if (descriptionLength < 50) missingFields.push("描述过短（建议 >50 字）");
  if (imageCount === 0) missingFields.push("商品图片");
  if (!hasPrice) missingFields.push("售价");
  if (!hasSku) missingFields.push("SKU 编码");
  if (!hasTags) missingFields.push("标签（影响 SEO 与分类）");

  // 评分：满分 100
  let score = 100;
  if (!hasDescription) score -= 30;
  else if (descriptionLength < 50) score -= 15;
  if (imageCount === 0) score -= 25;
  else if (imageCount < 3) score -= 10;
  if (!hasPrice) score -= 20;
  if (!hasSku) score -= 10;
  if (!hasTags) score -= 5;

  return {
    hasDescription,
    descriptionLength,
    imageCount,
    variantCount,
    hasPrice,
    hasSku,
    isPublished,
    hasTags,
    missingFields,
    score: Math.max(0, score),
  };
}

// ──────────────────────────────────────────────
// 从 goal 中提取 product ID
// ──────────────────────────────────────────────

function extractProductId(goal: string): string | null {
  // 匹配 gid://shopify/Product/xxx 或纯数字 ID
  const gidMatch = goal.match(/gid:\/\/shopify\/Product\/(\d+)/i);
  if (gidMatch) return `gid://shopify/Product/${gidMatch[1]}`;

  const numMatch = goal.match(/\b(\d{10,})\b/);
  if (numMatch) return `gid://shopify/Product/${numMatch[1]}`;

  return null;
}

// ──────────────────────────────────────────────
// Playbook run 函数
// ──────────────────────────────────────────────

async function run({
  goal,
  constraints,
  context,
  onStep,
}: PlaybookRunParams): Promise<PlaybookRunResult> {
  const steps: PlaybookStepResult[] = [];

  // ── Step 1: 商品信息检查 ──
  const productId = extractProductId(goal);

  if (!productId) {
    onStep?.("商品信息检查", "completed");
    steps.push({
      step: "商品信息检查",
      status: "skipped",
      output: "未在 goal 中找到商品 ID，返回通用上新清单",
    });

    const genericChecklist = [
      "上新流水线通用清单：",
      "1. 商品信息检查：标题（≥10字）、描述（≥50字）、图片（≥3张，主图白底）、售价、SKU、标签",
      "2. 文案建议：卖点提炼（3-5条）、场景描述、FAQ（至少2条）",
      "3. 翻译准备：如有多语言市场，需翻译标题+描述+卖点，并检查术语一致性",
      "4. 上架前质检：禁用词、夸大宣传、图片分辨率（≥800x800）",
      "5. 发布：先设为草稿审核，确认无误后上架",
      "提示：请提供商品 ID（如 gid://shopify/Product/12345）以获取针对该商品的个性化建议。",
    ].join("\n");

    return {
      ok: true,
      summary: genericChecklist,
      steps,
    };
  }

  // 查询商品详情
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let product: any = null;
  try {
    onStep?.("商品信息检查", "running");
    const res = await context.admin.graphql(buildProductQuery(productId));
    const json = (await res.json()) as { data?: { product?: unknown } };
    product = json?.data?.product;

    if (!product) {
      onStep?.("商品信息检查", "error");
      steps.push({
        step: "商品信息检查",
        status: "error",
        output: `未找到商品 ID: ${productId}`,
      });
      return {
        ok: false,
        summary: `未找到商品 ${productId}，请确认 ID 是否正确。`,
        steps,
      };
    }

    onStep?.("商品信息检查", "completed");
    steps.push({
      step: "商品信息检查",
      status: "completed",
      output: `商品「${product.title}」数据已获取`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    onStep?.("商品信息检查", "error");
    steps.push({ step: "商品信息检查", status: "error", output: `查询失败：${msg}` });
    return { ok: false, summary: `商品数据查询失败：${msg}`, steps };
  }

  const check = checkProductCompleteness(product);

  // ── Step 2: 文案建议（LLM）──
  let copyAdvice = "";
  try {
    onStep?.("文案建议", "running");
    const model = getShopChatModel();
    const res = await model.invoke([
      new SystemMessage(
        "你是一个电商文案专家。根据商品信息，给出：①卖点提炼（3-5条）②优化后的商品描述草案（100-200字）③FAQ 建议（2条）。使用简体中文，简洁直接。"
      ),
      new HumanMessage(
        `商品名：${product.title}\n当前描述：${product.description || "（无）"}\n商品类型：${product.productType || "未知"}\n用户目标：${goal}\n约束：${constraints ?? "无"}`
      ),
    ]);
    copyAdvice =
      typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    onStep?.("文案建议", "completed");
    steps.push({ step: "文案建议", status: "completed", output: "文案建议已生成" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    onStep?.("文案建议", "error");
    steps.push({ step: "文案建议", status: "error", output: `文案生成失败：${msg}` });
    copyAdvice = "（文案生成失败，请手动填写）";
  }

  // ── Step 3: 翻译准备 ──
  onStep?.("翻译准备", "running");
  const translationNote =
    check.hasDescription
      ? `建议翻译字段：标题（${product.title.length}字）、描述（${check.descriptionLength}字）、卖点标签。可使用翻译任务功能批量处理。`
      : "建议先完善中文描述，再进行翻译。";
  onStep?.("翻译准备", "completed");
  steps.push({ step: "翻译准备", status: "completed", output: translationNote });

  // ── Step 4: 上架清单 ──
  onStep?.("上架清单", "running");
  const checklist = [
    `完整度评分：${check.score}/100`,
    check.missingFields.length > 0
      ? `待补全：${check.missingFields.join("、")}`
      : "信息完整度良好",
    `图片：${check.imageCount} 张`,
    `变体：${check.variantCount} 个`,
    `当前状态：${check.isPublished ? "已上架 (ACTIVE)" : "草稿 (DRAFT)"}`,
  ].join("\n");

  onStep?.("上架清单", "completed");
  steps.push({ step: "上架清单", status: "completed", output: checklist });

  const summary = [
    `## 商品「${product.title}」上新报告`,
    "",
    `### 完整度：${check.score}/100`,
    check.missingFields.length > 0
      ? `待补全：${check.missingFields.join("、")}`
      : "信息完整度良好 ✓",
    "",
    "### 文案建议",
    copyAdvice,
    "",
    "### 翻译准备",
    translationNote,
    "",
    "### 上架建议",
    check.score >= 80
      ? "可直接上架，建议先预览商品页确认展示效果。"
      : "建议先补全缺失字段后再上架，避免影响转化率。",
  ].join("\n");

  return {
    ok: true,
    summary,
    steps,
    data: { productId, productTitle: product.title, completenessCheck: check },
  };
}

// ──────────────────────────────────────────────
// Playbook 定义
// ──────────────────────────────────────────────

export const productLaunchPipelinePlaybook: PlaybookDefinition = {
  name: "productLaunchPipeline",
  displayName: "上新流水线",
  description:
    "检查商品信息完整度、生成文案建议、翻译准备建议，输出结构化上架清单",
  category: "merchandising",
  triggerDescription:
    "当用户要上架新商品、检查商品信息是否完整、批量上新或请求上新指引时触发。可提供商品 ID 以获取针对性建议。",
  steps: ["商品信息检查", "文案建议", "翻译准备", "上架清单"],
  run,
};
