import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultPageSpeedLocaleFromApp,
  isPageSpeedLocale,
  resolvePageSpeedLocale,
} from "../../../../app/lib/pageSpeedLocales";
import {
  lighthouseScoreTo100,
  parsePageSpeedResponse,
  scoreToBand,
} from "../../../../app/server/pageSpeed/pageSpeedParse.server";
import { normalizePageSpeedUrl } from "../../../../app/server/pageSpeed/pageSpeedUrl.server";
import {
  PageSpeedRequestError,
  runPageSpeedAnalysis,
} from "../../../../app/server/pageSpeed/pageSpeedApi.server";

const PSI_FIXTURE = {
  id: "https://ciwi.ai/",
  analysisUTCTimestamp: "2026-08-17T05:05:00.000Z",
  lighthouseResult: {
    requestedUrl: "https://ciwi.ai/",
    finalUrl: "https://ciwi.ai/",
    fetchTime: "2026-08-17T05:05:00.000Z",
    lighthouseVersion: "13.0.0",
    audits: {
      "first-contentful-paint": {
        id: "first-contentful-paint",
        title: "First Contentful Paint",
        displayValue: "2.7 s",
        score: 0.6,
        numericValue: 2700,
      },
      "largest-contentful-paint": {
        id: "largest-contentful-paint",
        title: "Largest Contentful Paint",
        displayValue: "4.6 s",
        score: 0.3,
        numericValue: 4600,
      },
      "total-blocking-time": {
        id: "total-blocking-time",
        title: "Total Blocking Time",
        displayValue: "130 ms",
        score: 0.95,
        numericValue: 130,
      },
      "cumulative-layout-shift": {
        id: "cumulative-layout-shift",
        title: "Cumulative Layout Shift",
        displayValue: "0",
        score: 1,
        numericValue: 0,
      },
      "speed-index": {
        id: "speed-index",
        title: "Speed Index",
        displayValue: "4.7 s",
        score: 0.7,
        numericValue: 4700,
      },
      "render-blocking-resources": {
        id: "render-blocking-resources",
        title: "Eliminate render-blocking resources",
        description: "Learn more at [web.dev](https://web.dev/render-blocking-resources/).",
        displayValue: "Est savings of 150 ms",
        score: 0.5,
        details: { type: "opportunity", overallSavingsMs: 150 },
      },
      "unused-javascript": {
        id: "unused-javascript",
        title: "Reduce unused JavaScript",
        description: "Remove unused JavaScript.",
        score: 0.4,
        details: { type: "opportunity", overallSavingsBytes: 69632 },
      },
      "long-tasks": {
        id: "long-tasks",
        title: "Avoid long main-thread tasks",
        description: "Found 3 long tasks.",
        score: 0,
        scoreDisplayMode: "informative",
      },
      "color-contrast": {
        id: "color-contrast",
        title: "Background and foreground colors do not have a sufficient contrast ratio.",
        description: "Low-contrast text is difficult to read.",
        score: 0,
      },
      "link-name": {
        id: "link-name",
        title: "Links have discernible names",
        description: "Link text helps screen readers.",
        score: 1,
      },
      "manual-a11y": {
        id: "manual-a11y",
        title: "Interactive controls are keyboard focusable",
        description: "Manual check required.",
        score: null,
        scoreDisplayMode: "manual",
      },
      "is-crawlable": {
        id: "is-crawlable",
        title: "Page isn’t blocked from indexing",
        score: 1,
      },
      "errors-in-console": {
        id: "errors-in-console",
        title: "No browser errors logged to the console",
        score: 1,
      },
    },
    categories: {
      performance: {
        id: "performance",
        title: "Performance",
        score: 0.75,
        auditRefs: [
          { id: "first-contentful-paint", group: "metrics" },
          { id: "render-blocking-resources", group: "load-opportunities" },
          { id: "unused-javascript", group: "load-opportunities" },
          { id: "long-tasks", group: "diagnostics" },
        ],
      },
      accessibility: {
        id: "accessibility",
        title: "Accessibility",
        score: 0.94,
        auditRefs: [
          { id: "color-contrast" },
          { id: "link-name" },
          { id: "manual-a11y" },
        ],
      },
      "best-practices": {
        id: "best-practices",
        title: "Best Practices",
        score: 1,
        auditRefs: [{ id: "errors-in-console" }],
      },
      seo: {
        id: "seo",
        title: "SEO",
        score: 1,
        auditRefs: [{ id: "is-crawlable" }],
      },
    },
  },
};

