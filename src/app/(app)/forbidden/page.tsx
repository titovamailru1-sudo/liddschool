import Link from "next/link";
import { ShieldX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Нет доступа" };

export default function ForbiddenPage() {
  return (
    <EmptyState
      icon={ShieldX}
      title="Нет доступа к разделу"
      hint="Этот раздел недоступен для вашей роли. Если доступ нужен для работы, обратитесь к владельцу школы."
      action={
        <Button asChild variant="outline">
          <Link href="/lessons">К урокам</Link>
        </Button>
      }
    />
  );
}
