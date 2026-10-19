# Safe verification

## Database integration tests

Unit tests never use the project database. Real database verification requires an isolated disposable PostgreSQL/Neon branch supplied as `TEST_DATABASE_URL` and an explicit `ALLOW_TEST_DATABASE=true`. The URL must not equal `DATABASE_URL` and must not look production-like. Run `pnpm test:integration`; it fails closed with `BLOCKED` until the disposable branch is available. This harness never truncates, resets, migrates, or seeds a database automatically.

The repository currently has no migration runner. Create a disposable Neon branch or isolated PostgreSQL database, apply the existing schema and the `ticket_events.idempotency_key` column/index through the approved Neon workflow, then run `TEST_DATABASE_URL='postgresql://...isolated...' ALLOW_TEST_DATABASE=true pnpm test:integration`. The runner inserts only `INT-*` records inside a transaction and rolls the transaction back; it never truncates, resets, migrates, or falls back to `DATABASE_URL`. If the command prints `BLOCKED`, no database verification occurred.

## AI provider

The support route uses AI SDK 7's `gateway()` with model `openai/gpt-4.1-mini`. Vercel deployments may authenticate through runtime/OIDC; local or explicitly keyed environments may provide `AI_GATEWAY_API_KEY`. The health endpoint reports `configured: true` only for an explicit Gateway key; a deployed runtime request is still the required proof for OIDC. `API_KEY` alone is never treated as a Gateway credential. `GET /api/support/health` returns only model, auth mode, and a boolean configured flag; it never returns secrets. A successful build or health response does not prove a live provider call.

## Staff authentication

Set `ASSISTLY_STAFF_SECRET` to at least 32 random bytes and generate `ASSISTLY_STAFF_PASSWORD_HASH` with `pnpm staff:hash`. Keep both server-only. Live login verification is blocked until authorized non-production values are supplied; never invent or print credentials.

## Current verification policy

Do not label the application production-ready based on unit tests, a build, mocked provider responses, or a browser screenshot. Report unit/security, database, AI provider, staff authentication, and customer isolation results separately.
