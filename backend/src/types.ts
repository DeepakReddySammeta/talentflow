import { Role } from "@prisma/client";

export interface JwtPayload {
  userId: string;
  role: Role;
  department: string | null;
  name: string;
}

// Augment Express's Request type so req.user is typed everywhere
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
