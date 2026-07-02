import { describe, expect, it } from "vitest";
import { ToolMessage } from "@langchain/core/messages";
import "../../../../app/server/ai/playbooks/index";
import { extractPlaybookCasesFromMessages } from "../../../../app/server/playbookCase/recordPlaybookCase.server";
import type { PlaybookRunResult } from "../../../../app/server/ai/core/playbookRegistry.server";

describe("extractPlaybookCasesFromMessages", () => {
  it("extracts structured playbook tool results as case docs", () => {
    const result: PlaybookRunResult = {
      ok: true,
      summary: "库存止损方案已生成",
      steps: [{ step: "读取诊断快照", status: "completed", output: "ok" }],
      data: {
        goal: "哪些 SKU 要先补货",
        constraints: "只看美国仓",
        snapshotDate: "2026-07-02",
        snapshotId: "snap_1",
      },
      structuredResult: {
        diagnosis: [{ title: "库存风险需要止损", severity: "risk" }],
        evidence: [{ label: "高风险 SKU", value: 2 }],
        actions: [{ title: "补货", priority: "P0", status: "proposed" }],
        reviewMetrics: [
          { key: "riskSkuCount", label: "高风险 SKU 数", current: 2, target: 0 },
        ],
        followUps: [{ title: "次日复盘" }],
      },
      caseDraft: {
        title: "库存止损方案",
        severity: "risk",
        reviewDueAt: "2026-07-03T00:00:00.000Z",
      },
    };

    const cases = extractPlaybookCasesFromMessages({
      messages: [
        new ToolMessage({
          content: JSON.stringify(result),
          name: "run_playbook_inventoryRiskMitigation",
          tool_call_id: "call_1",
        }),
      ],
      shop: "test-shop.myshopify.com",
      agentRunId: "run_1",
      now: "2026-07-02T00:00:00.000Z",
    });

    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      shop: "test-shop.myshopify.com",
      appName: "spark",
      playbookName: "inventoryRiskMitigation",
      playbookDisplayName: "库存止损",
      title: "库存止损方案",
      status: "open",
      severity: "risk",
      goal: "哪些 SKU 要先补货",
      constraints: "只看美国仓",
      summary: "库存止损方案已生成",
      snapshotDate: "2026-07-02",
      refs: { agentRunId: "run_1", diagnosisSnapshotId: "snap_1" },
      reviewDueAt: "2026-07-03T00:00:00.000Z",
    });
    expect(cases[0].structuredResult.actions[0].title).toBe("补货");
  });

  it("ignores playbook results without structuredResult", () => {
    const result: PlaybookRunResult = {
      ok: true,
      summary: "旧格式结果",
      steps: [],
    };

    const cases = extractPlaybookCasesFromMessages({
      messages: [
        new ToolMessage({
          content: JSON.stringify(result),
          name: "run_playbook_shopHealthCheck",
          tool_call_id: "call_1",
        }),
      ],
      shop: "test-shop.myshopify.com",
    });

    expect(cases).toEqual([]);
  });
});
