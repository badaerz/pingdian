import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("Next.js security configuration", () => {
  it("builds a standalone server without the framework header", () => {
    expect(nextConfig.output).toBe("standalone");
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("sets the shared browser security headers for every route", async () => {
    const rules = await nextConfig.headers?.();

    expect(rules).toEqual([{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    }]);
  });
});
