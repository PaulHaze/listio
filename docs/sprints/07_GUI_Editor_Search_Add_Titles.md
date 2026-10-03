# Sprint 07 — GUI: Editor — search & add Titles

**Status:** not started

## Goal

Build a list by hand. Create "Genre Benders", search for "Being John Malkovich", add it,
save, and see it in a Nuvio collection. No Source is needed. A hand-built list is an ordinary
Combined List (ADR 0005), so Sources and searched Titles can be mixed in one list.

## Tasks

- [ ] `tmdb/search.ts`: TMDB `GET /search/multi?query=…&include_adult=false`. Keep `movie` and `tv` results, drop
      `person`, map `tv` → `series`. Normalize to `{ tmdbId, type, name, year, poster }`: `title`/`name`,
      `release_date`/`first_air_date`, `w185` poster
- [ ] `tmdb/lookup.ts`: `(tmdbId, type)` → full `Title` from one call,
      `GET /movie/{id}` or `/tv/{id}` with `append_to_response=external_ids`. This gives IMDb ID, poster, year and
      blurb (reuse `blurbFromTmdb`). A null `imdb_id` is a typed "no IMDb ID" result, not an exception
- [ ] `GET /api/search?q=`: proxies `tmdb/search.ts`. Empty or 1-character query → `[]`. The TMDB key never reaches
      the browser
- [ ] `POST /api/titles/lookup` `{ tmdbId, type }` → `Title`, or 422 "No IMDb ID, can't add"
- [ ] `domain/merge.ts`: add `addTitle(draft, title)`. Already in `titles` → no-op (`duplicate`). In `removed` →
      restore it, because an explicit add overrides a removal. Otherwise → append with the next `addedSeq`,
      flag as new, `changes++`
- [ ] Editor search panel: debounced input (~300 ms) and a poster grid of results. Each result shows `Title (Year)`
      and a Movie/Series badge. Its button reads **Add**, **✓ Added**, **In list** (disabled) or **Restore**
      (if Removed)
- [ ] Added Titles go into the Draft and show in the review grid like Source Titles. Nothing reaches Nuvio until Save
- [ ] The editor works for a list with zero Sources (empty state invites a search or a URL)
- [ ] Recorded fixtures + unit tests: search normalizer (person dropped, tv → series, missing poster/date),
      lookup (with and without IMDb ID), `addTitle` (new / duplicate / restore)

### Paste a list of titles

Paste many titles at once, one per line, and have them found and added. For example, create
"Modern Head Trips" and paste every line from that section of `docs/movie_lists/midnight_movies.txt`.

- [ ] `domain/pasteLines.ts`: parse pasted text into `{ line, name, year? }[]`. One title per line. Trailing
      `(YYYY)` becomes the year. Ignore blank lines and lines starting with `#` or `//`. Trim whitespace and
      a leading list marker (`-`, `*`, `1.`). Drop repeated lines
- [ ] `tmdb/match.ts`: `(name, year?)` → `matched` (one `Title`) | `ambiguous` (up to 6 candidates) | `none`.
      Search `/search/movie` (with `year` when given), then `/search/tv` if no movie fits. **Confident** = exactly
      one result whose normalized name (case, punctuation, leading "The/A") equals the line's name, and whose
      year equals the given year (or there's no year and only one name match). Anything else is `ambiguous`.
      A confident match goes through `tmdb/lookup.ts`. No IMDb ID → `none` with that reason
- [ ] `POST /api/titles/match` `{ lines: { name, year? }[] }` → one result per line, in order. Max 20 lines per
      request (stays under Workers subrequest limits). The client sends batches of 20 and shows progress
- [ ] Editor **Paste titles** panel, next to search: a textarea and a **Find titles** button. Progress reads
      "Matching 40 / 61…". Matched Titles go into the Draft through `addTitle`, so duplicates, restores and
      **Show only new** all work as they do for search
- [ ] Result summary: "52 added · 3 already in list · 6 need a look". **Need a look** shows each line with its
      candidates as a small poster grid (title, year, badge). Choose one → **Add**, or **Skip**. A `none` line
      shows "No match" and a search box prefilled with the line
- [ ] Nothing reaches Nuvio until Save, as with search
- [ ] Unit tests: `pasteLines` (years, blanks, comments, markers, duplicates, titles with brackets or colons,
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
