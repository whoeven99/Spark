import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import { fetchProductsForCatalog } from "../server/adsCatalog/productFetcher.server";
import { fetchShopBasicInfo } from "../server/shopify/fetchShopBasicInfo.server";
import { mapShopifyToFacebook } from "../server/adsCatalog/mappers/shopifyToFacebook";
import { mapShopifyToGoogle } from "../server/adsCatalog/mappers/shopifyToGoogle";
import { validateProductsForGoogle } from "../server/adsCatalog/validators/googleProductValidator";

const PreviewRequestSchema = z.object({
  platform: z.enum(["facebook", "google"]),
  productIds: z.array(z.string()).max(250).optional().nullable(),
  contentLanguage: z.string().min(2).max(8).optional(),
  targetCountry: z.string().min(2).max(4).optional(),
  googleProductCategory: z.string().max(64).optional(),
  filters: z
    .object({
      tags: z.array(z.string()).optional(),
      productTypes: z.array(z.string()).optional(),
      vendors: z.array(z.string()).optional(),
      inStockOnly: z.boolean().optional(),
    })
    .optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const raw = await request.json().catch(() => null);
  const parsed = PreviewRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  try {
    const { admin, session } = await authenticate.admin(request);
    const filters = parsed.data.filters ?? {};
    const productIds =
      parsed.data.productIds && parsed.data.productIds.length > 0
        ? parsed.data.productIds
        : null;

    if (parsed.data.platform === "facebook") {
      const [shopInfo, products] = await Promise.all([
        fetchShopBasicInfo(admin),
        fetchProductsForCatalog(admin, {
          productIds,
          tags: filters.tags,
          productTypes: filters.productTypes,
          vendors: filters.vendors,
          inStockOnly: filters.inStockOnly,
          maxProducts: parsed.data.limit ?? 5,
        }),
      ]);
      const shopDomain =
        shopInfo?.primaryDomainHost ?? shopInfo?.myshopifyDomain ?? session.shop;
      const items = products.map((p) =>
        mapShopifyToFacebook(p, {
          shopDomain,
          defaultCurrency: shopInfo?.currencyCode ?? undefined,
          brand: shopInfo?.name ?? undefined,
        }),
      );
      return Response.json({
        ok: true,
        platform: "facebook" as const,
        total: products.length,
        preview: items,
      });
    }

    // Google: fetch the full filtered set (max 250) and run validation.
    const [shopInfo, products] = await Promise.all([
      fetchShopBasicInfo(admin),
      fetchProductsForCatalog(admin, {
        productIds,
        tags: filters.tags,
        productTypes: filters.productTypes,
        vendors: filters.vendors,
        inStockOnly: filters.inStockOnly,
        maxProducts: 250,
      }),
    ]);

    const shopDomain =
      shopInfo?.primaryDomainHost ?? shopInfo?.myshopifyDomain ?? session.shop;
    const googleProductCategory = parsed.data.googleProductCategory?.trim() || undefined;
    const enriched = products.map((p) => ({
      ...p,
      googleProductCategory: googleProductCategory ?? p.googleProductCategory ?? null,
    }));

    const report = validateProductsForGoogle(enriched);

    // A small mapped sample to help the merchant eyeball the payload shape.
    const sample = enriched.slice(0, parsed.data.limit ?? 5).map((p) =>
      mapShopifyToGoogle(p, {
        shopDomain,
        contentLanguage: parsed.data.contentLanguage ?? "en",
        targetCountry: parsed.data.targetCountry ?? "US",
        defaultCurrency: shopInfo?.currencyCode ?? undefined,
        brand: shopInfo?.name ?? undefined,
        googleProductCategory,
      }),
    );

    return Response.json({
      ok: true,
      platform: "google" as const,
      total: products.length,
      report,
      preview: sample,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load product preview";
    console.error("[AdsCatalog][Preview]", message, error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
};
