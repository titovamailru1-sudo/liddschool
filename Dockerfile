# Продакшен-образ CRM: сайт (next start) и фоновый процесс (npm run worker:prod) из одного образа.
FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine
WORKDIR /app
RUN apk add --no-cache openssl tzdata
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 TZ=UTC PORT=3000
# Целиком: next start, prisma (миграции) и tsx (воркер, первичная настройка) берутся из node_modules.
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
CMD ["npm", "start"]
