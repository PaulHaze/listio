# Sprint 07 — GUI: Editor — search & add Titles

**Status:** implemented; acceptance pending

## Goal

Build a list by hand. Create "Genre Benders", search for "Being John Malkovich", add it,
save, and see it in a Nuvio collection. No Source is needed. A hand-built list is an ordinary
Combined List (ADR 0005), so Sources and searched Titles can be mixed in one list.

## Tasks

- [x] `tmdb/search.ts`: TMDB `GET /search/multi?query=…&include_adult=false`. Keep `movie` and `tv` results, drop
      `person`, map `tv` → `series`. Normalize to `{ tmdbId, type, name, year, poster }`: `title`/`name`,
      `release_date`/`first_air_date`, `w185` poster
- [x] `tmdb/lookup.ts`: `(tmdbId, type)` → full `Title` from one call,
      `GET /movie/{id}` or `/tv/{id}` with `append_to_response=external_ids`. This gives IMDb ID, poster, year and
      blurb (reuse `blurbFromTmdb`). A null `imdb_id` is a typed "no IMDb ID" result, not an exception
- [x] `GET /api/search?q=`: proxies `tmdb/search.ts`. Empty or 1-character query → `[]`. The TMDB key never reaches
      the browser
- [x] `POST /api/titles/lookup` `{ tmdbId, type }` → `Title`, or 422 "No IMDb ID, can't add"
- [x] `domain/merge.ts`: add `addTitle(draft, title)`. Already in `titles` → no-op (`duplicate`). In `removed` →
      restore it, because an explicit add overrides a removal. Otherwise → append with the next `addedSeq`,
      flag as new, `changes++`
- [x] Editor search panel: debounced input (~300 ms) and a poster grid of results. Each result shows `Title (Year)`
      and a Movie/Series badge. Its button reads **Add**, **✓ Added**, **In list** (disabled) or **Restore**
      (if Removed)
- [x] Added Titles go into the Draft and show in the review grid like Source Titles. Nothing reaches Nuvio until Save
- [x] The editor works for a list with zero Sources (empty state invites a search or a URL)
- [x] Recorded fixtures + unit tests: search normalizer (person dropped, tv → series, missing poster/date),
      lookup (with and without IMDb ID), `addTitle` (new / duplicate / restore)

### Paste a list of titles

Paste many titles at once, one per line, and have them found and added. For example, create
"Modern Head Trips" and paste every line from that section of `docs/movie_lists/midnight_movies.txt`.

- [x] `domain/pasteLines.ts`: parse pasted text into `{ line, name, year? }[]`. One title per line. Trailing
      `(YYYY)` becomes the year. Ignore blank lines and lines starting with `#` or `//`. Trim whitespace and
      a leading list marker (`-`, `*`, `1.`). Drop repeated lines
