export class OutlineApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public retryable: boolean,
  ) {
    super(message);
    this.name = "OutlineApiError";
  }
}

export class AuthError extends OutlineApiError {
  constructor(message = "Authentication failed") {
    super(message, "AUTH_ERROR", 401, false);
    this.name = "AuthError";
  }
}

export class NetworkError extends OutlineApiError {
  constructor(message = "Network error") {
    super(message, "NETWORK_ERROR", 0, true);
    this.name = "NetworkError";
  }
}

export class ValidationError extends OutlineApiError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400, false);
    this.name = "ValidationError";
  }
}

export function classifyError(error: unknown): OutlineApiError {
  if (error instanceof OutlineApiError) return error;
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return new NetworkError();
  }
  return new OutlineApiError(
    error instanceof Error ? error.message : "Unknown error",
    "UNKNOWN",
    0,
    true,
  );
}
