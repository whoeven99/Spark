/** Tool / 流式 SSE 间传递「健康诊断与待办」卡片标记；详情由 /api/health-diagnosis 拉取。 */

export const HEALTH_DIAGNOSIS_CARD_PAYLOAD_KIND = "health_diagnosis_card_v1" as const;

export type HealthDiagnosisFormPayload = {
  /** 打开时刻（ISO），仅作卡片实例标记，可缺省 */
  openedAt?: string;
};

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

export type HealthDiagnosisApiResponse =
  | { success: true; response: HealthDiagnosisCardView }
  | { success: false; errorCode: number; errorMsg: string; response: null };

export function defaultHealthDiagnosisFormPayload(): HealthDiagnosisFormPayload {
  return { openedAt: new Date().toISOString() };
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
  return openedAt ? { openedAt } : {};
}

export function isHealthDiagnosisFormToolPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const kind = (raw as Record<string, unknown>)._sparkKind;
  return kind === HEALTH_DIAGNOSIS_CARD_PAYLOAD_KIND;
}
