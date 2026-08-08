import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getGscCredential,
  setGscCredential,
} from "../server/googleSearchConsole/gscCredentials.server";
import {
  type GscSitemap,
  listGscSitemaps,
  refreshGscAccessToken,
} from "../server/googleSearchConsole/gscApi.server";

export type GscSitemapsOk = {
  ok: true;
  connected: true;
  siteUrl: string;
  sitemaps: GscSitemap[];
};

export type GscSitemapsNotConnected = {
  ok: true;
  connected: false;
};

export type GscSitemapsError = {
  ok: false;
  error: string;
};

export type GscSitemapsResponse = GscSitemapsOk | GscSitemapsNotConnected | GscSitemapsError;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const credential = await getGscCredential(session.shop);
  if (!credential) {
    return Response.json({ ok: true, connected: false } satisfies GscSitemapsNotConnected);
  }

  let accessToken = credential.accessToken;
  if (credential.refreshToken) {
    try {
      accessToken = await refreshGscAccessToken(credential.refreshToken);
      await setGscCredential(session.shop, { ...credential, accessToken });
    } catch {
      // refresh 失败时继续用旧 token 尝试
    }
  }

  try {
    const sitemaps = await listGscSitemaps(accessToken, credential.siteUrl);
    return Response.json({
      ok: true,
      connected: true,
      siteUrl: credential.siteUrl,
      sitemaps,
    } satisfies GscSitemapsOk);
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "获取 Sitemap 数据失败",
      } satisfies GscSitemapsError,
      { status: 200 },
    );
  }
};
