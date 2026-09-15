# ADR-002 — Provider Abstraction

**Status:** Accepted

## Decision
Datto RMM and Microsoft Graph are adapters, not domain models.

Interfaces:

- `RmmProvider`
- `EmailProvider`

Initial implementations:

- `DattoRmmProvider`
- `MicrosoftGraphEmailProvider`

## Consequence
Core entities use neutral identifiers and normalized fields. Provider-specific values are stored in integration mapping tables. This prevents Datto-specific assumptions from leaking throughout ticketing, CRM, and device code.
