/**
 * 已选商品导出读取：Shopify 原生商品 CSV 所需字段。TikTok 格式复用 ads catalog fetcher。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  PRODUCT_EXPORT_GRAPHQL_PAGE_SIZE,
  PRODUCT_EXPORT_MAX_IMAGES,
  PRODUCT_EXPORT_MAX_VARIANTS,
  optionLinkedToCsv,
  shopifyWeightToGrams,
  shopifyWeightUnitCsv,
  type ProductExportShopifyImage,
  type ProductExportShopifyProduct,
  type ProductExportShopifyVariant,
} from "../../lib/productExport";
import { fetchProductConnectionByIds } from "./productIdQuery.server";

const QUERY = `#graphql
  query ProductExportProducts($first: Int!, $after: String, $query: String!) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          descriptionHtml
          vendor
          productType
          tags
          status
          publishedAt
          isGiftCard
          seo { title description }
          category { fullName }
          options {
            name
            position
            linkedMetafield { namespace key }
          }
          images(first: 250) {
            edges { node { url altText } }
          }
          variants(first: 100) {
            edges {
              node {
                sku
                barcode
                price
                compareAtPrice
                taxable
                taxCode
                inventoryQuantity
                inventoryPolicy
                selectedOptions { name value }
                image { url }
                inventoryItem {
                  tracked
                  requiresShipping
                  unitCost { amount }
                  measurement { weight { value unit } }
                }
              }
            }
          }
        }
      }
    }
  }
`;

type LinkedMetafieldNode = {
  namespace?: string | null;
  key?: string | null;
};

type OptionNode = {
  name?: string | null;
  position?: number | null;
  linkedMetafield?: LinkedMetafieldNode | null;
};

type WeightNode = {
  value?: number | null;
  unit?: string | null;
};

type VariantNode = {
  sku?: string | null;
  barcode?: string | null;
  price?: string | null;
  compareAtPrice?: string | null;
  taxable?: boolean | null;
  taxCode?: string | null;
  inventoryQuantity?: number | null;
  inventoryPolicy?: string | null;
  selectedOptions?: Array<{ name?: string | null; value?: string | null }> | null;
  image?: { url?: string | null } | null;
  inventoryItem?: {
    tracked?: boolean | null;
    requiresShipping?: boolean | null;
    unitCost?: { amount?: string | null } | null;
    measurement?: { weight?: WeightNode | null } | null;
  } | null;
};

type ProductNode = {
  id?: string | null;
  title?: string | null;
  handle?: string | null;
  descriptionHtml?: string | null;
  vendor?: string | null;
  productType?: string | null;
  tags?: string[] | null;
  status?: string | null;
  publishedAt?: string | null;
  isGiftCard?: boolean | null;
  seo?: { title?: string | null; description?: string | null } | null;
  category?: { fullName?: string | null } | null;
  options?: OptionNode[] | null;
  images?: { edges?: Array<{ node?: { url?: string | null; altText?: string | null } | null }> };
  variants?: { edges?: Array<{ node: VariantNode }> };
};

type OptionColumn = {
  name: string;
  linkedTo: string;
};

function sortOptions(options: OptionNode[]): OptionColumn[] {
  return [...options]
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
    .slice(0, 3)
    .map((option) => ({
      name: option.name?.trim() ?? "",
      linkedTo: optionLinkedToCsv(option.linkedMetafield?.namespace, option.linkedMetafield?.key),
    }));
}

function optionColumnsFromVariants(variants: VariantNode[]): OptionColumn[] {
  const selected = variants[0]?.selectedOptions ?? [];
  return [0, 1, 2].map((index) => ({
    name: selected[index]?.name?.trim() ?? "",
    linkedTo: "",
  }));
}

function optionValue(selected: VariantNode["selectedOptions"], name: string, index: number): string {
  if (name) {
    const matched = (selected ?? []).find((option) => option.name?.trim() === name);
    if (matched) return matched.value?.trim() ?? "";
  }
  return selected?.[index]?.value?.trim() ?? "";
}

function inventoryPolicyCsv(policy: string | null | undefined): string {
  const normalized = policy?.trim().toLowerCase() ?? "";
  if (normalized === "deny" || normalized === "continue") return normalized;
  return "";
}

function mapWeight(weight: WeightNode | null | undefined): { grams: string; unit: string } {
  const value = weight?.value;
  const unit = weight?.unit?.trim() ?? "";
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { grams: "0", unit: "kg" };
  }
  return {
    grams: shopifyWeightToGrams(value, unit),
    unit: shopifyWeightUnitCsv(unit),
  };
}

function mapImages(node: ProductNode): ProductExportShopifyImage[] {
  const images: ProductExportShopifyImage[] = [];
  for (const edge of node.images?.edges ?? []) {
    const src = edge.node?.url?.trim() ?? "";
    if (!src) continue;
    images.push({ src, altText: edge.node?.altText?.trim() ?? "" });
  }
  return images;
}

function mapVariant(
  node: VariantNode,
  options: OptionColumn[],
  giftCard: boolean,
): ProductExportShopifyVariant {
  const tracked = Boolean(node.inventoryItem?.tracked);
  const weight = mapWeight(node.inventoryItem?.measurement?.weight);
  const selected = node.selectedOptions ?? [];
  return {
    sku: node.sku?.trim() ?? "",
    barcode: node.barcode?.trim() ?? "",
    price: node.price ?? "",
    compareAtPrice: node.compareAtPrice ?? "",
    option1Name: options[0]?.name ?? "",
    option1Value: optionValue(selected, options[0]?.name ?? "", 0),
    option1LinkedTo: options[0]?.linkedTo ?? "",
    option2Name: options[1]?.name ?? "",
    option2Value: optionValue(selected, options[1]?.name ?? "", 1),
    option2LinkedTo: options[1]?.linkedTo ?? "",
    option3Name: options[2]?.name ?? "",
    option3Value: optionValue(selected, options[2]?.name ?? "", 2),
    option3LinkedTo: options[2]?.linkedTo ?? "",
    grams: weight.grams,
    inventoryTracker: tracked ? "shopify" : "",
    inventoryQty: tracked ? String(node.inventoryQuantity ?? 0) : "",
    inventoryPolicy: inventoryPolicyCsv(node.inventoryPolicy),
    fulfillmentService: giftCard ? "gift_card" : "manual",
    requiresShipping: node.inventoryItem?.requiresShipping ?? true,
    taxable: node.taxable ?? true,
    variantImageSrc: node.image?.url?.trim() ?? "",
    weightUnit: weight.unit,
    taxCode: node.taxCode?.trim() ?? "",
    cost: node.inventoryItem?.unitCost?.amount?.trim() ?? "",
  };
}

export function mapProductExportShopifyNode(node: ProductNode): ProductExportShopifyProduct | null {
  if (!node.id) return null;
  const giftCard = Boolean(node.isGiftCard);
  const variantNodes = (node.variants?.edges ?? []).map((edge) => edge.node);
  const options =
    (node.options ?? []).length > 0 ? sortOptions(node.options ?? []) : optionColumnsFromVariants(variantNodes);
  return {
    id: node.id,
    handle: node.handle?.trim() ?? "",
    title: node.title?.trim() ?? "",
    bodyHtml: node.descriptionHtml ?? "",
    vendor: node.vendor?.trim() ?? "",
    productCategory: node.category?.fullName?.trim() ?? "",
    productType: node.productType?.trim() ?? "",
    tags: (node.tags ?? []).join(", "),
    published: Boolean(node.publishedAt),
    giftCard,
    status: node.status?.trim() ?? "",
    seoTitle: node.seo?.title?.trim() ?? "",
    seoDescription: node.seo?.description?.trim() ?? "",
    images: mapImages(node).slice(0, PRODUCT_EXPORT_MAX_IMAGES),
    variants: variantNodes
      .slice(0, PRODUCT_EXPORT_MAX_VARIANTS)
      .map((variant) => mapVariant(variant, options, giftCard)),
  };
}

export async function fetchProductsForShopifyCsvExport(
  admin: ShopifyAdminGraphqlClient,
  productIds: string[],
  options: { maxProducts: number },
): Promise<{ products: ProductExportShopifyProduct[]; truncated: boolean }> {
  const { items, truncated } = await fetchProductConnectionByIds(admin, productIds, {
    query: QUERY,
    maxProducts: options.maxProducts,
    mapNode: mapProductExportShopifyNode,
    idsPerQuery: PRODUCT_EXPORT_GRAPHQL_PAGE_SIZE,
    pageSize: PRODUCT_EXPORT_GRAPHQL_PAGE_SIZE,
  });
  return { products: items, truncated };
}
