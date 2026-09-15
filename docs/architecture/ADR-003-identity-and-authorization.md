# ADR-003 — Identity and Authorization

**Status:** Accepted

## Decision
Use Microsoft Entra ID for workforce authentication with OIDC. The application stores no employee passwords.

Authorization is application-owned and capability-based. Roles are collections of permissions such as:

- `ticket.read`
- `ticket.write`
- `ticket.assign`
- `crm.read`
- `crm.write`
- `device.read`
- `rmm.execute`
- `admin.manage_users`

## Security invariant
Authentication success does not imply authorization. Every mutating API route performs server-side capability checks.
