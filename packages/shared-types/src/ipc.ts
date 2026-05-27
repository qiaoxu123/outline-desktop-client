export interface IpcEnvelope<T = unknown> {
  requestId: string;
  profileId?: string;
  payload: T;
}

export interface IpcSuccess<T = unknown> {
  requestId: string;
  ok: true;
  data: T;
}

export interface IpcError {
  requestId: string;
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export type IpcResponse<T = unknown> = IpcSuccess<T> | IpcError;
