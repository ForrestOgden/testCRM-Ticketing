# Implementation Build Order

## Phase 1A — Skeleton
1. Workspace/build tooling
2. PostgreSQL + Prisma client
3. NestJS application shell
4. Next.js application shell
5. Health/readiness endpoints
6. Structured logging + request correlation IDs

## Phase 1B — Identity
1. Entra OIDC login
2. User provisioning on first authorized sign-in
3. Roles and capabilities
4. Session lifecycle
5. Authorization guards
6. Audit events for sign-in/admin changes

## Phase 1C — Core platform
1. Client CRUD
2. Contact CRUD
3. Location CRUD
4. Tags/custom fields
5. Activity timeline
6. Tasks/reminders
7. Global command/search framework
8. Files/attachments service

## Phase 2 — Client 360 + Opportunities
Build the first production-useful CRM experience before ticketing.

## Phase 3 — Ticketing
Implement ticket state machine, queues, assignment, conversation, internal notes, attachments, search, saved views, and notification events.

## Phase 4 — Microsoft Graph
Implement application-permission mailbox subscription, webhook renewal, authoritative message fetch, idempotent threading, outbound replies, and loop protection.

## Phase 5 — Datto RMM
Implement OAuth token lifecycle, site/device synchronization, neutral provider mapping, global-webhook intake, reconciliation, and device context.

## Phase 6 — Support Launcher
Only after endpoint enrollment APIs and ticket intake are stable.

## Hard gates
No production cutover until backup restore, audit integrity, mailbox threading, webhook replay handling, endpoint revocation, and authorization tests have passed.
