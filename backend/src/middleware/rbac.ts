import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";

/**
 * Route-level RBAC gate. This is the enforcement point — the frontend
 * sidebar hides links for UX, but it is this middleware (not the UI)
 * that actually stops a role from calling an endpoint it shouldn't.
 *
 * Usage: router.get("/offers", requireAuth, allowRoles("ADMIN", "HR", "MANAGER"), handler)
 */
export function allowRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Role ${req.user.role} is not permitted to perform this action` });
    }
    next();
  };
}
