import type { PageSpeedReport, PageSpeedStrategy } from "../../lib/pageSpeedTypes";
import { PAGE_SPEED_CATEGORY_IDS } from "../../lib/pageSpeedTypes";
import { PageSpeedRequestError } from "./pageSpeedErrors.server";
import { parsePageSpeedResponse } from "./pageSpeedParse.server";

const LOG_PREFIX = "[PageSpeed]";

function lighthouseLocale(locale: string): string {
  return locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export async function runLighthousePageSpeedAnalysis(params: {
  url: string;
  strategy: PageSpeedStrategy;
  locale: string;
  timeoutMs: number;
}): Promise<PageSpeedReport> {
  const { default: lighthouse, desktopConfig } = await import("lighthouse");
  const { launch } = await import("chrome-launcher");

  let chrome: Awaited<ReturnType<typeof launch>> | null = null;
  try {
    chrome = await launch({
      chromeFlags: [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    const config = params.strategy === "desktop" ? desktopConfig : undefined;
    const runnerResult = await Promise.race([
      lighthouse(
        params.url,
        {
          port: chrome.port,
          output: "json",
          logLevel: "error",
          onlyCategories: [...PAGE_SPEED_CATEGORY_IDS],
          locale: lighthouseLocale(params.locale) as "en" | "zh",
        },
        config,
      ),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new PageSpeedRequestError("timeout", "timeout", 504)),
          params.timeoutMs,
        );
      }),
    ]);

    if (!runnerResult?.lhr) {
      throw new PageSpeedRequestError("empty lighthouse result", "upstream", 502);
    }

    const report = parsePageSpeedResponse(
      {
        id: params.url,
        analysisUTCTimestamp: runnerResult.lhr.fetchTime,
        lighthouseResult: runnerResult.lhr,
      },
      params.strategy,
    );
    if (!report) {
      throw new PageSpeedRequestError("empty lighthouse result", "upstream", 502);
    }
    return report;
  } catch (error) {
    if (error instanceof PageSpeedRequestError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`${LOG_PREFIX} lighthouse ${message}`);
    if (/chrome|chromium|browser/i.test(message)) {
      throw new PageSpeedRequestError(
        "Chrome is required to run Lighthouse locally",
        "unreachable",
        502,
      );
    }
    throw new PageSpeedRequestError(message || "lighthouse failed", "upstream", 502);
  } finally {
    if (chrome) {
      try {
        chrome.kill();
      } catch {
        // ignore cleanup failures
      }
    }
  }
}
