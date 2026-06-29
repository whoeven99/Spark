import { isAutoTranslationJob, type TranslationV4Job } from "./cosmosV4.js";

/** 自动翻译 vs 手动翻译的 stage 并发池（init / translate / writeback 各自独立计数）。 */
export type StagePoolKind = "auto" | "manual";

export type StagePoolStage = "init" | "translate" | "writeback";

export function stagePoolKindForJob(
  job: Pick<TranslationV4Job, "taskSource">,
): StagePoolKind {
  return isAutoTranslationJob(job) ? "auto" : "manual";
}

function readMax(stage: StagePoolStage, kind: StagePoolKind): number {
  const stageUpper = stage.toUpperCase();
  const specific =
    kind === "auto"
      ? process.env[`MAX_CONCURRENT_AUTO_${stageUpper}_JOBS`]
      : process.env[`MAX_CONCURRENT_MANUAL_${stageUpper}_JOBS`];
  const legacy =
    stage === "init"
      ? process.env.MAX_CONCURRENT_INIT_JOBS
      : stage === "translate"
        ? process.env.MAX_CONCURRENT_TRANSLATE_JOBS
        : process.env.MAX_CONCURRENT_WRITEBACK_JOBS;
  return Math.max(1, Number(specific) || Number(legacy) || 5);
}

/**
 * 进程内 stage 槽位：自动与手动各占独立额度，互不抢占。
 * 默认各 5（可用 MAX_CONCURRENT_AUTO_* / MAX_CONCURRENT_MANUAL_* 覆盖；
 * 未设时回退 MAX_CONCURRENT_*_JOBS）。
 */
class StageSlotRegistry {
  private readonly active: Record<
    StagePoolStage,
    Record<StagePoolKind, number>
  > = {
    init: { auto: 0, manual: 0 },
    translate: { auto: 0, manual: 0 },
    writeback: { auto: 0, manual: 0 },
  };

  max(stage: StagePoolStage, kind: StagePoolKind): number {
    return readMax(stage, kind);
  }

  hasCapacity(stage: StagePoolStage, kind: StagePoolKind): boolean {
    return this.active[stage][kind] < this.max(stage, kind);
  }

  anyCapacity(stage: StagePoolStage): boolean {
    return (
      this.hasCapacity(stage, "auto") || this.hasCapacity(stage, "manual")
    );
  }

  /** TOCTOU 防护：claim 成功后立即占槽；满则返回 false。 */
  tryAcquire(stage: StagePoolStage, kind: StagePoolKind): boolean {
    if (!this.hasCapacity(stage, kind)) return false;
    this.active[stage][kind]++;
    return true;
  }

  release(stage: StagePoolStage, kind: StagePoolKind): void {
    this.active[stage][kind] = Math.max(0, this.active[stage][kind] - 1);
  }

  formatActive(stage: StagePoolStage): string {
    const counts = this.active[stage];
    return (
      `auto=${counts.auto}/${this.max(stage, "auto")} ` +
      `manual=${counts.manual}/${this.max(stage, "manual")}`
    );
  }
}

export const stageSlots = new StageSlotRegistry();
