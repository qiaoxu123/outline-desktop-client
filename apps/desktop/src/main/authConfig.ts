/** Read public login configuration using the desktop network stack. */
export async function loadDesktopAuthConfig(
  host: string,
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
): Promise<Record<string, unknown>> {
  const url = new URL(host);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Invalid Outline host");
  }
  const response = await fetcher(`${url.origin}/api/auth.config`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    throw new Error(`Unable to load auth config (${response.status})`);
  }
  const payload: unknown = await response.json();
  if (!isObject(payload)) {
    throw new Error("Host is not an Outline installation");
  }
  // Outline wraps RPC results in { data }; the official desktop bridge
  // contract exposes the configuration itself, not the HTTP response envelope.
  const config = "data" in payload ? payload.data : payload;
  if (!isObject(config) || !Array.isArray(config.providers)) {
    throw new Error("Host is not an Outline installation");
  }
  return config;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
