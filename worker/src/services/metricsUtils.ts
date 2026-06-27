/** 与 TSF app/server/translateV4/metricsUtils.ts 保持同一算法。 */
export type TranslateProgressMetrics = {
  translateDone: number;
  translateTotal: number;
  translateUnitDone: number;
  translateUnitTotal: number;
};

export function capTranslateUnitsByResources(
  metrics: TranslateProgressMetrics,
): number {
  const unitTotal = metrics.translateUnitTotal ?? 0;
  const unitDone = metrics.translateUnitDone ?? 0;
  if (unitTotal <= 0) return unitDone;

  const resourceTotal = metrics.translateTotal ?? 0;
  const resourceDone = metrics.translateDone ?? 0;

  if (resourceTotal <= 0 || resourceDone >= resourceTotal) {
    return Math.min(unitDone, unitTotal);
  }

  const maxByResources = Math.ceil((resourceDone / resourceTotal) * unitTotal);
  return Math.min(unitDone, unitTotal, maxByResources);
}

export function syncTranslateUnitDone(
  metrics: TranslateProgressMetrics,
): number {
  return capTranslateUnitsByResources(metrics);
}
