import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { detectRequestLocale, readShopifySessionLocale } from "../i18n/detector.server";
import {
  PAGE_SPEED_STRATEGIES,
  type PageSpeedResponse,
  type PageSpeedStrategy,
} from "../lib/pageSpeedTypes";
import { resolvePageSpeedLocale } from "../lib/pageSpeedLocales";
import {
  PageSpeedRequestError,
  runPageSpeedAnalysis,
} from "../server/pageSpeed/pageSpeedApi.server";

function parseStrategy(raw: unknown): PageSpeedStrategy {
  if (typeof raw === "string" && PAGE_SPEED_STRATEGIES.includes(raw as PageSpeedStrategy)) {
    return raw as PageSpeedStrategy;
  }
  return "mobile";
}

function parseLocale(raw: unknown, request: Request, session: unknown): string {
  if (typeof raw === "string" && raw.trim()) {
    return resolvePageSpeedLocale(raw.trim());
  }
  return resolvePageSpeedLocale(
    detectRequestLocale(request, { sessionLocale: readShopifySessionLocale(session) }),
  );
}

function errorResponse(error: unknown): Response {
  if (error instanceof PageSpeedRequestError) {
    const body: PageSpeedResponse = {
      ok: false,
      errorCode: error.errorCode,
      error: error.message,
    };
    return Response.json(body, { status: error.status });
  }
  const body: PageSpeedResponse = {
    ok: false,
    errorCode: "upstream",
    error: error instanceof Error ? error.message : "upstream",
  };
  return Response.json(body, { status: 502 });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json(
      { ok: false, errorCode: "upstream", error: "Method not allowed" } satisfies PageSpeedResponse,
      { status: 405 },
    );
  }

  const { session } = await authenticate.admin(request);
  const body = (await request.json().catch(() => ({}))) as {
    url?: unknown;
    strategy?: unknown;
    locale?: unknown;
  };
  const url = typeof body.url === "string" ? body.url : "";

  try {
    const report = await runPageSpeedAnalysis({
      url,
      strategy: parseStrategy(body.strategy),
      locale: parseLocale(body.locale, request, session),
    });
    return Response.json({ ok: true, report } satisfies PageSpeedResponse);
  } catch (error) {
    return errorResponse(error);
  }
};
