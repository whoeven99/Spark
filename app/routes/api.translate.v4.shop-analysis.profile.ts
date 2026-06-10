/**
 * GET /api/translate/v4/shop-analysis/profile  → read ShopProfile from Blob
 * PUT /api/translate/v4/shop-analysis/profile  → save edited ShopProfile + bump Redis version
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import {
  readShopProfile,
  writeShopProfile,
  bumpProfileVersion,
  type ShopProfile,
} from "../server/translation/shopAnalysis.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  try {
    const profile = await readShopProfile(session.shop);
    return data({ ok: true, profile });
  } catch (err) {
    return data({ ok: false, error: String(err) }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (request.method !== "PUT") {
    return data({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const body = (await request.json().catch(() => null)) as ShopProfile | null;
  if (!body || typeof body.industry !== "string") {
    return data({ ok: false, error: "请求体格式不正确" }, { status: 400 });
  }

  try {
    body.shopName = session.shop;
    await writeShopProfile(session.shop, body);
    await bumpProfileVersion(session.shop);
    return data({ ok: true });
  } catch (err) {
    return data({ ok: false, error: String(err) }, { status: 500 });
  }
};
