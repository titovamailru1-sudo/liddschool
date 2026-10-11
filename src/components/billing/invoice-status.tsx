import type { InvoiceStatus } from "@prisma/client";
import { StatusBadge, type StatusTone } from "@/components/status-badge";

/** Статус счёта на языке оплаты: черновик, ожидается, частично, оплачено, долг (списан и не оплачен). */
export function invoiceStatusView(status: InvoiceStatus, charged: boolean): { label: string; tone: StatusTone } {
  if (status === "DRAFT") return { label: "Черновик", tone: "cancelled" };
  if (status === "CANCELLED") return { label: "Отменён", tone: "cancelled" };
  if (status === "PAID") return { label: "Оплачено", tone: "done" };
  if (status === "PARTIALLY_PAID") return { label: charged ? "Долг (частично)" : "Частично", tone: charged ? "danger" : "warning" };
  return charged ? { label: "Долг", tone: "danger" } : { label: "Ожидается", tone: "warning" };
}

export function InvoiceStatusBadge({ status, charged }: { status: InvoiceStatus; charged: boolean }) {
  const v = invoiceStatusView(status, charged);
  return <StatusBadge tone={v.tone}>{v.label}</StatusBadge>;
}

export const MESSAGE_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  QUEUED: { label: "В очереди", tone: "planned" },
  SENT: { label: "Отправлено", tone: "done" },
  FAILED: { label: "Ошибка", tone: "danger" },
  SKIPPED: { label: "Не отправлено", tone: "warning" },
};
