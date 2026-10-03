# Sprint 08 — Login: Basic Auth

**Status:** complete

## Goal

Only Paul can reach the editing UI; Nuvio can still reach the addon.

Originally planned as Cloudflare Access. Replaced with HTTP Basic Auth in the app
([ADR 0006](../adr/0006-basic-auth-instead-of-cloudflare-access.md)).

## Tasks

- [x] `src/middleware.ts`: Basic Auth on every route except `/addon/*` and `/robots.txt`,
      checked against `ADMIN_USER` / `ADMIN_PASSWORD` with a constant-time comparison
- [x] Fail closed: 503 if either secret is unset
- [x] Add both secrets to `Cloudflare.Env` and `.dev.vars.example`
- [x] Tests: `test/basic-auth.test.ts` (UI and `/api/*` challenged, right credentials pass, wrong
      user/password and malformed headers rejected, addon and robots.txt open, unset secrets → 503)
- [x] Update spec, implementation plan and README; remove the Cloudflare Access runbook
- [x] Set the secrets live: `pnpm wrangler secret put ADMIN_USER` and
      `pnpm wrangler secret put ADMIN_PASSWORD` (long random password), then `pnpm deploy`
- [x] Add the same two values to local `.dev.vars`

## Done when

- From a private browser window: the UI and an `/api/*` URL ask for a login; wrong credentials are
  refused and the right ones get in
- Nuvio still loads the addon; wrong secret still 404s

## Verification

Local, 2026-10-03: `pnpm exec vitest run` passed (11 files, 89 tests, including the 5 new
Basic Auth tests and the existing addon wrong-secret 404 tests); `astro check` reported 0 errors.

Live, 2026-10-04 (owner): secrets set and deployed; Basic Auth confirmed working on the live
Worker. The addon also loads in xperience by adding its manifest URL as an addon, so Listio
catalogs work beyond Nuvio.

Audit note: `docs/audits/sprint-08-audit-astra.md` reviewed the dropped Cloudflare Access runbook
(`e32369b`). Its FAIL is superseded by the switch to Basic Auth (ADR 0006) and needs no action.
