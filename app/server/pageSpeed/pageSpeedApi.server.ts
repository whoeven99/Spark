import { formatOutboundNetworkError } from "../common/outboundError.server";
import type { PageSpeedReport, PageSpeedStrategy } from "../../lib/pageSpeedTypes";
import { PAGE_SPEED_CATEGORY_IDS } from "../../lib/pageSpeedTypes";
import { PageSpeedRequestError } from "./pageSpeedErrors.server";
import { runLighthousePageSpeedAnalysis } from "./pageSpeedLighthouse.server";
import { parsePageSpeedResponse } from "./pageSpeedParse.server";
import { normalizePageSpeedUrl } from "./pageSpeedUrl.server";

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
export const PAGE_SPEED_TIMEOUT_MS = 90_000;
const LOG_PREFIX = "[PageSpeed]";

export { PageSpeedRequestError } from "./pageSpeedErrors.server";

export type PageSpeedProvider = "lighthouse" | "google";

export function readPageSpeedProvider(): PageSpeedProvider {
  const raw = process.env.PAGE_SPEED_PROVIDER?.trim().toLowerCase();
  return raw === "google" ? "google" : "lighthouse";
}

function readApiKey(): string {
  return process.env.GOOGLE_PAGESPEED_API_KEY?.trim() ?? "";
}

function psiLocale(locale: string): string {
  return locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function buildPsiUrl(url: string, strategy: PageSpeedStrategy, locale: string): URL {
  const endpoint = new URL(PSI_ENDPOINT);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", strategy);
  endpoint.searchParams.set("locale", psiLocale(locale));
  for (const category of PAGE_SPEED_CATEGORY_IDS) {
    endpoint.searchParams.append("category", category);
  }
  const key = readApiKey();
  if (key) endpoint.searchParams.set("key", key);
  return endpoint;
}

function mapHttpError(status: number, message: string): PageSpeedRequestError {
  if (status === 429) {
    return new PageSpeedRequestError(message || "rate limited", "rate_limited", 429);
  }
  if (status === 400) {
    return new PageSpeedRequestError(message || "invalid url", "invalid_url", 400);
  }
  return new PageSpeedRequestError(message || `upstream ${status}`, "upstream", 502);
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { error?: { message?: string } };
    return json.error?.message?.trim() || text.slice(0, 200);
  } catch {
    return text.slice(0, 200);
  }
}

async function runGooglePageSpeedAnalysis(params: {
  url: string;
  strategy: PageSpeedStrategy;
  locale: string;
}): Promise<PageSpeedReport> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_SPEED_TIMEOUT_MS);
  try {
    const response = await fetch(buildPsiUrl(params.url, params.strategy, params.locale), {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw mapHttpError(response.status, await readErrorMessage(response));
    }
    const report = parsePageSpeedResponse(await response.json(), params.strategy);
    if (!report) {
      throw new PageSpeedRequestError("empty lighthouse result", "upstream", 502);
    }
    return report;
  } catch (error) {
    if (error instanceof PageSpeedRequestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new PageSpeedRequestError("timeout", "timeout", 504);
    }
    console.warn(`${LOG_PREFIX} ${formatOutboundNetworkError(error)}`);
    throw new PageSpeedRequestError("unreachable", "unreachable", 502);
  } finally {
    clearTimeout(timer);
  }
}

export async function runPageSpeedAnalysis(params: {
  url: string;
  strategy: PageSpeedStrategy;
  locale: string;
}): Promise<PageSpeedReport> {
  const normalized = normalizePageSpeedUrl(params.url);
  if (!normalized) {
    throw new PageSpeedRequestError("invalid url", "invalid_url", 400);
  }

  const provider = readPageSpeedProvider();
  if (provider === "google") {
    return runGooglePageSpeedAnalysis({ ...params, url: normalized });
  }

  return runLighthousePageSpeedAnalysis({
    ...params,
    url: normalized,
    timeoutMs: PAGE_SPEED_TIMEOUT_MS,
  });
}
