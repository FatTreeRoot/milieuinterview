/** Thin wrapper over fetch. Every call carries the session cookie. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Field name to message, when the server rejected specific inputs. */
    readonly fields: Record<string, string> | null = null,
  ) {
    super(message);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Distinguishable from a server error so callers can show an offline state.
    throw new ApiError(0, "Cannot reach the server");
  }

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as
    | { error?: string; details?: Record<string, string> | null }
    | null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error ?? "Something went wrong",
      payload?.details ?? null,
    );
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),

  /** Multipart upload, for the Word document import. */
  async upload<T>(path: string, file: File): Promise<T> {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      body: form,
    });
    const payload = (await response.json().catch(() => null)) as
      | { error?: string; details?: Record<string, string> | null }
      | null;
    if (!response.ok) {
      throw new ApiError(
        response.status,
        payload?.error ?? "The upload failed",
        payload?.details ?? null,
      );
    }
    return payload as T;
  },
};
