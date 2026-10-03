# Sprint 09 — IMDb Source

**Status:** complete

## Goal

IMDb lists as a Source: paste the URL; if that fails, upload the CSV instead.

## Tasks

- [x] `sources/detect.ts` — recognise `imdb.com/list/ls…`
- [x] `sources/imdb.ts` — GraphQL list fetch (`caching.graphql.imdb.com`, cursor pagination), map `titleType` → movie/series
- [x] Verify it works from Cloudflare (deployed), not just locally
- [x] On failure, editor prompts for CSV upload; parse `Const`, `Title`, `Year`, `Title Type`
- [x] Fixture tests for both paths

## Done when

- A real IMDb list URL imports on the deployed app, or falls back cleanly to CSV upload
- CSV upload of an IMDb export produces the same Titles

## Implementation and verification

Verified on 4 October 2026 (Australia/Sydney) at
the owner’s configured Worker URL, deployment version
`83dd8bbb-17b7-47bf-910d-cbd25c8499fc`:

- Authenticated `POST /api/sources/fetch` for the real public IMDb list
  `https://www.imdb.com/list/ls004285275/` returned 200 and all 125 Titles.
  The same list took two cursor pages locally at the production page size of 100.
- A nonexistent IMDb list returned 502 with an explicit CSV fallback and no
  partial Titles. The deployed editor displayed the export/upload instructions.
- In a temporary Combined List, the browser uploaded `test/fixtures/imdb-export.csv`,
  imported four Titles, reported one missing IMDb ID and two invalid/unsupported
  Titles, filled posters, displayed the Review grid, and saved the Draft.
  A backend GET verified the four expected IDs and types, an `imdb-csv` Source,
  and version 2. The temporary Combined List was deleted after the check (204).
- `pnpm test`: 130 passing tests across 12 files, including 41 IMDb cases.
  GraphQL and CSV fixtures produce identical normalized Titles and skip counts.
- `pnpm build` passed; changed-file Prettier and ESLint checks passed.
  Repository-wide `pnpm lint:check` was blocked by formatting in concurrently
  edited Sprint 11 documentation, outside this sprint's changes.

The CSV fixture follows the IMDb export schema and includes intentional edge
cases; it is not an authenticated export downloaded from IMDb. Its provenance
and the public live-response capture are documented in
`test/fixtures/imdb-README.md`.

IMDb requires web origin/client headers. The implementation uses a small raw
GraphQL query, avoiding expiring persisted-query hashes. Invalid responses,
GraphQL errors, cursor loops, HTTP failures, a 15-second page timeout, and the
40-page Worker budget fail the entire import and offer CSV. TV series and mini
series become series; movie-like types become movies. Episodes, video games,
and unknown types count as invalid. CSV files are parsed in the browser (up to
5 MB), then use the existing Draft merge, removal memory, enrichment, and Save.

Acceptance observation outside this sprint: after the successful browser save,
the existing cross-tab change alert appeared despite confirmed persistence.

## Later (not scheduled)

- Simkl via browser bookmarklet
- Another addon's catalogs as a Source
