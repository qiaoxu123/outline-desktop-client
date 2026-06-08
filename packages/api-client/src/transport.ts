import { ProxyAgent } from "undici";
import { OutlineApiError, AuthError, NetworkError } from "./errors";

export interface TransportConfig {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
}

type FetchFn = typeof globalThis.fetch;

/**
 * Injectable fetch implementation. In the Electron main process Node's
 * undici fetch can fail ("fetch failed") where Chromium's network stack
 * succeeds (different TLS/CA, DNS and proxy handling) — the app injects
 * Electron's `net.fetch` here so ALL API calls share the Chromium stack
 * that demonstrably reaches the server (it loads the login window).
 */
let _fetchFn: FetchFn | null = null;

export function setFetchImplementation(fn: FetchFn): void {
  _fetchFn = fn;
}

/**
 * undici `fetch` only accepts an undici `Dispatcher` (e.g. `ProxyAgent`) for
 * `dispatcher` — a Node `http(s).Agent`/`https-proxy-agent` has no `.dispatch()`
 * and throws "agent.dispatch is not a function".
 *
 * The Outline server is reachable directly, so the default path is no proxy.
 * A proxy is only used when `OUTLINE_PROXY` is explicitly set — we deliberately
 * ignore the ambient `https_proxy`/`HTTPS_PROXY`, since the server is a domestic
 * host that should not be routed through a general-purpose (often foreign) proxy.
 * TLS verification is relaxed (`requestTls.rejectUnauthorized: false`) because
 * the server's cert chain root may be absent from Node's CA bundle.
 */
function createDispatcher(): ProxyAgent | undefined {
  const proxyUrl = process.env.OUTLINE_PROXY || "";

  if (!proxyUrl) return undefined;

  return new ProxyAgent({
    uri: proxyUrl,
    requestTls: { rejectUnauthorized: false },
  });
}

let _dispatcher: ProxyAgent | undefined;
let _dispatcherInit = false;

function getDispatcher(): ProxyAgent | undefined {
  if (!_dispatcherInit) {
    _dispatcher = createDispatcher();
    _dispatcherInit = true;
  }
  return _dispatcher;
}

export async function apiRequest<T = unknown>(
  config: TransportConfig,
  method: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const url = normalizeUrl(config.baseUrl) + "/api/" + method;
  const timeoutMs = config.timeoutMs ?? 15_000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const linkedSignal = signal
    ? combineSignals(signal, controller.signal)
    : controller.signal;

  try {
    const f = _fetchFn ?? fetch;
    // The undici `dispatcher` (proxy) option only applies to Node's fetch.
    const dispatcher = _fetchFn ? undefined : getDispatcher();
    const response = await f(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json",
      },
      body: JSON.stringify(params),
      signal: linkedSignal,
      // `dispatcher` is a Node/undici fetch option absent from the DOM RequestInit
      // type; spreading the object literal avoids excess-property type errors.
      ...(dispatcher ? { dispatcher } : {}),
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      throw new AuthError();
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new OutlineApiError(
        body.message ?? `API error: ${response.status}`,
        body.code ?? "API_ERROR",
        response.status,
        response.status >= 500 || response.status === 429,
      );
    }

    const result = await response.json();
    return result as T;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof OutlineApiError || error instanceof AuthError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new NetworkError("Request timed out");
    }
    throw new NetworkError(
      error instanceof Error ? error.message : "Network error",
    );
  }
}

function normalizeUrl(url: string): string {
  let normalized = url.trim().replace(/\/+$/, "");
  if (!normalized.startsWith("http")) {
    normalized = `https://${normalized}`;
  }
  return normalized;
}

function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller.signal;
}
