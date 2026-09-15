FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --filter @msp-crm/worker... --no-frozen-lockfile
COPY apps/worker apps/worker
RUN pnpm --filter @msp-crm/worker build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app/apps/worker ./apps/worker
COPY --from=build /app/node_modules ./node_modules
CMD ["node", "apps/worker/dist/index.js"]
