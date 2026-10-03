# Sprint 03 — Storage & Nuvio addon

**Status:** complete — audited (Astra + Opus), audit fixes applied, on-device acceptance passed

## Goal

Prove the end of the pipeline: a Combined List stored in KV shows up in Nuvio as a Catalog,
before building any GUI.

## Tasks

- [x] `storage/lists.ts` — get / put (with `version` check) / delete list; maintain `index` key (plan §3)
- [x] `addon/` builders — manifest (one Catalog per type present, `skip` extra) and catalog pages of 100 (plan §5)
- [x] Routes `addon/[secret]/manifest.json` and `addon/[secret]/catalog/[type]/[...rest]` (`{id}.json`, `{id}/skip=N.json`)
- [x] Constant-time secret check → 404 on mismatch; CORS `*`; `Cache-Control: max-age=60`
- [x] Unknown list/type → `{ metas: [] }`
- [x] Seed script: build a list from a real Source (Sprint 02 code) and write it to KV
- [x] Generate `ADDON_SECRET`, set with `wrangler secret put`, deploy

## Done when

- [x] Addon installed in Nuvio from the deployed URL
- [x] The seeded list appears as a row with posters, correct order, and pages beyond 100 Titles load
- [x] A mixed movie/show list appears as two Catalogs
- [x] A Catalog can be added to a Nuvio collection folder
- [x] Wrong secret returns 404

## Needs from Paul

- Installing the addon in Nuvio and checking it on-device

## Implementation verification

- `pnpm test`: 41 tests passed, including repository/index lifecycle, stale version
  rejection, mixed Catalogs, sorted pagination, secret checks and response headers.
- `pnpm build`: Astro check reported zero errors/warnings/hints and production build passed.
- ESLint passed for the changed source files.
- Seeded `pipeline-proof` from the two real Sources already verified in Sprint 02:
  the Star Wars canon timeline Trakt Source and latest TV shows MDBList Source.
  Stored 322 Titles (321 posters): 15 movies and 307 series, in order added.
- Generated a 256-bit `ADDON_SECRET`, uploaded with `wrangler secret put`, and deployed.
- Live Worker checks passed: two manifest Catalogs, saved metadata and order match
  exactly, series pages contain 100 / 100 / 100 / 7 Titles, unknown list/type are
  empty, malformed pagination returns 404, and wrong secrets return 404 on both routes.
  CORS `*` and `Cache-Control: max-age=60` verified on success and error responses.
- The secret-bearing install URL is in the ignored local file
  `.wrangler/sprint-03-install.txt`; it is deliberately absent from tracked docs.

## Device acceptance

Passed on the Nuvio Mac app (2026-10-03). The addon was installed from the private
URL and both `pipeline-proof` Catalogs (movies, series) appeared on Home in source
order with posters. The series grid scrolled through all 307 Titles, and the
poster-less Title rendered. All 15 movies, including the last one, appeared once
the Catalog was opened from a collection; the Mac Home row offers no "See all" for
a short row. Three collections were built from the Catalogs (combined, movies only,
series only) and all worked.

## Storage limitation

The version check rejects an observed stale Draft, but KV has no transactional
compare-and-swap. Simultaneous saves or writes during KV propagation can still race,
and the list/index writes are not atomic. This follows the planned KV design;
callers must not treat it as a strong concurrency guarantee. The index is written
before the list, so a save that fails halfway leaves an index entry that serves
an empty Catalog and can be retried, never an invisible list that blocks a retry.

## Seed CLI

Populate `.dev.vars` from `.dev.vars.example`, then run:

```sh
pnpm seed:list "Combined List name" "https://trakt.tv/users/USER/lists/SLUG"
pnpm seed:list --remote "Combined List name" "https://mdblist.com/lists/USER/SLUG"
```

The default writes the Node development KV stand-in used by `pnpm dev`.
`--remote` uses the existing Wrangler login and the configured `LISTIO` namespace.
Pass multiple Source URLs to build one mixed Combined List. The CLI uses Sprint 02
normalization, deduplication and TMDB enrichment, preserves Source order, and refuses
to overwrite an existing list or indexed ID. It saves only after all Sources finish.
An empty or unavailable poster remains nullable, just as in the normal pipeline.
Remote temporary value files are created outside the repository and removed on exit.
The CLI needs Node with TypeScript stripping, as do the existing Source probes.
