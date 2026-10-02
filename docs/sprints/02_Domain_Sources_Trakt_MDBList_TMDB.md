# Sprint 02 — Domain core & Sources: Trakt, MDBList, TMDB

**Status:** complete

## Goal

Given a Trakt or MDBList URL, produce enriched Titles and merge them into a Combined List
correctly — as pure, tested TypeScript, before any UI or storage exists.

## Tasks

- [x] `domain/types.ts` — Title, CombinedList, SourceRecord, SortOrder (plan §3)
- [x] `domain/slug.ts` — name → unique id (`spy-thrillers`, `spy-thrillers-2`)
- [x] `domain/merge.ts` — dedupe by IMDb ID, skip existing and Removed Titles, flag new, assign `addedSeq`
- [x] `domain/sort.ts` — newest (default) / oldest / A–Z / order added
- [x] `sources/detect.ts` — recognise Trakt (`/users/{u}/lists/{slug}`, `/lists/{id}`, incl. `app.trakt.tv` URLs) and MDBList URLs; clear error otherwise
- [x] `sources/trakt.ts` — paginated fetch, normalize, map types, skip no-IMDb items (counted)
- [x] `sources/mdblist.ts` — same; verify the real response shape with a key first
- [x] `tmdb/enrich.ts` — details by tmdbId (or `/find` by IMDb ID) → poster, year, blurb (tagline, else first sentence of overview)
- [x] Recorded fixtures + unit tests for all of the above
- [x] `scripts/probe-*.ts` to run a real URL end-to-end from the terminal

## Live verification (2026-10-03)

| Source  | URL                                                                        | Titles | Enriched |
| ------- | -------------------------------------------------------------------------- | ------ | -------- |
| Trakt   | https://app.trakt.tv/users/sonicwarrior/lists/star-wars-canon-timeline/eff | 22     | 21       |
| MDBList | https://mdblist.com/lists/garycrawfordgc/latest-tv-shows                   | 300    | 300      |

- The Trakt list also has episodes and seasons, which are ignored as intended. The one unenriched
  Title is a short that TMDB has no details for.
- Fixes found by the live run: Trakt's Cloudflare front returns 403 without a `User-Agent`, so the
  client now sends one; `app.trakt.tv` URLs (with a trailing view segment like `/eff`) are accepted
  and recorded as the classic `trakt.tv` URL.
- The real MDBList response matches the cursor/bucket shape the parser expected.
- Recorded (trimmed, keyless) fixtures: `trakt-live.json`, `mdblist-live.json`,
  `tmdb-{movie,tv,find}-live.json`. The hand-built fixtures stay for edge cases (missing IMDb ids etc.).

## Done when

- Probe script turns a real Trakt URL and a real MDBList URL into enriched Titles
- Merging a second Source into a list skips duplicates and Removed Titles (tested)
- All tests pass
