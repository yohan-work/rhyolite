import { logger } from './logger';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * 지수 백오프로 비동기 함수를 재시도.
 * 429(Rate Limit) 및 5xx 에러에 대해서만 재시도.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options?: RetryOptions,
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs } = { ...DEFAULT_OPTIONS, ...options };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const isLastAttempt = attempt === maxRetries;

      if (isLastAttempt || !isRetryableError(error)) {
        throw error;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      logger.warn(`[${label}] 재시도 ${attempt + 1}/${maxRetries} (${Math.round(jitter)}ms 대기)`);
      await sleep(jitter);
    }
  }

  throw new Error(`[${label}] 최대 재시도 횟수 초과`);
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('429') || msg.includes('rate limit')) return true;
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
    if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('enotfound')) return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
