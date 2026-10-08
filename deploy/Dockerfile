# syntax=docker/dockerfile:1
# Build context: repository root.  docker build -f deploy/Dockerfile .
FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++ && corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build \
 && pnpm --filter @pixel-farm/server deploy --prod --legacy /out/server

FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    STATIC_DIR=/app/client \
    DB_PATH=/data/farm.db
WORKDIR /app/server
COPY --from=build /out/server ./
COPY --from=build /src/client/dist /app/client
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "dist/index.js"]
