# syntax=docker/dockerfile:1

FROM oven/bun:1 AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun --bun next build

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/next.config.js /app/tsconfig.json ./
COPY --from=deps /app/public ./public
COPY --from=deps /app/styles ./styles
COPY --from=deps /app/components ./components
COPY --from=deps /app/lib ./lib
COPY --from=deps /app/config ./config
COPY --from=deps /app/locales ./locales
COPY --from=deps /app/app ./app
COPY --from=deps /app/.next ./.next
COPY --from=deps /app/node_modules ./node_modules

EXPOSE 3000
CMD ["bun", "--bun", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
