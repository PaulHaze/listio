# Sprint 07 — Cloudflare Access

**Status:** not started

## Goal
Only Paul can reach the editing UI; Nuvio can still reach the addon.

## Tasks
- [ ] Cloudflare Zero Trust (free) — Access application on the Worker hostname, allow policy = Paul's email
- [ ] Second Access application on `/addon/*` with a **Bypass** policy
- [ ] Confirm `/api/*` admin routes are covered by the main application
- [ ] Document the setup steps in `docs/` (it lives in the dashboard, not code)

## Done when
- From a private browser window: UI and `/api/*` demand login; only Paul's email gets in
- Nuvio still loads the addon; wrong secret still 404s
