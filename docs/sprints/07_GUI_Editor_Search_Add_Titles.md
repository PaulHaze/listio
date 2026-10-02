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

## Done when

- A new list built only by search is saved and shows in Nuvio. Both of its Catalogs sit in one collection folder
- Searching a Title already in the list shows **In list**. Adding a Removed Title restores it
- Adding a Source to a hand-built list later doesn't duplicate the searched Titles
- A title with no IMDb ID shows a clear "can't add" message
- All tests pass

## Not in this sprint

- Drag-to-reorder. Hand-built lists use the existing sorts. "Order added" gives the order you added Titles in
- Cinemeta as a keyless search fallback
