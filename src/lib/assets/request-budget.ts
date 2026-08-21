export const DEFAULT_IMAGE_MAX_PER_MINUTE = 6;
export const DEFAULT_IMAGE_MAX_CONCURRENT = 1;

export class ImageGenerationRequestBudget {
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

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export function imageGenerationBudgetLimits(environment: Record<string, string | undefined> = process.env) {
  return {
    maxPerMinute: boundedInteger(environment.MODELSCOPE_IMAGE_MAX_PER_MINUTE, DEFAULT_IMAGE_MAX_PER_MINUTE, 1, 60),
    maxConcurrent: boundedInteger(environment.MODELSCOPE_IMAGE_MAX_CONCURRENT, DEFAULT_IMAGE_MAX_CONCURRENT, 1, 4),
  };
}

const budgetGlobal = globalThis as typeof globalThis & { __storyForgeImageGenerationRequestBudget?: ImageGenerationRequestBudget };
export const imageGenerationRequestBudget = budgetGlobal.__storyForgeImageGenerationRequestBudget ??= new ImageGenerationRequestBudget();
