# Sprint 02 — Domain core & Sources: Trakt, MDBList, TMDB

**Status:** not started

## Goal

Given a Trakt or MDBList URL, produce enriched Titles and merge them into a Combined List
correctly — as pure, tested TypeScript, before any UI or storage exists.

## Tasks

- [ ] `domain/types.ts` — Title, CombinedList, SourceRecord, SortOrder (plan §3)
- [ ] `domain/slug.ts` — name → unique id (`spy-thrillers`, `spy-thrillers-2`)
- [ ] `domain/merge.ts` — dedupe by IMDb ID, skip existing and Removed Titles, flag new, assign `addedSeq`
- [ ] `domain/sort.ts` — newest (default) / oldest / A–Z / order added
- [ ] `sources/detect.ts` — recognise Trakt (`/users/{u}/lists/{slug}`, `/lists/{id}`) and MDBList URLs; clear error otherwise
- [ ] `sources/trakt.ts` — paginated fetch, normalize, map types, skip no-IMDb items (counted)
- [ ] `sources/mdblist.ts` — same; verify the real response shape with a key first
- [ ] `tmdb/enrich.ts` — details by tmdbId (or `/find` by IMDb ID) → poster, year, blurb (tagline, else first sentence of overview)
- [ ] Recorded fixtures + unit tests for all of the above
- [ ] `scripts/probe-*.ts` to run a real URL end-to-end from the terminal

## Done when

- Probe script turns a real Trakt URL and a real MDBList URL into enriched Titles
- Merging a second Source into a list skips duplicates and Removed Titles (tested)
- All tests pass

## Needs from Paul

- Trakt client ID, MDBList API key, TMDB key in `.dev.vars`
- One or two real list URLs to test against
