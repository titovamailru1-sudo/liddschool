"use client";

import Script from "next/script";

declare global {
  interface Window {
    ym?: (id: number, method: string, ...args: unknown[]) => void;
  }
}

/** Яндекс.Метрика на публичных страницах (номер счётчика — YANDEX_METRIKA_ID; без него ничего не грузится). */
export function Metrika({ id }: { id: string }) {
  return (
    <Script id="ym" strategy="afterInteractive">
      {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();
for (var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");
ym(${Number(id)},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:false});`}
    </Script>
  );
}

/** Цель в Метрике: «trial_request» — заявка, «contact_click» — клик по телефону/мессенджеру. */
export function reachGoal(goal: "trial_request" | "contact_click") {
  const id = Number(document.documentElement.dataset.ym);
  if (id && window.ym) window.ym(id, "reachGoal", goal);
}
