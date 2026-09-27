# Sprint 03 — Storage & Nuvio addon

**Status:** not started

## Goal

Prove the end of the pipeline: a Combined List stored in KV shows up in Nuvio as a Catalog,
before building any GUI.

## Tasks

- [ ] `storage/lists.ts` — get / put (with `version` check) / delete list; maintain `index` key (plan §3)
- [ ] `addon/` builders — manifest (one Catalog per type present, `skip` extra) and catalog pages of 100 (plan §5)
- [ ] Routes `addon/[secret]/manifest.json` and `addon/[secret]/catalog/[type]/[...rest]` (`{id}.json`, `{id}/skip=N.json`)
- [ ] Constant-time secret check → 404 on mismatch; CORS `*`; `Cache-Control: max-age=60`
- [ ] Unknown list/type → `{ metas: [] }`
- [ ] Seed script: build a list from a real Source (Sprint 02 code) and write it to KV
- [ ] Generate `ADDON_SECRET`, set with `wrangler secret put`, deploy

## Done when

- Addon installed in Nuvio from the deployed URL
- The seeded list appears as a row with posters, correct order, and pages beyond 100 Titles load
- A mixed movie/show list appears as two Catalogs
- A Catalog can be added to a Nuvio collection folder
- Wrong secret returns 404

## Needs from Paul

- Installing the addon in Nuvio and checking it on-device
