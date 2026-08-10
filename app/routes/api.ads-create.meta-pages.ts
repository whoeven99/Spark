import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { getMetaAdsCredential } from "../server/adsCatalog/credentialStore.server";
import {
  createEnumerationCache,
  parseRefreshFlag,
} from "../server/adsCatalog/enumerationCache.server";
import { getMetaPages, type MetaPage } from "../server/adsCatalog/metaOAuth.server";

// Page 列表以周月为单位变化，没必要每次打开创建表单都打一次 Graph API。
const pagesCache = createEnumerationCache<MetaPage[]>();

/**
 * GET /api/ads-create/meta-pages?refresh=0|1
 * 列举当前 Meta Ads token 可管理的 Facebook Page，供广告创意选择 page_id。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const cred = await getMetaAdsCredential(shop);
  if (!cred) {
    return data(
      { ok: false as const, errorMsg: "Meta 广告账户未连接", pages: [] },
      { status: 400 },
    );
  }

  const refresh = parseRefreshFlag(new URL(request.url).searchParams.get("refresh"));

  try {
    const pages = await pagesCache.get(shop, () => getMetaPages(cred.accessToken), {
      refresh,
    });
    return data({ ok: true as const, pages });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "加载 Facebook Page 失败";
    return data(
      { ok: false as const, errorMsg, pages: [] },
      { status: 500 },
    );
  }
};
