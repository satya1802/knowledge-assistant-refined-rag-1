/// <reference types="vite/client" />
// Without the reference above, `import.meta.env` is not typed and `tsc --noEmit` fails --
// which `vite build` does not catch, because it tree-shakes this module out when no screen
// imports it yet.
//
// Where the generated API lives.
//
// Set at build time: the platform bakes the deployed API URL into the frontend build. The
// fallback is the local backend so a bare `npm run dev` still points somewhere real.
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

/**
 * Thrown by `apiFetch` on any non-2xx response. Carries the HTTP status so
 * callers can branch on 401 vs 403 vs other failures without re-parsing the
 * message string.
 */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // A FormData body (file uploads) must set its own multipart boundary --
  // forcing application/json here would corrupt the request and the server
  // would never see the file.
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const headers = isFormData
    ? { ...(init?.headers ?? {}) }
    : { "Content-Type": "application/json", ...(init?.headers ?? {}) };
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    // The session is an HTTP-only cookie, never a client-held token -- every
    // request must carry it, or a valid session reads as logged out.
    credentials: "include",
    headers,
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.clone().json();
      if (body && typeof body.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON or empty error body */
    }
    throw new ApiError(
      response.status,
      detail || `${init?.method ?? "GET"} ${path} failed: ${response.status}`,
    );
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
