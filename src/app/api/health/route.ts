import { noStoreJson } from "@/lib/http/no-store";

export function GET() {
  return noStoreJson({
    status: "ok",
    service: "story-forge",
    version: process.env.APP_VERSION || process.env.npm_package_version || "unknown",
  });
}
