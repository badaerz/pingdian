const DEFAULT_PROVIDER_HOSTS = ["modelscope.cn", "aliyuncs.com"];

function providerHosts(environment: Record<string, string | undefined>) {
  const configured = (environment.MODELSCOPE_IMAGE_HOSTS ?? DEFAULT_PROVIDER_HOSTS.join(","))
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^[a-z0-9.-]+$/.test(item) && !item.startsWith(".") && !item.endsWith("."));
  return configured.length > 0 ? configured.slice(0, 20) : DEFAULT_PROVIDER_HOSTS;
}

export function trustedAssetImageUrl(value: unknown, environment: Record<string, string | undefined> = process.env) {
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const hostname = url.hostname.toLowerCase();
  const allowed = providerHosts(environment).some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  return allowed ? url : null;
}
