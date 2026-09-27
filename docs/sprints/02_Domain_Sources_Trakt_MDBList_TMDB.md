# Sprint 02 — Domain core & Sources: Trakt, MDBList, TMDB

**Status:** implementation complete (offline verification; live probes pending credentials)

## Goal

Given a Trakt or MDBList URL, produce enriched Titles and merge them into a Combined List
correctly — as pure, tested TypeScript, before any UI or storage exists.

## Tasks

- [x] `domain/types.ts` — Title, CombinedList, SourceRecord, SortOrder (plan §3)
- [x] `domain/slug.ts` — name → unique id (`spy-thrillers`, `spy-thrillers-2`)
- [x] `domain/merge.ts` — dedupe by IMDb ID, skip existing and Removed Titles, flag new, assign `addedSeq`
- [x] `domain/sort.ts` — newest (default) / oldest / A–Z / order added
- [x] `sources/detect.ts` — recognise Trakt (`/users/{u}/lists/{slug}`, `/lists/{id}`) and MDBList URLs; clear error otherwise
- [x] `sources/trakt.ts` — paginated fetch, normalize, map types, skip no-IMDb items (counted)
- [x] `sources/mdblist.ts` — current cursor/bucket response plus legacy shapes; live response verification requires a key
- [x] `tmdb/enrich.ts` — details by tmdbId (or `/find` by IMDb ID) → poster, year, blurb (tagline, else first sentence of overview)
- [x] Recorded fixtures + unit tests for all of the above
- [x] `scripts/probe-*.ts` to run a real URL end-to-end from the terminal

> Offline verification is complete. Live Trakt/MDBList/TMDB probes were not run because
> `.dev.vars` and real list URLs were not available in this workspace.

## Done when

- Probe script turns a real Trakt URL and a real MDBList URL into enriched Titles
- Merging a second Source into a list skips duplicates and Removed Titles (tested)
- All tests pass

## Needs from Paul

- Trakt client ID, MDBList API key, TMDB key in `.dev.vars`
- One or two real list URLs to test against
