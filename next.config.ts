import type { NextConfig } from "next";

// CRM почти целиком зависит от сессии пользователя, поэтому Cache Components не включаем:
// страницы рендерятся по запросу.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
