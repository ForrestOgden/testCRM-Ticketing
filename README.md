# MSP CRM + Integrated Help Desk

Phase 0 engineering foundation for a self-hosted MSP CRM with integrated ticketing and Datto RMM awareness.

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
- `apps/support-launcher` — future .NET Windows support launcher
- `packages/database` — Prisma schema and database package
- `packages/contracts` — shared API/domain contracts
- `packages/ui` — shared UI primitives
- `docs` — ADRs, security baseline, domain model, build sequence
- `infrastructure` — Docker/Caddy deployment assets

## Foundation status

This package intentionally stops before feature implementation. It establishes domain boundaries, persistence design, security constraints, integration boundaries, and the build order that Phase 1 should follow.
