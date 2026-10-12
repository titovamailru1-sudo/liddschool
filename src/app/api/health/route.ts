import { WORKER_HEARTBEAT_KEY } from "@/server/alerts";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const WORKER_STALE_MS = 5 * 60_000;

/**
 * Проверка для мониторинга доступности: сайт отвечает, база доступна, воркер работал последние 5 минут.
 * 200 — всё в порядке, 503 — что-то не так (в ответе видно что). Без персональных данных.
 */
export async function GET() {
  let db = false;
  let workerAt: Date | null = null;
  try {
    const hb = await prisma.jobRun.findUnique({ where: { key: WORKER_HEARTBEAT_KEY }, select: { finishedAt: true } });
    db = true;
    workerAt = hb?.finishedAt ?? null;
  } catch {
    db = false;
  }
  const worker = !!workerAt && Date.now() - workerAt.getTime() < WORKER_STALE_MS;
  const ok = db && worker;
  return Response.json(
    { ok, db, worker, workerAt: workerAt?.toISOString() ?? null, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
