import { PrismaClient } from "@prisma/client";

// Один клиент на процесс: в dev горячая перезагрузка иначе плодит подключения.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
