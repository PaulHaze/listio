# Sprint 08 — IMDb Source

**Status:** not started

## Goal

IMDb lists as a Source: paste the URL; if that fails, upload the CSV instead.

## Tasks

- [ ] `sources/detect.ts` — recognise `imdb.com/list/ls…`
- [ ] `sources/imdb.ts` — GraphQL list fetch (`caching.graphql.imdb.com`, cursor pagination), map `titleType` → movie/series
- [ ] Verify it works from Cloudflare (deployed), not just locally
- [ ] On failure, editor prompts for CSV upload; parse `Const`, `Title`, `Year`, `Title Type`
- [ ] Fixture tests for both paths

## Done when

- A real IMDb list URL imports on the deployed app, or falls back cleanly to CSV upload
- CSV upload of an IMDb export produces the same Titles

## Later (not scheduled)

- Simkl via browser bookmarklet
- Another addon's catalogs as a Source
