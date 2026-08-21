import { trustedAssetImageUrl } from "@/lib/assets/url-safety";
import { noStoreJson } from "@/lib/http/no-store";

function boundedEnvironmentInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export async function GET(request: Request) {
  const rawUrl = new URL(request.url).searchParams.get("url");
  if (!rawUrl) return noStoreJson({ error: "INVALID_URL" }, { status: 400 });
  const target = trustedAssetImageUrl(rawUrl);
  if (!target) return noStoreJson({ error: "UNTRUSTED_HOST" }, { status: 400 });
  const maxBytes = boundedEnvironmentInteger(process.env.MODELSCOPE_IMAGE_MAX_BYTES, 10 * 1024 * 1024, 1024, 25 * 1024 * 1024);
  const timeoutMs = boundedEnvironmentInteger(process.env.MODELSCOPE_IMAGE_DOWNLOAD_TIMEOUT_MS, 15_000, 1_000, 60_000);
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetch(target, { method: "GET", redirect: "error", signal: abort.signal });
    if (!response.ok) {
      abort.abort();
      await response.body?.cancel().catch(() => undefined);
      clearTimeout(timeout);
      return noStoreJson({ error: "ASSET_UNAVAILABLE" }, { status: 502 });
    }
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    if (!contentType.toLowerCase().startsWith("image/")) {
      clearTimeout(timeout);
      await response.body?.cancel();
      return noStoreJson({ error: "NOT_IMAGE" }, { status: 415 });
    }
    const contentLength = response.headers.get("content-length");
    if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
      clearTimeout(timeout);
      await response.body?.cancel("ASSET_TOO_LARGE");
      return noStoreJson({ error: "ASSET_TOO_LARGE" }, { status: 413 });
    }
    if (!response.body) {
      clearTimeout(timeout);
      return noStoreJson({ error: "ASSET_UNAVAILABLE" }, { status: 502 });
    }
    const reader = response.body.getReader();
    let bytesRead = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) {
            clearTimeout(timeout);
            controller.close();
            return;
          }
          bytesRead += next.value.byteLength;
          if (bytesRead > maxBytes) {
            await reader.cancel("ASSET_TOO_LARGE");
            abort.abort();
            clearTimeout(timeout);
            controller.error(new Error("ASSET_TOO_LARGE"));
            return;
          }
          controller.enqueue(next.value);
        } catch (error) {
          clearTimeout(timeout);
          controller.error(error);
        }
      },
      async cancel(reason) {
        abort.abort();
        clearTimeout(timeout);
        await reader.cancel(reason);
      },
    });
    return new Response(stream, { status: 200, headers: { "Content-Type": contentType, "Cache-Control": "no-store" } });
  } catch {
    clearTimeout(timeout);
    return noStoreJson({ error: "ASSET_UNAVAILABLE" }, { status: 502 });
  }
}
