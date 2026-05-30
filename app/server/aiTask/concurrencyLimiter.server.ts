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

let imageGenLimiter: Semaphore | null = null;
let picTranslateLimiter: Semaphore | null = null;

export function getImageGenLimiter(): Semaphore {
  if (!imageGenLimiter) {
    const slots = parseInt(process.env.IMAGE_GEN_CONCURRENCY ?? "3", 10);
    imageGenLimiter = new Semaphore(slots);
  }
  return imageGenLimiter;
}

export function getPicTranslateLimiter(): Semaphore {
  if (!picTranslateLimiter) {
    const slots = parseInt(process.env.PIC_TRANSLATE_CONCURRENCY ?? "3", 10);
    picTranslateLimiter = new Semaphore(slots);
  }
  return picTranslateLimiter;
}
