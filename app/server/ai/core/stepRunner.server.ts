import type { AgentContext } from "./toolRegistry.server";
import {
  normalizeSteps,
  type StepInput,
  type StepSpec,
} from "./skillTypes.server";
import type { PlaybookStepResult } from "./playbookRegistry.server";

/**
 * StepRunner —— 消灭 Skill/Playbook 里手写 onStep 的样板。
 *
 * 用法：
 * ```ts
 * const runner = createStepRunner(ctx, "shopHealthCheck", STEPS);
 * const data = await runner.run("fetchData", async (emit) => {
 *   emit("正在拉取订单与库存");        // 可选：进行态细节
 *   return loadData();
 * });
 * // 自动 emit running→completed；抛错时自动 emit error 并记录
 * return { ok: true, summary, steps: runner.results };
 * ```
 */
export interface StepRunner {
  /** 已执行步骤的结构化结果（用于 PlaybookRunResult.steps） */
  readonly results: PlaybookStepResult[];
  /**
   * 执行一个步骤：进入时 emit running，成功 emit completed，异常 emit error 后抛出。
   * 回调可调用传入的 `emitDetail` 上报进行态细节（如「调用 deepseek-chat」）。
   */
  run<T>(
    stepId: string,
    fn: (emitDetail: (detail: string) => void) => Promise<T>,
    options?: { successOutput?: (result: T) => string },
  ): Promise<T>;
  /** 跳过一个步骤（如缺少入参），emit skipped 并记录原因 */
  skip(stepId: string, reason: string): void;
}

export function createStepRunner(
  ctx: AgentContext,
  skillName: string,
  steps: readonly StepInput[],
): StepRunner {
  const specs = normalizeSteps(steps);
  const byId = new Map<string, StepSpec>(specs.map((s) => [s.id, s]));
  const results: PlaybookStepResult[] = [];

  const resolve = (stepId: string): StepSpec =>
    byId.get(stepId) ?? { id: stepId, label: stepId, kind: "compute" };

  return {
    results,
    async run(stepId, fn, options) {
      const spec = resolve(stepId);
      ctx.emitProgress?.({
        skill: skillName,
        stepId: spec.id,
        label: spec.runningLabel ?? spec.label,
        status: "running",
      });
      try {
        const result = await fn((detail) =>
          ctx.emitProgress?.({
            skill: skillName,
            stepId: spec.id,
            label: spec.runningLabel ?? spec.label,
            status: "running",
            detail,
          }),
        );
        ctx.emitProgress?.({
          skill: skillName,
          stepId: spec.id,
          label: spec.label,
          status: "completed",
        });
        results.push({
          step: spec.label,
          status: "completed",
          output: options?.successOutput?.(result) ?? "",
        });
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        ctx.emitProgress?.({
          skill: skillName,
          stepId: spec.id,
          label: spec.label,
          status: "error",
          detail: msg,
        });
        results.push({ step: spec.label, status: "error", output: msg });
        throw e;
      }
    },
    skip(stepId, reason) {
      const spec = resolve(stepId);
      ctx.emitProgress?.({
        skill: skillName,
        stepId: spec.id,
        label: spec.label,
        status: "skipped",
        detail: reason,
      });
      results.push({ step: spec.label, status: "skipped", output: reason });
    },
  };
}
