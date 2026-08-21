import { getAssetCapabilities } from "@/lib/assets/generation";
import { noStoreJson } from "@/lib/http/no-store";

export async function GET() {
  return noStoreJson(getAssetCapabilities());
}
