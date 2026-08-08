import { describe, expect, it } from "vitest";
import {
  buildDateRange,
  buildPreviousDateRange,
} from "../../../../app/server/googleSearchConsole/gscApi.server";

describe("gscApi date helpers", () => {
  it("buildDateRange spans the requested number of days", () => {
    const { startDate, endDate } = buildDateRange(7);
    const end = new Date(endDate + "T12:00:00");
    const start = new Date(startDate + "T12:00:00");
    const diffDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBe(6);
  });

  it("buildDateRange for 28 days spans 27 day gap", () => {
    const { startDate, endDate } = buildDateRange(28);
    const end = new Date(endDate + "T12:00:00");
    const start = new Date(startDate + "T12:00:00");
    const diffDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBe(27);
  });

  it("buildPreviousDateRange ends the day before current period starts", () => {
    const current = buildDateRange(7);
    const previous = buildPreviousDateRange(7);
    const currentStart = new Date(current.startDate + "T00:00:00");
    const prevEnd = new Date(previous.endDate + "T00:00:00");
    const prevStart = new Date(previous.startDate + "T00:00:00");

    expect(prevEnd.getTime()).toBeLessThan(currentStart.getTime());
    const prevLength = Math.round((prevEnd.getTime() - prevStart.getTime()) / (24 * 60 * 60 * 1000));
    expect(prevLength).toBe(6);
  });
});
