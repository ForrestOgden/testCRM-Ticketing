# ADR-004 — PostgreSQL-backed Jobs + Transactional Outbox

**Status:** Accepted

## Decision
Use PostgreSQL for durable background jobs during initial deployment. Domain events are written to an outbox in the same transaction as business state changes, then consumed by workers.

## Why
This avoids the classic failure mode where a ticket commits but its notification/email/event is lost. Redis can be introduced only after measurement demonstrates a need.
