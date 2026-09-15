FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @msp-crm/api... --no-frozen-lockfile
COPY apps/api apps/api
RUN pnpm --filter @msp-crm/api build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
