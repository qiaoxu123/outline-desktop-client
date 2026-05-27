import https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { OutlineApiError, AuthError, NetworkError } from "./errors";

export interface TransportConfig {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
}

function createAgent(): https.Agent | HttpsProxyAgent<string> {
  const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY || "";

  if (proxyUrl) {
    return new HttpsProxyAgent(proxyUrl, {
      rejectUnauthorized: false,
    });
  }

  return new https.Agent({ rejectUnauthorized: false });
}

let _agent: https.Agent | HttpsProxyAgent<string> | null = null;

function getAgent(): https.Agent | HttpsProxyAgent<string> {
  if (!_agent) _agent = createAgent();
  return _agent;
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
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json",
      },
      body: JSON.stringify(params),
      signal: linkedSignal,
      // @ts-expect-error - dispatcher is Node.js fetch's undici option
      dispatcher: getAgent(),
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
