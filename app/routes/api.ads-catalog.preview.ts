import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import { fetchProductsForCatalog } from "../server/adsCatalog/productFetcher.server";
import { fetchShopBasicInfo } from "../server/shopify/fetchShopBasicInfo.server";
import { mapShopifyToFacebook } from "../server/adsCatalog/mappers/shopifyToFacebook";
import { mapShopifyToGoogle } from "../server/adsCatalog/mappers/shopifyToGoogle";

const PreviewRequestSchema = z.object({
  platform: z.enum(["facebook", "google"]),
  productIds: z.array(z.string()).max(50).optional().nullable(),
  contentLanguage: z.string().min(2).max(8).optional(),
  targetCountry: z.string().min(2).max(4).optional(),
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

  const { admin, session } = await authenticate.admin(request);
  const limit = parsed.data.limit ?? 5;

  const [shopInfo, products] = await Promise.all([
    fetchShopBasicInfo(admin),
    fetchProductsForCatalog(admin, {
      productIds:
        parsed.data.productIds && parsed.data.productIds.length > 0
          ? parsed.data.productIds
          : null,
      maxProducts: limit,
    }),
  ]);

  const shopDomain =
    shopInfo?.primaryDomainHost ?? shopInfo?.myshopifyDomain ?? session.shop;
  const brand = shopInfo?.name ?? undefined;
  const defaultCurrency = shopInfo?.currencyCode ?? undefined;

  if (parsed.data.platform === "facebook") {
    const items = products.map((p) =>
      mapShopifyToFacebook(p, { shopDomain, defaultCurrency, brand }),
    );
    return Response.json({
      ok: true,
      platform: "facebook" as const,
      total: products.length,
      preview: items,
    });
  }

  const merchantProducts = products.map((p) =>
    mapShopifyToGoogle(p, {
      shopDomain,
      contentLanguage: parsed.data.contentLanguage ?? "en",
      targetCountry: parsed.data.targetCountry ?? "US",
      defaultCurrency,
      brand,
    }),
  );
  return Response.json({
    ok: true,
    platform: "google" as const,
    total: products.length,
    preview: merchantProducts,
  });
};
