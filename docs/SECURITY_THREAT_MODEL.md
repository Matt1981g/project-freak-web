# PROJECT FREAK web security threat model

Last reviewed: 2026-09-08

## Scope

PROJECT FREAK is a static, local-first PWA deployed from GitHub Pages. Training writes are authoritative in IndexedDB first; Supabase is an authenticated sync provider rather than the primary gym-time database.

This document records the security posture that matters for the current single-user deployment and prevents future changes from accidentally weakening it.

## Assets

The main protected assets are:

- training history, programmes, readiness and recovery data;
- Supabase access and refresh tokens;
- the authenticated user's remote sync namespace;
- backup files and imported programme data;
- integrity of historical actuals and programme prescriptions.

## Trust boundaries

1. The browser/PWA origin is trusted application code.
2. IndexedDB and Web Storage are same-origin browser storage, not a secure secret vault.
3. GitHub Pages serves static application assets only.
4. Supabase is the only production network backend allowed by the Content Security Policy.
5. Imported JSON/backups are untrusted inputs and must pass schema/integrity gates before mutation.
6. Coach output is untrusted programme input until programme validation accepts it.

## Current controls

### Cross-site scripting / token theft

The principal residual risk is a successful same-origin XSS. The current Supabase session is persisted in localStorage so a successful XSS could read the access and refresh tokens.

Mitigations currently in place:

- Content Security Policy restricts scripts to `self`;
- no third-party script origins are permitted;
- `object-src 'none'`;
- `frame-ancestors 'none'`;
- `base-uri 'self'`;
- network connections are restricted to the application origin, Supabase, and localhost WebSocket development endpoints;
- Supabase URLs must use HTTPS;
- malformed, expired and rejected sessions are cleared;
- RPC 401 responses clear the local session;
- the application does not persist the user's Supabase password.

Residual risk: **moderate impact / low likelihood for the present single-user static deployment**, assuming no unreviewed script injection surface is introduced.

### Why tokens remain in localStorage

HttpOnly cookies cannot be issued securely by a static GitHub Pages application without adding a trusted server/BFF. Moving tokens from localStorage to IndexedDB does not materially protect them from same-origin script execution. Client-side encryption also does not solve this because the decryption capability must be available to the same JavaScript context.

A backend-for-frontend solely to hide tokens would add infrastructure, failure modes and operational complexity to an application whose key gym workflow is deliberately local-first. It is not justified for the current private/single-user threat model.

This decision must be revisited before any public or multi-user deployment.

### Supabase data isolation

Remote sync relies on authenticated Supabase RPCs and row-level/user-scoped backend enforcement. Direct table access is not part of the application contract. Backend mutation validation limits entity types, mutation count, payload size and malformed revisions. Change-log compaction prevents unbounded retention growth.

### Local data integrity

Backup restore validates format, record schemas and checksums, performs restore transactionally, verifies restored checksums, then runs relational integrity inspection. A failed relational gate triggers restoration of the pre-restore safety backup.

Programme import validates schema, exercise IDs, set structure and live-logger capability before commit. Programme structures that the current logger cannot faithfully capture must be rejected rather than silently coerced.

## Security invariants

The following are release requirements:

1. `script-src` remains `self` only. Adding any external script/CDN requires explicit security review.
2. `object-src` remains `none` and `frame-ancestors` remains `none`.
3. Production `connect-src` must not gain arbitrary wildcard Internet access.
4. Supabase project configuration must remain HTTPS-only.
5. Passwords must never be written to localStorage, IndexedDB, logs, exports or backups.
6. Invalid/expired/rejected Supabase sessions must be cleared.
7. Remote sync must not bypass authenticated RPC/user isolation.
8. Imported data must not mutate the database until validation passes.
9. Historical completed training must not be rewritten by sync/programming automation without the existing explicit correction/audit path.

## Escalation triggers

The token-storage architecture must be reconsidered if any of the following becomes true:

- PROJECT FREAK becomes public-facing or supports unrelated users;
- privileged/admin data is added;
- third-party JavaScript or analytics are introduced;
- the app handles payment, medical-record integration or other materially higher sensitivity data;
- a server component is introduced for another justified reason;
- an XSS vulnerability is discovered;
- Supabase session policy changes materially.

At that point, evaluate a same-site server/BFF with Secure, HttpOnly cookies, CSRF protection and short-lived server-managed sessions.

## Review conclusion

For the present local-first, single-user static PWA, the correct control is to minimize XSS opportunity and preserve the strict CSP rather than add a server solely to move the refresh token into an HttpOnly cookie. The localStorage token exposure is explicitly accepted residual risk, not an unnoticed defect.
