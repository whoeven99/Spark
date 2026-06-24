/**
 * TSF 额度（token×系数）客户端 + 动态并发上限计算。
 *
 * 模型：**事后实扣 + 按剩余额度动态调并发**（无预估）。
 *   - 每批 LLM 返回后按真实 token×系数 扣减（deductTsfQuota），拿到剩余额度。
 *   - 用剩余额度算出该 shop 允许的并发上限（quotaConcurrencyCap），喂给按 shop 的并发闸。
 *   - 剩余为负 → worker 暂停任务（已在飞的调用继续翻译并扣除，可接受）。
 * 这样额度越少并发越低，最大透支被锁在「在飞批次 × 每批 token」内。
 *
 * 启用规则：**TsFrontend / TsFrontend-Auto 来源默认开启**，QUOTA_ENFORCE=false 可显式关闭；其它来源始终关闭。
 * 未配置 TSF_SERVER_URL 时降级为「额度无限」（no-op），不影响现网。
 */

export type QuotaDeductResult = {
  /** 接口调用是否成功（与额度是否充足无关）。 */
  ok: boolean;
  /** 扣减后的剩余额度（可能为负，负数即额度耗尽）。 */
  remaining: number;
};

import {
  TSF_AUTO_TASK_SOURCE,
  TS_FRONTEND_TASK_SOURCE,
} from "./cosmosV4.js";

/** TSF 手动 + 自动翻译任务来源（均扣 TSF 额度池）。 */
const TSF_QUOTA_TASK_SOURCES = new Set([
  TS_FRONTEND_TASK_SOURCE,
  TSF_AUTO_TASK_SOURCE,
]);

/**
 * 是否对该来源的任务启用额度控制。
 * 规则：**TsFrontend / TsFrontend-Auto 默认开启**；`QUOTA_ENFORCE=false` 可显式关闭；
 * 其它来源始终关闭（本控制器是 TSF 专属，扣的是 TSF 额度池）。
 */
export function quotaEnforceEnabled(taskSource?: string | null): boolean {
  if (!taskSource || !TSF_QUOTA_TASK_SOURCES.has(taskSource)) return false;
  return process.env.QUOTA_ENFORCE?.trim().toLowerCase() !== "false";
}

/** 翻译系数：实际消耗 token × 此系数 = 扣减的额度量。默认 1（与 API 返回 token 1:1）。 */
export function quotaTokenMultiplier(): number {
  const v = Number(process.env.QUOTA_TOKEN_MULTIPLIER);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/**
 * 由剩余额度算出允许的并发上限：
 *   remaining ≥ ceiling×perCall → 满并发（ceiling）
 *   perCall ≤ remaining < …     → floor(remaining / perCall)（平滑降速）
 *   remaining < perCall         → 1（硬停由 worker 的 abort 负责）
 */
export function quotaConcurrencyCap(remaining: number): number {
  const perCall = Math.max(1, Number(process.env.QUOTA_PER_CALL_COST) || 15000);
  const ceiling = Math.max(1, Number(process.env.QUOTA_MAX_CONCURRENCY) || 128);
  if (remaining >= ceiling * perCall) return ceiling;
  if (remaining >= perCall) return Math.max(1, Math.floor(remaining / perCall));
  return 1;
}

/** TSF 额度服务 BaseResponse<TokenQuotaVO>。 */
type TokenQuotaVO = {
  shopName: string;
  maxToken: number;
  usedToken: number;
  remaining: number;
};
type QuotaBaseResponse = {
  success: boolean;
  errorCode: number;
  errorMsg: string;
  response: TokenQuotaVO | null;
};

/** 额度服务 base（去掉尾部斜杠；缺协议时补 https://）。 */
function quotaBase(): string | null {
  let base = process.env.TSF_SERVER_URL?.trim();
  if (!base) return null;
  base = base.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) {
    base = `https://${base}`;
  }
  return base;
}

/**
 * 读取剩余额度（worker 进入 TRANSLATE 时 seed 初始并发用）。
 * GET {base}/quota/query?shopName=
 * 查询失败 → 保守返回 1（从并发 1 起步，由首次扣减纠正），不直接掐断任务。
 */
export async function getTsfRemaining(shop: string): Promise<number> {
  return getTsfRemainingWithRetry(shop, 1);
}

/** 带重试的额度查询；续跑时避免一次抖动就把并发 seed 到 1。 */
export async function getTsfRemainingWithRetry(
  shop: string,
  attempts = 3,
): Promise<number> {
  // 调用方（worker）已按来源决定是否启用；此处仅在未配置后端时降级为「无限」。
  const base = quotaBase();
  if (!base) return Number.MAX_SAFE_INTEGER;

  const maxAttempts = Math.max(1, attempts);
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const url = `${base}/quota/query?shopName=${encodeURIComponent(shop)}`;
      const resp = await fetch(url, { method: "GET" });
      const data = (await resp.json()) as QuotaBaseResponse;
      if (!data?.success || !data.response) {
        console.warn(
          `[tsfQuota] query not ok shop=${shop}: ${data?.errorMsg ?? resp.status} (attempt ${i + 1}/${maxAttempts})`,
        );
      } else {
        return data.response.remaining;
      }
    } catch (err) {
      console.error(`[tsfQuota] query error shop=${shop} (attempt ${i + 1}/${maxAttempts}):`, err);
    }
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 200 * (i + 1)));
    }
  }
  return 1;
}

/**
 * 续跑时 seed 并发上限：优先实时查询，失败则回退 Redis 里上次扣减后的 remaining。
 */
export function resolveQuotaSeedCap(
  remaining: number,
  fallbackRemaining?: number,
): { remaining: number; cap: number; usedFallback: boolean } {
  let effective = remaining;
  let usedFallback = false;
  if (effective <= 1 && fallbackRemaining != null && fallbackRemaining > 1) {
    effective = fallbackRemaining;
    usedFallback = true;
  }
  return { remaining: effective, cap: quotaConcurrencyCap(effective), usedFallback };
}

/**
 * 扣减 `amount` 额度，返回剩余（可能为负）。
 * POST {base}/quota/deduct?shopName=&tokens=  （tokens 必须 >0，无 body）
 * Java 语义：始终扣除并返回 remaining；余额不足时 remaining 为负、success 仍为 true。
 * 接口异常/参数错误 → ok:false（worker 据此暂停，避免无账本超用）。
 */
export async function deductTsfQuota(
  shop: string,
  amount: number,
): Promise<QuotaDeductResult> {
  // 调用方（worker）已按来源决定是否启用；此处仅在未配置后端时降级为 no-op。
  const base = quotaBase();
  if (!base) {
    return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  }

  const tokens = Math.max(1, Math.ceil(amount)); // 接口要求 tokens > 0
  try {
    const url = `${base}/quota/deduct?shopName=${encodeURIComponent(shop)}&tokens=${tokens}`;
    const resp = await fetch(url, { method: "POST" });
    const data = (await resp.json()) as QuotaBaseResponse;
    if (!data?.success || !data.response) {
      console.warn(`[tsfQuota] deduct not ok shop=${shop}: ${data?.errorMsg ?? resp.status}`);
      return { ok: false, remaining: 0 };
    }
    return { ok: true, remaining: data.response.remaining };
  } catch (err) {
    console.error(`[tsfQuota] deduct error shop=${shop}:`, err);
    return { ok: false, remaining: 0 };
  }
}
