import { describe, expect, it } from "vitest";
import {
  clientIdFromHeaders,
  createRequestBudget,
  requestBudgetLimitsFromEnvironment,
} from "@/lib/http/request-budget";

function headersFor(clientId: string) {
  return new Headers({ "x-real-ip": clientId });
}

describe("request budget", () => {
  it("limits one client within a minute and returns the remaining wait", () => {
    let now = 30_250;
    const budget = createRequestBudget({
      limits: { perClientPerMinute: 2, daily: 20 },
      now: () => now,
    });

    expect(budget.consume(headersFor("203.0.113.10"))).toEqual({ allowed: true });
    expect(budget.consume(headersFor("203.0.113.10"))).toEqual({ allowed: true });
    expect(budget.consume(headersFor("203.0.113.10"))).toEqual({
      allowed: false,
      retryAfterSeconds: 30,
    });

    now = 60_000;
    expect(budget.consume(headersFor("203.0.113.10"))).toEqual({ allowed: true });
  });

  it("tracks different clients independently", () => {
    const budget = createRequestBudget({
      limits: { perClientPerMinute: 1, daily: 20 },
      now: () => 10_000,
    });

    expect(budget.consume(headersFor("203.0.113.11"))).toEqual({ allowed: true });
    expect(budget.consume(headersFor("203.0.113.11"))).toMatchObject({ allowed: false });
    expect(budget.consume(headersFor("203.0.113.12"))).toEqual({ allowed: true });
  });

  it("enforces the site-wide daily limit and resets on the next UTC date", () => {
    let now = 86_399_500;
    const budget = createRequestBudget({
      limits: { perClientPerMinute: 10, daily: 2 },
      now: () => now,
    });

    expect(budget.consume(headersFor("203.0.113.13"))).toEqual({ allowed: true });
    expect(budget.consume(headersFor("203.0.113.14"))).toEqual({ allowed: true });
    expect(budget.consume(headersFor("203.0.113.15"))).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });

    now = 86_400_000;
    expect(budget.consume(headersFor("203.0.113.15"))).toEqual({ allowed: true });
  });

  it("prefers the direct proxy address and otherwise uses the first forwarded address", () => {
    expect(clientIdFromHeaders(new Headers({
      "x-real-ip": " 203.0.113.20 ",
      "x-forwarded-for": "198.51.100.1, 198.51.100.2",
    }))).toBe("203.0.113.20");
    expect(clientIdFromHeaders(new Headers({
      "x-forwarded-for": " 198.51.100.1, 198.51.100.2",
    }))).toBe("198.51.100.1");
    expect(clientIdFromHeaders(new Headers())).toBe("unknown");
  });

  it("reads bounded positive limits and falls back for unsafe values", () => {
    expect(requestBudgetLimitsFromEnvironment({
      AI_MAX_REQUESTS_PER_MINUTE: "25",
      AI_MAX_DAILY_REQUESTS: "500",
    })).toEqual({ perClientPerMinute: 25, daily: 500 });

    expect(requestBudgetLimitsFromEnvironment({
      AI_MAX_REQUESTS_PER_MINUTE: "0",
      AI_MAX_DAILY_REQUESTS: "100001",
    })).toEqual({ perClientPerMinute: 10, daily: 200 });

    expect(requestBudgetLimitsFromEnvironment({
      AI_MAX_REQUESTS_PER_MINUTE: "1.5",
      AI_MAX_DAILY_REQUESTS: "not-a-number",
    })).toEqual({ perClientPerMinute: 10, daily: 200 });
  });
});
