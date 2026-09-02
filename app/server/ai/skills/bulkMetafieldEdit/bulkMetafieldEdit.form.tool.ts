import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext } from "../../core/toolRegistry.server";
import {
  listProductMetafieldDefinitions,
  type ShopifyMetafieldDefinitionSummary,
} from "../../../shopify/productMetafieldReader.server";
import {
  BULK_METAFIELD_EDIT_MAX_PRODUCTS,
  describeMetafieldType,
  isSupportedMetafieldType,
  type BulkMetafieldEditSupportedType,
} from "../../../../lib/bulkMetafieldEdit";

export const OPEN_BULK_METAFIELD_EDIT_FORM_TOOL_NAME = "open_bulk_metafield_edit_form";

/** 下拉里最多放多少个字段：够覆盖绝大多数店铺，又不至于让卡片 payload 无节制膨胀。 */
const MAX_FIELD_OPTIONS = 60;

export type BulkMetafieldEditFormPayload = {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  action?: string;
  fieldKey?: string;
  value?: string;
  onlyFillEmpty?: boolean;
  fieldOptions: Array<{ value: string; label: string }>;
  fieldsTruncated?: boolean;
};

/** zod 在 `.max().optional()` 之后推不出元素类型，这里显式给一份与 schema 同形的类型。 */
type ToolProductArg = { id: string; title?: string; imageUrl?: string | null };

/** 只留能批量改的标量类型，顺带把 type 收窄成受支持的联合类型。 */
function selectEditableDefinitions(
  definitions: ShopifyMetafieldDefinitionSummary[],
): Array<ShopifyMetafieldDefinitionSummary & { type: BulkMetafieldEditSupportedType }> {
  return definitions.flatMap((definition) =>
    isSupportedMetafieldType(definition.type) ? [{ ...definition, type: definition.type }] : [],
  );
}

/**
 * 打开批量改 Metafield 确认卡。
 *
 * 与批量调整合集一样，这里必须读一次 Shopify：确认卡的字段下拉需要真实定义，
 * 而卡片渲染发生在 SSE 同步回调里、没法再发异步请求。读的是只读列表，不做任何写入。
 * 不支持批量改的类型（list / reference / rich text 等）不进下拉——
 * 商户在一个输入框里填不对，给了也只是徒增试算失败。
 */
export function createBulkMetafieldEditFormTool(context: AgentContext): DynamicStructuredTool {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: OPEN_BULK_METAFIELD_EDIT_FORM_TOOL_NAME,
    description:
      "打开「批量修改商品自定义字段（metafield）」确认卡片。当用户要给一批商品统一填写或清空某个自定义字段时调用，例如「把这些商品的材质都填成纯棉」「把过季标记清空」。调用后不会修改任何商品。",
    schema: z.object({
      products: z
        .array(
          z.object({
            id: z.string().describe("商品 GID，如 gid://shopify/Product/123"),
            title: z.string().optional(),
            imageUrl: z.string().nullable().optional(),
          }),
        )
        .max(BULK_METAFIELD_EDIT_MAX_PRODUCTS)
        .optional()
        .describe(
          "要修改自定义字段的商品；从[工作台上下文]的已选商品逐行提取，留空则由前端用已选商品补全",
        ),
      action: z
        .enum(["set", "clear"])
        .optional()
        .describe(
          "操作方式：写入值填 set，清空该字段填 clear。用户没说清就不要传，让他在卡片里选",
        ),
      fieldKeyword: z
        .string()
        .optional()
        .describe("用户提到的字段名称关键词，用于把下拉候选缩小到相关字段；没提就不要传"),
      fieldKey: z
        .string()
        .optional()
        .describe(
          "已经确定的字段标识，格式为 namespace.key（如先调用过 list_product_metafields）；不确定就不要传",
        ),
      value: z
        .string()
        .optional()
        .describe(
          "要写入的值，来自用户原话。可用 {title} / {vendor} / {productType} 占位符按商品取值；action=clear 时不要传",
        ),
      onlyFillEmpty: z
        .boolean()
        .optional()
        .describe("用户明确说「只补空的 / 不要覆盖已有内容」时传 true，否则不要传"),
    }),
    func: async ({ products, action, fieldKeyword, fieldKey, value, onlyFillEmpty }) => {
      const keyword = fieldKeyword?.trim() ?? "";
      let listed = await listProductMetafieldDefinitions(admin, { keyword });
      let usable = selectEditableDefinitions(listed.definitions);

      // 关键词没匹配到任何可批量改的字段时退回全量列表，避免下拉空着
      if (keyword && usable.length === 0) {
        listed = await listProductMetafieldDefinitions(admin);
        usable = selectEditableDefinitions(listed.definitions);
      }

      const capped = usable.slice(0, MAX_FIELD_OPTIONS);
      const fieldOptions = capped.map((definition) => ({
        value: `${definition.namespace}.${definition.key}`,
        // 类型要摆在标签里：商户得知道这个字段只收整数，才不会填一堆写不进去的值
        label: `${definition.name}（${describeMetafieldType(definition.type)}）· ${definition.namespace}.${definition.key}`,
      }));

      const requestedKey = fieldKey?.trim() ?? "";
      const preselected =
        requestedKey && fieldOptions.some((option) => option.value === requestedKey)
          ? requestedKey
          : // 关键词只命中唯一一个可用字段时替用户选好，其余情况留空让他自己确认
            capped.length === 1
            ? fieldOptions[0].value
            : "";

      const payload: BulkMetafieldEditFormPayload = {
        products: ((products ?? []) as ToolProductArg[]).map((p) => ({
          id: p.id,
          title: p.title?.trim() || p.id,
          imageUrl: p.imageUrl ?? null,
        })),
        ...(action ? { action } : {}),
        ...(preselected ? { fieldKey: preselected } : {}),
        ...(action === "clear" ? {} : { value: value?.trim() ?? "" }),
        ...(onlyFillEmpty ? { onlyFillEmpty: true } : {}),
        fieldOptions,
        ...(listed.hasMore || usable.length > capped.length ? { fieldsTruncated: true } : {}),
      };
      return JSON.stringify({
        ...payload,
        // 给模型的额外说明，不进卡片：被排除的不可批量改类型数量
        excludedUnsupportedCount: listed.definitions.length - usable.length,
      });
    },
  });
}
