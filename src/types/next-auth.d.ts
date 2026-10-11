import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/access";

declare module "next-auth" {
  interface User {
    role: Role;
    teacherId: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      teacherId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    teacherId?: string | null;
  }
}
