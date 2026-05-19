import { RunCollectorCallbackHandler } from "@langchain/core/tracers/run_collector";

export function createRunCollector(): RunCollectorCallbackHandler {
  return new RunCollectorCallbackHandler();
}

/** 从 RunCollector 取 root run id，供 Cosmos 与 LangSmith URL 互链。 */
export function getRootLangsmithRunId(
  collector: RunCollectorCallbackHandler,
): string | undefined {
  const runs = collector.tracedRuns;
  if (!runs?.length) return undefined;
  const root = runs.find((r) => !r.parent_run_id) ?? runs[0];
  return root?.id;
}