- [x] `tmdb/match.ts`: `(name, year?)` → `matched` (one `Title`) | `ambiguous` (up to 6 candidates) | `none`.
      Search `/search/movie` (with `year` when given), then `/search/tv` if no movie fits. **Confident** = exactly
      one result whose normalized name (case, punctuation, leading "The/A") equals the line's name, and whose
      year equals the given year (or there's no year and only one name match). Anything else is `ambiguous`.
      A confident match goes through `tmdb/lookup.ts`. No IMDb ID → `none` with that reason
- [x] `POST /api/titles/match` `{ lines: { name, year? }[] }` → one result per line, in order. Max 20 lines per
      request (stays under Workers subrequest limits). The client sends batches of 20 and shows progress
- [x] Editor **Paste titles** panel, next to search: a textarea and a **Find titles** button. Progress reads
      "Matching 40 / 61…". Matched Titles go into the Draft through `addTitle`, so duplicates, restores and
      **Show only new** all work as they do for search
- [x] Result summary: "52 added · 3 already in list · 6 need a look". **Need a look** shows each line with its
      candidates as a small poster grid (title, year, badge). Choose one → **Add**, or **Skip**. A `none` line
      shows "No match" and a search box prefilled with the line
- [x] Nothing reaches Nuvio until Save, as with search
- [x] Unit tests: `pasteLines` (years, blanks, comments, markers, duplicates, titles with brackets or colons,
      e.g. `2001: A Space Odyssey (1968)`), `match` confidence rules (exact, year mismatch, two same-name
      films, no year, no IMDb ID) from recorded fixtures

## Done when

- A new list built only by search is saved and shows in Nuvio. Both of its Catalogs sit in one collection folder
- Searching a Title already in the list shows **In list**. Adding a Removed Title restores it
- Adding a Source to a hand-built list later doesn't duplicate the searched Titles
- A title with no IMDb ID shows a clear "can't add" message
- Pasting the "Modern Head Trips" section into a new list of that name adds most titles automatically. The rest
  can be fixed in **Need a look** without leaving the editor. Saved, the list shows in Nuvio
- Pasting the same lines again adds nothing new (all "already in list")
- All tests pass

## Not in this sprint

- Drag-to-reorder. Hand-built lists use the existing sorts. "Order added" gives the order you added Titles in
- Cinemeta as a keyless search fallback
- Making several lists from one file (one per `##` header). That's Sprint 11

## Implementation and verification

Search, explicit additions/restores, and pasted title matching share the existing
Draft/review/Save flow. The unsaved change count is derived from the saved list,
so duplicate additions stay at zero and reversing an edit clears that change.

The match endpoint accepts batches of 20. Twenty TV matches can require 60 TMDB
requests (movie search, TV search, details), exceeding the Workers Free limit of 50. It reserves two searches per remaining line and caps external calls at 48.
When necessary its response includes a typed `lookup` continuation candidate;
the client automatically calls the lookup endpoint before completing the batch.
The ordinary `matchTitle(name, year, options)` function still returns only
`matched`, `ambiguous`, or `none`. This preserves automatic matching and input
order while keeping each request under budget. See [Cloudflare's subrequest
limits](https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/).

Verification: recorded TMDB search/details fixtures, full Vitest suite, Astro
check, production build, and ESLint. Local browser checks cover search/add,
Draft isolation before Save, repeated paste duplicates, explicit restore,
Movie/Series search results, and saving a zero-Source mixed list. The full
64-line Modern Head Trips section matched 49 automatically and presented 15
for review (mostly TMDB release-year differences and same-name films). Candidate
Add and Skip, plus the prefilled search for a no-match line, were verified in
the editor. Temporary local test data was deleted.

Deployed Workers and Nuvio acceptance (including both Catalogs in one folder)
remains pending; local Node development does not exercise the real Workers
runtime or Nuvio. No deployment is part of this implementation commit.

#### ✅ Summary of work — completed & audited 2026-10-03

_Full audit consolidation: [`audits/sprint-07-audit-summary.md`](../audits/sprint-07-audit-summary.md) (13 issues: 4 critical, 4 warnings, 5 suggestions. Astra's verdict was FAIL because of #1–#3. The owner ACTIONs below cover #2/#3; #1 is accepted as out of scope)._

**Files created / changed:**

- `src/tmdb/search.ts` **(new)**: normalizes TMDB search results into Candidates and searches `/search/multi`. Posters use the shared w185 constant.
- `src/tmdb/lookup.ts` **(new)**: TMDB details → Title with an IMDb ID. The stored poster now uses w342, the same as Source enrichment.
- `src/tmdb/match.ts` **(new)**: confident matching for pasted lines. A unique name match within ±2 years is accepted, and `&`, "and" and the articles The/A/An are ignored.
- `src/pages/api/search.ts`, `src/pages/api/titles/lookup.ts`, `src/pages/api/titles/match.ts` **(new)**: the routes. The match route fails one line (`retry: true`) instead of the whole batch, and still fails the batch on 401/403.
- `src/domain/pasteLines.ts` **(new)**: parses pasted lines. `src/domain/merge.ts`: `addTitle`.
- `src/components/editor/TitleDiscovery.tsx` **(new)**: the search and paste UI, the Need a look review, repeat-paste reuse, IMDb identity resolution and retrying failed lines at the end.
- `src/components/editor/api.ts` **(new)**: the shared `api`/`ApiError` helper, which tolerates non-JSON responses. It's used by `Editor.tsx` and `TitleDiscovery.tsx`.
- `src/styles/main.css`: discovery panel styles, with theme borders (`--background-300`).
- `test/title-discovery.test.ts` and the `test/fixtures/tmdb-search-*.json` recordings.

**Key decisions made:**

- Match batches of 20 with a typed `lookup` continuation to stay under the Workers 50-subrequest limit.
- ⚠️ Divergence from the spec's "year equals" rule (owner decision): searches are no longer year-filtered, and a unique name match within ±2 years is accepted. An exact-year match is preferred when there are several.
- Restores done through search or paste are flagged as new (owner decision). The grid's Restore isn't.
- A module-level TMDB → Title identity cache is shared by Add, labels and repeat-paste reconciliation.

**Audit outcomes (owner-actioned 2026-10-03):**

- 🔴 **#1 (Critical) — left as-is (owner):** non-Latin names normalize to empty. This is a personal tool, so Latin-alphabet titles are enough for now; revisit for a public version.
- 🔴 **#2 / #4 (Critical) — fixed:** the line → IMDb ID chosen in Need a look (by candidate or through the No-match search) is now remembered. A repeat paste reuses it: an active Title counts as "already in list" and a Removed one is restored. Ambiguous lines whose candidate is already in the Draft are settled the same way.
- 🔴 **#3 / #6 (Critical/Warning) — fixed:** when the Draft has Titles without a TMDB ID, search results of those types that don't match by TMDB ID get a background IMDb lookup (cached), so In list / Restore show correctly before any Add.
- 🟡 **#5 (Warning) — fixed:** `lookupTitle` stores a w342 poster through the exported `posterFromTmdb`/`TMDB_IMAGE_URL`, and search uses `TMDB_SEARCH_IMAGE_URL`.
- 🟡 **#7 (Warning) — no action:** the same issue as #1.
- 🟡 **#8 (Warning) — fixed:** errors are now handled per line in the match route. Failed lines are retried once, in batches, at the end of the paste.
- 🔵 **#9 (Suggestion) — fixed:** the year tolerance is ±2 (owner widened it from ±1).
- 🔵 **#10 (Suggestion) — left as-is (owner):** restores from search or paste stay flagged as new. The difference is explained in the audit summary.
- 🔵 **#11 (Suggestion) — fixed:** the shared `src/components/editor/api.ts` helper.
- 🔵 **#12 (Suggestion) — fixed:** borders use `var(--background-300)`. A full styling pass is planned for the end of the build.
- 🔵 **#13 (Suggestion) — fixed:** `&`/"and" are dropped on both sides and a leading "An" is ignored. The search query itself is unchanged.

`tsc --noEmit` is clean and Vitest passes (84 tests: ±2-year, ampersand and per-line-failure tests added). Prettier was applied to the touched files. ESLint reports only 3 existing `_input` unused-var errors in `test/title-discovery.test.ts`. There are no automated component tests for the repeat-paste and identity UI flows, so they still need a browser check.
