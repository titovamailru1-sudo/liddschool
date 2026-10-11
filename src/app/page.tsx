import { redirect } from "next/navigation";

// Дашборда нет: после входа открываются «Уроки» на сегодня.
export default function Home() {
  redirect("/lessons");
}