describe("pageSpeedLocales", () => {
  it("accepts supported PSI locale codes", () => {
    expect(isPageSpeedLocale("ja")).toBe(true);
    expect(isPageSpeedLocale("zh-CN")).toBe(true);
    expect(isPageSpeedLocale("xx")).toBe(false);
  });

  it("normalizes common aliases and falls back to en", () => {
    expect(resolvePageSpeedLocale("zh")).toBe("zh-CN");
    expect(resolvePageSpeedLocale("pt")).toBe("pt-BR");
    expect(resolvePageSpeedLocale("invalid")).toBe("en");
    expect(defaultPageSpeedLocaleFromApp("zh-CN")).toBe("zh-CN");
    expect(defaultPageSpeedLocaleFromApp("en-US")).toBe("en");
  });
});

describe("pageSpeedUrl", () => {
  it("normalizes host-only input to https", () => {
    expect(normalizePageSpeedUrl("ciwi.ai")).toBe("https://ciwi.ai/");
  });

  it("rejects non-http protocols and hostnames without a dot", () => {
    expect(normalizePageSpeedUrl("javascript:alert(1)")).toBeNull();
    expect(normalizePageSpeedUrl("localhost")).toBeNull();
    expect(normalizePageSpeedUrl("")).toBeNull();
  });
});

describe("pageSpeedParse", () => {
  it("maps lighthouse 0-1 scores to 0-100 bands", () => {
    expect(lighthouseScoreTo100(0.75)).toBe(75);
    expect(scoreToBand(75)).toBe("needs-improvement");
    expect(scoreToBand(94)).toBe("good");
    expect(scoreToBand(30)).toBe("poor");
  });

  it("extracts category scores, metrics, opportunities, failed, passed and manual audits", () => {
    const report = parsePageSpeedResponse(PSI_FIXTURE, "mobile", "ja");
    expect(report).not.toBeNull();
    expect(report?.locale).toBe("ja");
    expect(report?.categories.map((item) => item.score)).toEqual([75, 94, 100, 100]);
    expect(report?.metrics).toHaveLength(5);
    expect(report?.metrics[1]?.band).toBe("poor");
    expect(report?.reports.performance.opportunities.map((item) => item.id)).toEqual([
      "render-blocking-resources",
      "unused-javascript",
    ]);
    expect(report?.reports.performance.opportunities[0]?.description).toBe(
      "Learn more at web.dev.",
    );
    expect(report?.reports.performance.diagnostics).toHaveLength(1);
    expect(report?.reports.accessibility.failed[0]?.id).toBe("color-contrast");
    expect(report?.reports.accessibility.passed.map((item) => item.id)).toEqual(["link-name"]);
    expect(report?.reports.accessibility.manual.map((item) => item.id)).toEqual(["manual-a11y"]);
    expect(report?.reports.accessibility.passedCount).toBe(1);
    expect(report?.reports.accessibility.manualCount).toBe(1);
  });

  it("returns null when lighthouse result is missing", () => {
    expect(parsePageSpeedResponse({ id: "https://ciwi.ai/" }, "desktop")).toBeNull();
  });
});

describe("runPageSpeedAnalysis", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("throws invalid_url without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      runPageSpeedAnalysis({ url: "not a url", strategy: "mobile", locale: "zh-CN" }),
    ).rejects.toMatchObject({
      errorCode: "invalid_url",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses a successful PSI payload and omits key from the request when unset", async () => {
    vi.stubEnv("GOOGLE_PAGESPEED_API_KEY", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL) => {
        expect(input.searchParams.get("key")).toBeNull();
        expect(input.searchParams.get("strategy")).toBe("mobile");
        expect(input.searchParams.get("locale")).toBe("zh-CN");
        expect(input.searchParams.getAll("category")).toContain("seo");
        return {
          ok: true,
          json: async () => PSI_FIXTURE,
        };
      }),
    );

    const report = await runPageSpeedAnalysis({
      url: "https://ciwi.ai",
      strategy: "mobile",
      locale: "zh-CN",
    });
    expect(report.finalUrl).toBe("https://ciwi.ai/");
    expect(report.locale).toBe("zh-CN");
    expect(report.reports.performance.score).toBe(75);
  });

  it("maps 429 to rate_limited", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: "quota" } }),
      })),
    );

    await expect(
      runPageSpeedAnalysis({ url: "https://ciwi.ai", strategy: "desktop", locale: "en" }),
    ).rejects.toBeInstanceOf(PageSpeedRequestError);
    await expect(
      runPageSpeedAnalysis({ url: "https://ciwi.ai", strategy: "desktop", locale: "en" }),
    ).rejects.toMatchObject({ errorCode: "rate_limited", status: 429 });
  });
});
