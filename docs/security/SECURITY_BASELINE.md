# Security Baseline

## Required before production

- Entra ID OIDC authentication; no local workforce passwords.
- MFA enforced in Entra Conditional Access.
- Server-side authorization on every protected route.
- Secure, HttpOnly, SameSite session cookies.
- CSRF protection for cookie-authenticated mutations.
- Strict CSP and standard security headers.
- Request size limits and rate limiting.
- Zod validation at API boundaries.
- ORM parameterization; raw SQL requires reviewed tagged helpers.
- HTML sanitization before rendering email/customer content.
- Attachment allowlist, MIME sniffing, filename normalization, size limits, malware scanning hook, and storage outside the web root.
- Secrets supplied through environment/secret store; never committed.
- PostgreSQL available only on the private application network.
- Immutable audit trail for privileged and business-critical actions.
- Endpoint launcher per-device credentials with individual revocation.
- RMM command permission separated from normal support permissions.
- Nightly database + attachment backups and scheduled restore tests.

## Threat boundaries

1. Public internet -> Caddy
2. Browser -> application API
3. Microsoft Graph -> webhook endpoint
4. Datto RMM -> webhook endpoint
5. Support Launcher -> endpoint API
6. Worker -> external providers
7. Application -> PostgreSQL/private attachment store

Each external webhook uses replay/idempotency protection and a provider-specific verification strategy.
