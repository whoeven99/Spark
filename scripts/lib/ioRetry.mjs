const TRANSIENT_RE =
  /error reading resp|econnreset|etimedout|esockettimedout|socket disconnected|timeout|429|502|503|504|eai_again|enotfound|network|fetch failed|resterror/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function isTransientIoError(err) {
  const msg = String(err?.message ?? err?.code ?? err ?? "");
  return TRANSIENT_RE.test(msg);
}

/**
 * 对易抖动的 IO 操作做有限次重试。
 * @param {() => Promise<T>} fn
 * @param {{ retries?: number, baseDelayMs?: number, label?: string }} opts
 */
export async function withIoRetry(fn, opts = {}) {
  const retries = opts.retries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 800;
  const label = opts.label ?? "IO";

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const transient = isTransientIoError(err);
      if (!transient || attempt >= retries) throw err;
      const delay = baseDelayMs * 2 ** attempt;
      console.warn(
        `  [重试 ${attempt + 1}/${retries}] ${label}: ${String(err?.message ?? err).slice(0, 120)}`,
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}
