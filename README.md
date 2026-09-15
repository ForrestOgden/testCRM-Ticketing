# MSP CRM + Integrated Help Desk

Self-hosted MSP CRM with integrated ticketing, Datto RMM awareness, Microsoft 365 support-email intake, and endpoint support requests.

## Quick launch on Windows

For local testing, double-click `LAUNCH.bat` in the repository root.

The launcher will:

- verify Node.js, pnpm/Corepack, and Docker Desktop
- create `.env` from `.env.example` on first launch
- generate a local encryption key for stored integration secrets when needed
- start the local PostgreSQL Docker container
- install/update project dependencies
- generate the Prisma client
- apply the current development database schema
- apply idempotent seed data
- start the API, worker, and web UI in separate command windows
- open `http://localhost:3000` when the UI is ready

Double-click `STOP.bat` to stop the app processes and the local PostgreSQL container.

`LAUNCH.bat` is the supported local entry point and should be kept working as application changes are made.

## Product rules

- CRM first; this is not a PSA.
- Client 360 is the center of the product.
- Tickets, contacts, devices, opportunities, activities, and RMM alerts are connected records.
- Datto RMM and Microsoft Graph sit behind provider interfaces.
- Modular monolith first. No microservices, Kafka, Kubernetes, or Elasticsearch.
- Microsoft Entra ID is the workforce identity provider.
- PostgreSQL is the source of truth for application-owned data.
- External systems are synchronized/cached; they do not define the domain model.

## Repository layout

- `apps/web` — Next.js technician UI
- `apps/api` — NestJS application API
- `apps/worker` — background jobs, sync, notifications, webhook reconciliation
- `apps/support-launcher` — Windows support launcher
- `packages/database` — Prisma schema and database package
- `packages/contracts` — shared API/domain contracts
- `packages/ui` — shared UI primitives
- `docs` — ADRs, security baseline, domain model, build sequence
- `infrastructure` — Docker/Caddy deployment assets
- `scripts` — local launch/stop automation used by the root batch files
