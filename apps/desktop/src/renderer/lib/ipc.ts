/**
 * IPC handlers reply with an envelope: { ok: true, data } | { ok: false, error }.
 * Views must unwrap it — treating the envelope itself as the payload puts an
 * object where an array is expected (e.g. `collections.map is not a function`)
 * and crashes the whole React tree into a white screen.
 */
interface IpcEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

export async function unwrapIpc<T>(promise: Promise<unknown>): Promise<T> {
  const result = (await promise) as IpcEnvelope<T> | T;

  if (
    result &&
    typeof result === "object" &&
    "ok" in (result as Record<string, unknown>)
  ) {
    const envelope = result as IpcEnvelope<T>;
    if (!envelope.ok) {
      throw new Error(envelope.error?.message ?? "请求失败");
    }
    return envelope.data as T;
  }

  return result as T;
}
