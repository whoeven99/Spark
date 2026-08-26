import { describe, expect, it } from "vitest";
import {
  healthMonitorNeedsDiagnosisDetail,
  resolveHealthMonitorView,
  shouldRevalidateHealthMonitor,
} from "../../../app/lib/healthMonitorView";

const PATH = "/app/health-monitor";

function url(search = "") {
  return new URL(`https://example.com${PATH}${search}`);
}

describe("resolveHealthMonitorView", () => {
  it("defaults missing and unknown values to overview", () => {
    expect(resolveHealthMonitorView(null)).toBe("overview");
    expect(resolveHealthMonitorView(undefined)).toBe("overview");
    expect(resolveHealthMonitorView("overview")).toBe("overview");
    expect(resolveHealthMonitorView("other")).toBe("overview");
  });

  it("only treats view=detail as the detail mode", () => {
    expect(resolveHealthMonitorView("detail")).toBe("detail");
  });
});

describe("healthMonitorNeedsDiagnosisDetail", () => {
  it("only asks for the 30-day detail snapshot on the detail view", () => {
    expect(healthMonitorNeedsDiagnosisDetail("overview")).toBe(false);
    expect(healthMonitorNeedsDiagnosisDetail("detail")).toBe(true);
  });
});

describe("shouldRevalidateHealthMonitor", () => {
  it("revalidates when leaving the route", () => {
    expect(
      shouldRevalidateHealthMonitor({
        currentUrl: url(),
        nextUrl: new URL("https://example.com/app"),
        defaultShouldRevalidate: true,
      }),
    ).toBe(true);
  });

  it("revalidates when opening detail from overview", () => {
    expect(
      shouldRevalidateHealthMonitor({
        currentUrl: url("?view=overview"),
        nextUrl: url("?view=detail&monitor=refund-health"),
        defaultShouldRevalidate: false,
      }),
    ).toBe(true);
  });

  it("does not revalidate when switching monitors on the detail view", () => {
    expect(
      shouldRevalidateHealthMonitor({
        currentUrl: url("?view=detail&monitor=refund-health"),
        nextUrl: url("?view=detail&monitor=inventory-health"),
        defaultShouldRevalidate: true,
      }),
    ).toBe(false);
  });

  it("does not revalidate when returning from detail to overview", () => {
    expect(
      shouldRevalidateHealthMonitor({
        currentUrl: url("?view=detail&monitor=refund-health"),
        nextUrl: url("?view=overview"),
        defaultShouldRevalidate: true,
      }),
    ).toBe(false);
  });

  it("does not revalidate overview-only search changes", () => {
    expect(
      shouldRevalidateHealthMonitor({
        currentUrl: url("?view=overview"),
        nextUrl: url("?view=overview&returnTo=%2Fapp"),
        defaultShouldRevalidate: true,
      }),
    ).toBe(false);
  });
});
