"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, setToken, clearToken, SESSION_EXPIRED_EVENT } from "./apiClient";
import { AuthUser } from "./types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Reads the `exp` claim (seconds since epoch) straight out of the JWT —
 *  no verification, just enough to know when to warn the user client-side.
 *  The server remains the actual source of truth (requests still 401 once
 *  the token really expires; see SESSION_EXPIRED_EVENT in apiClient.ts). */
function decodeJwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleExpiry(token: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    const expiresAtMs = decodeJwtExpiryMs(token);
    if (expiresAtMs === null) return;
    const delay = expiresAtMs - Date.now();
    if (delay <= 0) {
      setSessionExpired(true);
      return;
    }
    // setTimeout is capped at ~24.8 days (signed 32-bit ms) — irrelevant at
    // a 2h session length, but guard against a misconfigured long-lived
    // token overflowing into an immediate fire.
    timerRef.current = setTimeout(() => setSessionExpired(true), Math.min(delay, 2 ** 31 - 1));
  }

  useEffect(() => {
    const stored = window.localStorage.getItem("ats_user");
    const token = window.localStorage.getItem("ats_token");
    if (stored) setUser(JSON.parse(stored));
    if (token) scheduleExpiry(token);
    setLoading(false);

    function handleExpired() {
      setSessionExpired(true);
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, password: string) {
    const res = await apiRequest<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setToken(res.token);
    window.localStorage.setItem("ats_user", JSON.stringify(res.user));
    setUser(res.user);
    setSessionExpired(false);
    scheduleExpiry(res.token);
    const preferredLanding = window.localStorage.getItem("tf_default_landing");
    router.push(preferredLanding === "/" || preferredLanding === "/dashboard" ? preferredLanding : "/dashboard");
  }

  function logout() {
    if (timerRef.current) clearTimeout(timerRef.current);
    clearToken();
    window.localStorage.removeItem("ats_user");
    setUser(null);
    setSessionExpired(false);
    router.push("/login");
  }

  function handleGoToLogin() {
    setSessionExpired(false);
    logout();
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}

      {/* Session-expiry notice — fires either from the client-side timer
          above (2h after login, matching the backend's JWT_EXPIRES_IN) or
          from any request coming back 401 mid-session. No onOpenChange:
          only the button below can dismiss it, same controlled-dialog
          pattern used for the pending-action dialog in ChatWindow. */}
      <Dialog open={sessionExpired}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Session expired</DialogTitle>
            <DialogDescription>
              You've been signed in for a while and your session has timed out. Please refresh and log in again to continue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleGoToLogin}>Go to login</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
