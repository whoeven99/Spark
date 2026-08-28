/** Tool / 流式 SSE 间传递「健康诊断与待办」卡片；live 卡拉 API，result 卡带快照视图。 */

export const HEALTH_DIAGNOSIS_CARD_PAYLOAD_KIND = "health_diagnosis_card_v1" as const;

export type HealthDiagnosisCardMode = "live" | "result";

export type HealthDiagnosisCardOverview = {
  activeRiskCount: number;
  watchRiskCount: number;
  openTaskCount: number;
  inProgressTaskCount: number;
  insightCount: number;
};

export type HealthDiagnosisCardItem = {
  name: string;
  status: "risk" | "watch" | "healthy";
  summary: string;
};

export type HealthDiagnosisCardTask = {
  id: string;
  title: string;
  priority: string;
  status: string;
  triggerReason: string;
  quadrant: string;
};

/** 聊天卡展示用的精简视图（不含 detail 明细对象）。 */
export type HealthDiagnosisCardView = {
  snapshotDate: string;
  generatedAt: string;
  hasData: boolean;
  overview: HealthDiagnosisCardOverview;
  riskItems: HealthDiagnosisCardItem[];
  priorityTasks: HealthDiagnosisCardTask[];
};

export type HealthDiagnosisFormPayload = {
  /** 打开时刻（ISO），仅作卡片实例标记，可缺省 */
  openedAt?: string;
  /** live=可刷新拉取；result=刷新后追加的结果卡（带 view 快照） */
  mode?: HealthDiagnosisCardMode;
  /** 结果卡快照；live 卡一般为空，由 API 填充 */
  view?: HealthDiagnosisCardView;
};

export type HealthDiagnosisApiResponse =
  | { success: true; response: HealthDiagnosisCardView }
  | { success: false; errorCode: number; errorMsg: string; response: null };

export function defaultHealthDiagnosisFormPayload(): HealthDiagnosisFormPayload {
  return { openedAt: new Date().toISOString(), mode: "live" };
}

export function healthDiagnosisResultPayload(
  view: HealthDiagnosisCardView,
): HealthDiagnosisFormPayload {
  return {
    openedAt: new Date().toISOString(),
    mode: "result",
    view,
  };
}

function coerceStatus(raw: unknown): HealthDiagnosisCardItem["status"] | null {
  if (raw === "risk" || raw === "watch" || raw === "healthy") return raw;
  return null;
}

function coerceOverview(raw: unknown): HealthDiagnosisCardOverview | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const rec = raw as Record<string, unknown>;
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  };
  return {
    activeRiskCount: num(rec.activeRiskCount),
    watchRiskCount: num(rec.watchRiskCount),
    openTaskCount: num(rec.openTaskCount),
    inProgressTaskCount: num(rec.inProgressTaskCount),
    insightCount: num(rec.insightCount),
  };
}

export function coerceHealthDiagnosisCardView(raw: unknown): HealthDiagnosisCardView | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const rec = raw as Record<string, unknown>;
  const overview = coerceOverview(rec.overview);
  if (!overview) return undefined;
  const snapshotDate =
    typeof rec.snapshotDate === "string" && rec.snapshotDate.trim()
      ? rec.snapshotDate.trim()
      : "";
  const generatedAt =
    typeof rec.generatedAt === "string" && rec.generatedAt.trim()
      ? rec.generatedAt.trim()
      : new Date().toISOString();
  if (!snapshotDate) return undefined;

  const riskItems = Array.isArray(rec.riskItems)
    ? rec.riskItems
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const row = item as Record<string, unknown>;
          const status = coerceStatus(row.status);
          const name = typeof row.name === "string" ? row.name.trim() : "";
          if (!status || !name) return null;
          return {
            name,
            status,
            summary: typeof row.summary === "string" ? row.summary : "",
          };
        })
        .filter((item): item is HealthDiagnosisCardItem => Boolean(item))
    : [];

  const priorityTasks = Array.isArray(rec.priorityTasks)
    ? rec.priorityTasks
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const row = item as Record<string, unknown>;
          const id = typeof row.id === "string" ? row.id.trim() : "";
          const title = typeof row.title === "string" ? row.title.trim() : "";
          if (!id || !title) return null;
          return {
            id,
            title,
            priority: typeof row.priority === "string" ? row.priority : "",
            status: typeof row.status === "string" ? row.status : "",
            triggerReason: typeof row.triggerReason === "string" ? row.triggerReason : "",
            quadrant: typeof row.quadrant === "string" ? row.quadrant : "",
          };
        })
        .filter((item): item is HealthDiagnosisCardTask => Boolean(item))
    : [];

  return {
    snapshotDate,
    generatedAt,
    hasData: rec.hasData === true,
    overview,
    riskItems,
    priorityTasks,
  };
}

export function coerceHealthDiagnosisFormPayload(raw: unknown): HealthDiagnosisFormPayload {
  const rec =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const openedAt =
    typeof rec.openedAt === "string" && rec.openedAt.trim()
      ? rec.openedAt.trim()
      : undefined;
  const mode: HealthDiagnosisCardMode | undefined =
    rec.mode === "result" || rec.mode === "live" ? rec.mode : undefined;
  const view = coerceHealthDiagnosisCardView(rec.view);
  return {
    ...(openedAt ? { openedAt } : {}),
    ...(mode ? { mode } : {}),
    ...(view ? { view } : {}),
  };
}

export function isHealthDiagnosisFormToolPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const kind = (raw as Record<string, unknown>)._sparkKind;
  return kind === HEALTH_DIAGNOSIS_CARD_PAYLOAD_KIND;
}
