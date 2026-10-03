# Sprint 08 — Cloudflare Access

**Status:** documented; dashboard setup and live acceptance pending

## Goal

Only Paul can reach the editing UI; Nuvio can still reach the addon.

## Tasks

- [ ] Cloudflare Zero Trust (free) — Access application on the Worker hostname, allow policy = Paul's email
- [ ] Second Access application on `/addon/*` with a **Bypass** policy
- [ ] Confirm `/api/*` admin routes are covered by the main application
- [x] Document the setup steps in `docs/` (it lives in the dashboard, not code)

## Done when

- From a private browser window: UI and `/api/*` demand login; only Paul's email gets in
- Nuvio still loads the addon; wrong secret still 404s

## Implementation and pending verification

The [Cloudflare Access runbook](../cloudflare-access.md) specifies the two
hostname-based applications, exact-email Allow policy, addon Bypass, API
coverage, alternate hostname checks and live acceptance procedure.

Dashboard applications have not been configured or inspected. The available
Wrangler OAuth scopes omit Access application/policy management and no
authenticated dashboard browser session is available. Paul's exact email and
the deployment hostname need confirmation before setup. Consequently the
first three tasks and both done-when criteria remain pending.

Source inspection confirms the intended hostname application covers all
`/api/*` routes except any independently configured dashboard exceptions;
this is not evidence that the live deployment is protected. Existing manifest
and catalog handlers check `ADDON_SECRET` before reading storage and return
404 for a wrong secret. Local verification on 2026-10-03:
`rtk pnpm exec vitest run test/addon-routes.test.ts` passed all four tests,
including manifest/catalog wrong-secret 404s and catalog pagination routing.
Real Nuvio loading remains a live check.

Live verification record: **pending**. Record the verification date, configured
application names, coverage checks and acceptance results here after setup;
omit the allow-listed email, addon secret and authentication credentials.
Sprints 05–07 remain implemented with their own acceptance checks pending.
