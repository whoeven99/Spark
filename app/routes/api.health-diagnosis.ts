import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import { resolveUiLocale } from "../i18n/resolveUiLocale.server";
import type {
  HealthDiagnosisApiResponse,
  HealthDiagnosisCardView,
} from "../lib/healthDiagnosisCardPayload";
import {
  ensureDailySnapshotOverview,
  type DailyOperationsOverviewResult,
} from "../server/operations/dailyInspection.server";
import {
  diagnosisItemName,
  diagnosisItemSummary,
  localizeOperationTaskCopy,
  toOpsCopyLocale,
  type OpsCopyLocale,
} from "../server/operations/opsCopy.server";
import { fetchShopBasicInfo } from "../server/shopify/fetchShopBasicInfo.server";
import { getOrderBackfillDays } from "../server/shopify/sync/orderBackfillConfig.server";

const LOG_PREFIX = "[HealthDiagnosis][Route]";

const refreshBodySchema = z.object({
  intent: z.literal("refresh"),
});

function jsonResponse(body: HealthDiagnosisApiResponse, status: number): Response {
  return Response.json(body, { status });
}

function toCardView(
  result: DailyOperationsOverviewResult,
  locale: OpsCopyLocale,
): HealthDiagnosisCardView {
  const riskItems = result.items
    .filter((item) => item.status === "risk" || item.status === "watch")
    .map((item) => ({
      name: diagnosisItemName(item.key, locale),
      status: item.status,
      summary: diagnosisItemSummary(item, locale),
    }));

  const activeTasks = result.tasks.filter((task) =>
    ["open", "in_progress"].includes(task.status),
  );
  const q1 = activeTasks.filter((task) => task.quadrant === "q1");
  const prioritySource = q1.length > 0 ? q1 : activeTasks;
  const priorityTasks = prioritySource.slice(0, 5).map((task) => {
    const copy = localizeOperationTaskCopy(
      {
        sourceKey: task.sourceKey,
        title: task.title,
        triggerReason: task.triggerReason,
        relatedObjects: task.relatedObjects,
        priority: task.priority,
        quadrant: task.quadrant,
      },
      result.metrics,
      locale,
    );
    return {
      id: task.id,
      title: copy.title,
      priority: task.priority,
      status: task.status,
      triggerReason: copy.triggerReason,
      quadrant: task.quadrant,
    };
  });

  return {
    snapshotDate: result.snapshotDate,
    generatedAt: result.generatedAt,
    hasData: result.hasData,
    overview: {
      activeRiskCount: result.overview.activeRiskCount,
      watchRiskCount: result.overview.watchRiskCount,
      openTaskCount: result.overview.openTaskCount,
      inProgressTaskCount: result.overview.inProgressTaskCount,
      insightCount: result.overview.insightCount,
    },
    riskItems,
    priorityTasks,
  };
}

async function loadCardView(params: {
  shop: string;
  // authenticate.admin 返回的 Admin GraphQL 客户端
  admin: Parameters<typeof fetchShopBasicInfo>[0];
  locale: OpsCopyLocale;
  force?: boolean;
}): Promise<HealthDiagnosisCardView> {
  const shopInfo = await fetchShopBasicInfo(params.admin).catch(() => null);
  const timeZone = shopInfo?.ianaTimezone?.trim() || undefined;
  const result = await ensureDailySnapshotOverview(params.shop, {
    shopifyAdmin: params.admin,
    force: params.force === true,
    ...(timeZone ? { timeZone } : {}),
  });
  return toCardView(result, params.locale);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const requestId = crypto.randomUUID();
  console.info(`${LOG_PREFIX} load start requestId=${requestId}`);

  try {
    const { admin, session } = await authenticate.admin(request);
    const uiLocale = await resolveUiLocale(request, { admin, logContext: "health-diagnosis" });
    const locale = toOpsCopyLocale(uiLocale);
    const view = await loadCardView({
      shop: session.shop,
      admin,
      locale,
      force: false,
    });
    console.info(
      `${LOG_PREFIX} load done requestId=${requestId} locale=${locale} hasData=${view.hasData} date=${view.snapshotDate}`,
    );
    return jsonResponse(
      {
        success: true,
        response: view,
        defaultBackfillDays: getOrderBackfillDays(),
      },
      200,
    );
  } catch (e) {
    console.error(`${LOG_PREFIX} load failed requestId=${requestId}`, e);
    return jsonResponse(
      {
        success: false,
        errorCode: 500,
        errorMsg: e instanceof Error ? e.message : String(e),
        response: null,
        defaultBackfillDays: getOrderBackfillDays(),
      },
      500,
    );
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const requestId = crypto.randomUUID();
  console.info(`${LOG_PREFIX} action start requestId=${requestId} method=${request.method}`);

  if (request.method !== "POST") {
    return jsonResponse(
      { success: false, errorCode: 405, errorMsg: "Method not allowed", response: null },
      405,
    );
  }

  let raw: unknown;
  try {
    raw = (await request.json()) as unknown;
  } catch {
    return jsonResponse(
      { success: false, errorCode: 400, errorMsg: "Invalid JSON body", response: null },
      400,
    );
  }

  const parsed = refreshBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(
      {
        success: false,
        errorCode: 400,
        errorMsg: parsed.error.issues[0]?.message ?? "Invalid parameters",
        response: null,
      },
      400,
    );
  }

  try {
    const { admin, session } = await authenticate.admin(request);
    const uiLocale = await resolveUiLocale(request, { admin, logContext: "health-diagnosis" });
    const locale = toOpsCopyLocale(uiLocale);
    const view = await loadCardView({
      shop: session.shop,
      admin,
      locale,
      force: true,
    });
    console.info(
      `${LOG_PREFIX} refresh done requestId=${requestId} locale=${locale} hasData=${view.hasData} date=${view.snapshotDate}`,
    );
    return jsonResponse(
      {
        success: true,
        response: view,
        defaultBackfillDays: getOrderBackfillDays(),
      },
      200,
    );
  } catch (e) {
    console.error(`${LOG_PREFIX} refresh failed requestId=${requestId}`, e);
    return jsonResponse(
      {
        success: false,
        errorCode: 500,
        errorMsg: e instanceof Error ? e.message : String(e),
        response: null,
        defaultBackfillDays: getOrderBackfillDays(),
      },
      500,
    );
  }
};
