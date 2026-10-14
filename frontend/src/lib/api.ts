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

function parseContentDispositionFilename(header: string | null): string {
  if (!header) return "";
  // Matches both `filename="quoted name.ext"` and an unquoted `filename=name.ext`.
  const quoted = /filename\*?=(?:UTF-8'')?"?([^";\n]+)"?/i.exec(header);
  if (!quoted || !quoted[1]) return "";
  try {
    return decodeURIComponent(quoted[1]);
  } catch {
    return quoted[1];
  }
}

/**
 * Fetches binary content directly, bypassing `apiFetch`'s JSON parsing --
 * routing a download through that path would corrupt the bytes. Returns the
 * raw `Blob` plus the filename recovered from `Content-Disposition`, so the
 * caller can fall back to a filename it already knows when the header is
 * absent or unparsable (AC-027).
 */
export async function apiFetchBlob(
  path: string,
  init?: RequestInit,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `${init?.method ?? "GET"} ${path} failed: ${response.status}`,
    );
  }
  const blob = await response.blob();
  const filename = parseContentDispositionFilename(response.headers.get("Content-Disposition"));
  return { blob, filename };
}

/**
 * Saves a `Blob` to the user's machine under `filename`, without the bytes
 * ever round-tripping through anything that could alter them (no JSON parse,
 * no text re-encode): an object URL, a transient anchor with a `download`
 * attribute, and a click, then the URL is revoked.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
