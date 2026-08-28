export class Semaphore {
  private available: number;
  private readonly queue: Array<() => void> = [];

  constructor(slots: number) {
    this.available = Math.max(1, slots);
  }

  acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.available++;
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  get waitingCount(): number {
    return this.queue.length;
  }

  get availableSlots(): number {
    return this.available;
  }
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

let imageGenLimiter: Semaphore | null = null;
let picTranslateLimiter: Semaphore | null = null;
const shopAiTaskLimiters = new Map<string, Semaphore>();

export function getImageGenLimiter(): Semaphore {
  if (!imageGenLimiter) {
    imageGenLimiter = new Semaphore(readPositiveIntEnv("IMAGE_GEN_CONCURRENCY", 3));
  }
  return imageGenLimiter;
}

export function getPicTranslateLimiter(): Semaphore {
  if (!picTranslateLimiter) {
    picTranslateLimiter = new Semaphore(readPositiveIntEnv("PIC_TRANSLATE_CONCURRENCY", 3));
  }
  return picTranslateLimiter;
}

/**
 * 按店铺限制 AI 异步任务并发；超额请求在店内排队。
 * 默认每店 2 路，可用 SHOP_AI_TASK_CONCURRENCY 覆盖。
 */
export function getShopAiTaskLimiter(shop: string): Semaphore {
  const key = shop.trim().toLowerCase() || "unknown-shop";
  let limiter = shopAiTaskLimiters.get(key);
  if (!limiter) {
    limiter = new Semaphore(readPositiveIntEnv("SHOP_AI_TASK_CONCURRENCY", 2));
    shopAiTaskLimiters.set(key, limiter);
  }
  return limiter;
}

/** 测试用：清空店铺限流器缓存 */
export function resetShopAiTaskLimitersForTests(): void {
  shopAiTaskLimiters.clear();
}
