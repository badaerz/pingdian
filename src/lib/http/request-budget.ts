const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export type RequestBudgetLimits = {
  perClientPerMinute: number;
  daily: number;
};

export type RequestBudgetResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export type RequestBudget = {
  consume(headers: Headers): RequestBudgetResult;
};

type Environment = Record<string, string | undefined>;

function boundedPositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
) {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

export function requestBudgetLimitsFromEnvironment(
  environment: Environment = process.env,
): RequestBudgetLimits {
  return {
    perClientPerMinute: boundedPositiveInteger(
      environment.AI_MAX_REQUESTS_PER_MINUTE,
      10,
      1_000,
    ),
    daily: boundedPositiveInteger(environment.AI_MAX_DAILY_REQUESTS, 200, 100_000),
  };
}

export function clientIdFromHeaders(headers: Headers) {
  const directAddress = headers.get("x-real-ip")?.trim();
  if (directAddress) return directAddress;

  const forwardedAddress = headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwardedAddress || "unknown";
}

export function createRequestBudget(options: {
  limits?: RequestBudgetLimits;
  now?: () => number;
} = {}): RequestBudget {
  const limits = options.limits ?? requestBudgetLimitsFromEnvironment();
  const now = options.now ?? Date.now;
  const clientCounts = new Map<string, number>();
  let minuteBucket = -1;
  let dayBucket = -1;
  let dailyCount = 0;

  return {
    consume(headers) {
      const timestamp = now();
      const currentMinute = Math.floor(timestamp / MINUTE_MS);
      const currentDay = Math.floor(timestamp / DAY_MS);

      if (currentMinute !== minuteBucket) {
        minuteBucket = currentMinute;
        clientCounts.clear();
      }
      if (currentDay !== dayBucket) {
        dayBucket = currentDay;
        dailyCount = 0;
      }

      if (dailyCount >= limits.daily) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil(((currentDay + 1) * DAY_MS - timestamp) / 1_000)),
        };
      }

      const clientId = clientIdFromHeaders(headers);
      const clientCount = clientCounts.get(clientId) ?? 0;
      if (clientCount >= limits.perClientPerMinute) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil(((currentMinute + 1) * MINUTE_MS - timestamp) / 1_000)),
        };
      }

      clientCounts.set(clientId, clientCount + 1);
      dailyCount += 1;
      return { allowed: true };
    },
  };
}

export const aiRequestBudget = createRequestBudget();
