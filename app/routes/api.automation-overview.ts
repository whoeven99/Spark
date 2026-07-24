/** GET /api/automation-overview — 工作台自动化面板数据（真实巡检快照 + Playbook 模板）。 */
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getAutomationOverview } from "../server/automation/automationOverview.server";
import type { AutomationOverviewResponse } from "../lib/automationOverviewTypes";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  try {
    const overview = await getAutomationOverview(session.shop);
    return Response.json({ ok: true, overview } satisfies AutomationOverviewResponse);
  } catch (e) {
    console.error("[AutomationOverview] failed:", e);
    return Response.json(
      { ok: false, error: "自动化数据加载失败" } satisfies AutomationOverviewResponse,
      { status: 500 },
    );
  }
};
