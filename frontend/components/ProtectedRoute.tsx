"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { Role } from "@/lib/types";

/**
 * Client-side gate for the sake of UX (don't flash a page you can't use).
 * This is NOT the security boundary — every API route independently
 * checks the role again server-side (see backend/src/middleware/rbac.ts).
 * If someone bypasses this and calls the API directly, the backend still
 * returns a 403.
 */
export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: Role[];
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      router.push("/");
    }
  }, [user, loading, allowedRoles, router]);

  if (loading || !user) {
    return <div className="p-8 text-sm text-muted">Loading...</div>;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <div className="p-8 text-sm text-muted">You don&apos;t have access to this page.</div>;
  }

  return <>{children}</>;
}
