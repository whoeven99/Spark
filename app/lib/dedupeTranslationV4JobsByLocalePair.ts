import type { TranslationV4Job } from "../server/translation/v4/types";

/** Normalized key for source → target locale pair grouping. */
export function localePairKey(source: string, target: string): string {
  return `${source.trim().toLowerCase()}\0${target.trim().toLowerCase()}`;
}

/** Descending recency: updatedAt, then createdAt, then id. */
function compareJobsByRecency(a: TranslationV4Job, b: TranslationV4Job): number {
  const updatedCmp = (b.updatedAt ?? "").trim().localeCompare((a.updatedAt ?? "").trim());
  if (updatedCmp !== 0) return updatedCmp;

  const createdCmp = (b.createdAt ?? "").trim().localeCompare((a.createdAt ?? "").trim());
  if (createdCmp !== 0) return createdCmp;

  return b.id.localeCompare(a.id);
}

function isNewerThan(candidate: TranslationV4Job, current: TranslationV4Job): boolean {
  return compareJobsByRecency(current, candidate) > 0;
}

/**
 * One job per source→target pair (newest by updatedAt → createdAt → id).
 * Output order follows each pair's first index in the input array.
 */
export function dedupeTranslationV4JobsByLocalePair(
  jobs: TranslationV4Job[],
): TranslationV4Job[] {
  const bestByKey = new Map<string, TranslationV4Job>();
  const firstIndexByKey = new Map<string, number>();

  for (let index = 0; index < jobs.length; index++) {
    const job = jobs[index]!;
    const key = localePairKey(job.source, job.target);
    if (!firstIndexByKey.has(key)) firstIndexByKey.set(key, index);

    const current = bestByKey.get(key);
    if (!current || isNewerThan(job, current)) {
      bestByKey.set(key, job);
    }
  }

  return [...bestByKey.entries()]
    .sort(
      ([keyA], [keyB]) =>
        (firstIndexByKey.get(keyA) ?? 0) - (firstIndexByKey.get(keyB) ?? 0),
    )
    .map(([, job]) => job);
}
