# Sprint 05 — GUI: Editor — adding Sources

**Status:** not started

## Goal
In the editor, paste Source URLs and pull their Titles into a Draft, ready for review.

## Tasks
- [ ] React editor island mounted in `pages/lists/[id].astro`; loads saved list
- [ ] Draft state (plan §6): titles, removed, sources, sort, newIds, change count
- [ ] URL box + small `+` to add another; per-Source status (fetching / N Titles / N skipped / error)
- [ ] `POST /api/sources/fetch` — detect + fetch + normalize (Sprint 02 modules)
- [ ] Client-side merge into Draft (`domain/merge.ts`)
- [ ] `POST /api/titles/enrich` — ≤40 Titles per request; client runs ~3 chunks in parallel
- [ ] **Review List** button → review grid (basic render; full grid is Sprint 06)
- [ ] `PUT /api/lists/{id}` save endpoint (version check, 409 on conflict)

## Done when
- Pasting two real URLs yields a de-duplicated Draft with posters filling in progressively
- A 500+ Title Source enriches fully without hitting Worker limits
- Saving persists the list and Nuvio shows the new Titles
