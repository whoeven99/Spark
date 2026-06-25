import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { getBraceletStyle } from "./braceletStyles.server";
import type { BraceletStyleId } from "./types";

const PRODUCT_BY_HANDLE_QUERY = `#graphql
  query BraceletProductByHandle($handle: String!) {
    productByHandle(handle: $handle) {
      id
      title
      variants(first: 20) {
        nodes {
          id
          title
          availableForSale
          selectedOptions {
            name
            value
          }
        }
      }
    }
  }
`;

export function parseVariantNumericId(gid: string): number | null {
  const match = gid.match(/\/ProductVariant\/(\d+)$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function envVariantId(style: BraceletStyleId): number | null {
  const key =
    style === "classic"
      ? "BRACELET_VARIANT_ID_CLASSIC"
      : "BRACELET_VARIANT_ID_BEADED";
  const raw = process.env[key]?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveProductHandle(): string {
  return process.env.BRACELET_PRODUCT_HANDLE?.trim() || "custom-bracelet";
}

function matchVariantByStyle(
  variants: Array<{
    id: string;
    title: string;
    availableForSale: boolean;
    selectedOptions: Array<{ name: string; value: string }>;
  }>,
  style: BraceletStyleId,
): string | null {
  const { optionValue, label } = getBraceletStyle(style);
  const normalizedTarget = optionValue.toLowerCase();

  for (const variant of variants) {
    const styleOption = variant.selectedOptions.find(
      (opt) => opt.name.toLowerCase() === "style",
    );
    if (styleOption?.value.toLowerCase() === normalizedTarget) {
      return variant.id;
    }
  }

  for (const variant of variants) {
    const haystack = `${variant.title} ${variant.selectedOptions.map((o) => o.value).join(" ")}`.toLowerCase();
    if (
      haystack.includes(normalizedTarget) ||
      haystack.includes(label.toLowerCase())
    ) {
      return variant.id;
    }
  }

  return null;
}

export async function resolveBraceletVariantId(params: {
  admin: AdminApiContext;
  style: BraceletStyleId;
}): Promise<{ variantId: number } | { error: string }> {
  const fromEnv = envVariantId(params.style);
  if (fromEnv != null) {
    return { variantId: fromEnv };
  }

  const handle = resolveProductHandle();
  const response = await params.admin.graphql(PRODUCT_BY_HANDLE_QUERY, {
    variables: { handle },
  });
  const payload = (await response.json()) as {
    data?: {
      productByHandle?: {
        title?: string;
        variants?: {
          nodes?: Array<{
            id: string;
            title: string;
            availableForSale: boolean;
            selectedOptions: Array<{ name: string; value: string }>;
          }>;
        };
      };
    };
    errors?: Array<{ message: string }>;
  };

  const gqlErrors = payload.errors?.map((e) => e.message) ?? [];
  if (gqlErrors.length > 0) {
    return { error: gqlErrors.join("；") };
  }

  const product = payload.data?.productByHandle;
  if (!product) {
    return {
      error: `未找到商品 handle="${handle}"。请在店铺创建「定制手环」商品（2 个 Style variant：Classic / Beaded），或设置 BRACELET_PRODUCT_HANDLE / BRACELET_VARIANT_ID_* 环境变量。`,
    };
  }

  const variants = product.variants?.nodes ?? [];
  const gid = matchVariantByStyle(variants, params.style);
  if (!gid) {
    return {
      error: `商品「${product.title ?? handle}」中未找到样式「${getBraceletStyle(params.style).label}」对应的 variant。请添加 Option「Style」，值为 Classic / Beaded。`,
    };
  }

  const variantId = parseVariantNumericId(gid);
  if (variantId == null) {
    return { error: "无法解析 variant ID。" };
  }

  return { variantId };
}
