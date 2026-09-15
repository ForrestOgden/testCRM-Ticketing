# ADR-005 — Email-to-ticket Threading

**Status:** Accepted

## Match order
1. Explicit ticket token such as `[TKT-000812]`
2. `In-Reply-To` / `References` against stored Internet Message IDs
3. Microsoft Graph conversation mapping
4. New ticket

## Idempotency
Store the provider message ID and Internet Message ID under unique constraints. Webhook notifications are treated as hints; the API fetches the authoritative message before processing.

## Loop protection
Ignore CRM-originated messages, delivery reports, automated replies, and duplicates. Persist a processing disposition for auditability.
