export const DEFAULT_EMBEDDING_MAX_PER_MINUTE = 30;
export const DEFAULT_EMBEDDING_MAX_CONCURRENT = 2;

export class EmbeddingRequestBudget {
  private windowStartedAt = 0;
  private requestsInWindow = 0;
  private activeRequests = 0;

  acquire(maxPerMinute: number, maxConcurrent: number, now = Date.now()) {
    if (!this.windowStartedAt || now < this.windowStartedAt || now - this.windowStartedAt >= 60_000) {
      this.windowStartedAt = now;
      this.requestsInWindow = 0;
    }
    if (this.requestsInWindow >= maxPerMinute || this.activeRequests >= maxConcurrent) return null;
    this.requestsInWindow += 1;
    this.activeRequests += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeRequests = Math.max(0, this.activeRequests - 1);
    };
  }
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function embeddingBudgetLimits(environment: Record<string, string | undefined> = process.env) {
  return {
    maxPerMinute: positiveInteger(environment.EMBEDDING_PUBLIC_SEARCH_MAX_PER_MINUTE, DEFAULT_EMBEDDING_MAX_PER_MINUTE),
    maxConcurrent: positiveInteger(environment.EMBEDDING_PUBLIC_SEARCH_MAX_CONCURRENT, DEFAULT_EMBEDDING_MAX_CONCURRENT),
  };
}

const budgetGlobal = globalThis as typeof globalThis & { __storyForgeEmbeddingRequestBudget?: EmbeddingRequestBudget };
export const embeddingRequestBudget = budgetGlobal.__storyForgeEmbeddingRequestBudget ??= new EmbeddingRequestBudget();
