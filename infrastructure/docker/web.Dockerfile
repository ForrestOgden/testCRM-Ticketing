FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @msp-crm/web... --no-frozen-lockfile
COPY apps/web apps/web
RUN pnpm --filter @msp-crm/web build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/web ./apps/web
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["pnpm", "--filter", "@msp-crm/web", "start"]
