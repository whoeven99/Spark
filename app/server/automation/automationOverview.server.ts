/**
 * 自动化面板数据组装（阶段 4：替换前端 mock 常量）。
 *
 * 当前系统真实存在的自动化只有「每日经营巡检」（懒触发：当日首次访问经营看板时
 * 由 dailyInspection.server 生成快照）；任务模板来自 Playbook 注册表——
 * 它们可在对话中触发，是后续定时执行的候选。
 */
import prisma from "../../db.server";
import "../ai/playbooks/index";
import { globalPlaybookRegistry } from "../ai/core/playbookRegistry.server";
import { normalizeSteps } from "../ai/core/skillTypes.server";
import type {
  AutomationConfiguredItem,
  AutomationHistoryItem,
  AutomationOverview,
  AutomationTemplateItem,
} from "../../lib/automationOverviewTypes";

const HISTORY_DAYS = 7;

function countByStatus(items: Array<{ status: string }>): { risk: number; watch: number } {
  let risk = 0;
  let watch = 0;
  for (const item of items) {
    if (item.status === "risk") risk += 1;
    else if (item.status === "watch") watch += 1;
  }
  return { risk, watch };
}

export async function getAutomationOverview(shop: string): Promise<AutomationOverview> {
  const snapshots = await prisma.operationDiagnosisSnapshot.findMany({
    where: { shop },
    orderBy: { generatedAt: "desc" },
    take: HISTORY_DAYS,
    include: {
      items: { select: { status: true } },
      _count: { select: { tasks: true } },
    },
  });

  const latest = snapshots[0] ?? null;
  const latestCounts = latest ? countByStatus(latest.items) : { risk: 0, watch: 0 };

  const configured: AutomationConfiguredItem[] = [
    {
      id: "daily-inspection",
      title: "每日经营巡检",
      schedule: "每天 · 当日首次访问经营看板时自动触发",
      lastRun: latest ? latest.generatedAt.toISOString() : null,
      status: latestCounts.risk > 0 ? "attention" : "healthy",
      outcome: latest
        ? latest.hasData
          ? `诊断 ${latest.items.length} 项（${latestCounts.risk} 项风险 / ${latestCounts.watch} 项关注），生成 ${latest._count.tasks} 条待办`
          : "店铺暂无可诊断数据（订单尚未回填）"
        : "尚未执行过巡检，打开经营看板即会触发首次诊断",
    },
  ];

  const history: AutomationHistoryItem[] = snapshots.map((snapshot) => {
    const counts = countByStatus(snapshot.items);
    return {
      id: snapshot.id,
      title: `每日经营巡检 · ${snapshot.snapshotDate}`,
      detail: snapshot.hasData
        ? `诊断 ${snapshot.items.length} 项（风险 ${counts.risk} / 关注 ${counts.watch}）· 生成待办 ${snapshot._count.tasks} 条`
        : "执行完成：店铺暂无可诊断数据",
    };
  });

  const templates: AutomationTemplateItem[] = globalPlaybookRegistry
    .getRegistered()
    .map((def) => ({
      id: def.name,
      title: def.displayName,
      detail: def.description,
      steps: normalizeSteps(def.steps).map((step) => step.label),
    }));

  return { configured, history, templates };
}
