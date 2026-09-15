# Domain Model

## Aggregate roots

### Client
Owns client lifecycle and business identity. Associated with contacts, locations, opportunities, activities, tasks, technical profile entries, devices, tickets, tags, and files.

### Ticket
Owns support workflow state. A ticket can reference one client, optional contact, optional location, optional device, queue, assigned technician, messages, internal notes, attachments, watchers, related tickets, and RMM alert mappings.

### Opportunity
Owns pipeline state and sales value. Associated with a client/prospect, contacts, activities, tasks, documents, stage, and owner.

### Device
Application-owned normalized cache of an RMM-managed endpoint. Provider IDs live in `ExternalRecordMapping`.

## Important invariants

- Every ticket belongs to exactly one client.
- Customer-visible messages and internal notes are distinct entity types/visibilities.
- Closed tickets are immutable except through privileged reopen/administrative workflows.
- Provider webhook deliveries are idempotent.
- A device can exist without a current RMM provider mapping, preserving ticket history after device removal.
- Audit records are append-only.
- RMM commands require a separate permission from ordinary device read access.

## Ticket state machine

`NEW -> TRIAGE -> ASSIGNED -> IN_PROGRESS -> WAITING_CUSTOMER | WAITING_VENDOR | SCHEDULED -> RESOLVED -> CLOSED`

Transitions are validated server-side. `CLOSED -> IN_PROGRESS` is a privileged reopen transition and emits a dedicated audit/domain event.
