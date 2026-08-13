const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || API_URL.replace(/^http/, "ws");

/** Fired whenever a request comes back 401 (token expired/invalid) or the
 *  client-side expiry timer in authContext.tsx elapses — the single signal
 *  the session-expired modal listens for, from either source. */
export const SESSION_EXPIRED_EVENT = "tf:session-expired";

export function signalSessionExpired() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("ats_token");
}

/** Full WebSocket URL for /ws/search, with the JWT as a query param since
 * browsers can't attach custom headers to a WebSocket handshake. */
export function getSearchSocketUrl(): string {
  const token = getToken();
  return `${WS_URL}/ws/search?token=${encodeURIComponent(token || "")}`;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

/**
 * Thin fetch wrapper: attaches the JWT, throws on non-2xx so React Query's
 * error state works for free, and returns parsed JSON.
 *
 * Note: storing the token in localStorage keeps this demo simple to run
 * locally. A production build should switch to an httpOnly cookie set by
 * the backend on login, so the token is never reachable from client JS.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    // Skip the login request itself — a wrong password is a normal 401,
    // not an expired session, and shouldn't pop the "session expired" modal
    // over the login form the user is looking at.
    if (res.status === 401 && path !== "/auth/login") {
      signalSessionExpired();
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }

  return res.json();
}

export function setToken(token: string) {
  window.localStorage.setItem("ats_token", token);
}

export function clearToken() {
  window.localStorage.removeItem("ats_token");
}

/**
 * Multipart upload — deliberately separate from apiRequest since it must
 * NOT set Content-Type itself (the browser sets it, including the
 * multipart boundary, when given a FormData body).
 */
export async function apiUpload<T>(path: string, file: File, fieldName = "file"): Promise<T> {
  const token = getToken();
  const form = new FormData();
  form.append(fieldName, file);

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Upload failed");
  }
  return res.json();
}
