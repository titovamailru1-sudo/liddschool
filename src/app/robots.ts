import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Поисковикам открыты главная и политика (плюс стили, скрипты и картинка превью для них); CRM, оплата и приглашения — закрыты. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/$", "/privacy$", "/_next/static/", "/og.png"], disallow: "/" },
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
