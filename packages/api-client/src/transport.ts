import type { ApiRequestOptions } from "@outline/shared-types";
import { OutlineApiError, AuthError, NetworkError } from "./errors";

export interface TransportConfig {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
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
