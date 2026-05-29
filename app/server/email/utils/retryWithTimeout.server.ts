export type RetryWithTimeoutOptions = {
  timeoutMs: number;
  maxRetries: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number) => void;
};

const DEFAULT_SHOULD_RETRY = (): boolean => true;

function isHttp400Error(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error);
  return message.includes('"status":400') || message.includes("status\":400");
}

/**
 * 对齐 Spring TimeOutUtils：带超时与重试；HTTP 400 不重试。
 */
export async function retryWithTimeout<T>(
  task: () => Promise<T>,
  options: RetryWithTimeoutOptions,
): Promise<T> {
  const {
    timeoutMs,
    maxRetries,
    shouldRetry = DEFAULT_SHOULD_RETRY,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await Promise.race([
        task(),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Operation timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
    } catch (error) {
      lastError = error;
      if (isHttp400Error(error)) {
        throw error;
      }
      if (attempt >= maxRetries || !shouldRetry(error, attempt)) {
        throw error;
      }
      onRetry?.(error, attempt);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("retryWithTimeout failed without error");
}
