# ADR-001 — Modular Monolith

**Status:** Accepted

## Decision
Use one deployable application backend with strict internal modules for Identity, CRM, Contacts, Locations, Activities, Opportunities, Tickets, Messaging, Devices, RMM, Search, Automations, Notifications, Files, Audit, and Administration.

## Why
The expected workload is small enough that distributed infrastructure adds failure modes without business value. Internal module boundaries preserve future extraction options while keeping transactions, deployment, debugging, and local development simple.

## Rules
1. Modules may depend only on published service interfaces/contracts.
2. External provider SDKs stay inside integration adapters.
3. Cross-module asynchronous side effects are represented as domain events persisted through an outbox.
4. No module may query another module's tables directly from controller code.
