# Sprint 11 — Import several lists from one text file (optional)

**Status:** not started

## Goal

Turn one sectioned text file into several Combined Lists in one go. Each `## Header` becomes a
new list named after the header, filled with the lines under it. For example,
`docs/movie_lists/midnight_movies.txt` becomes 23 lists that can sit together in one Nuvio
collection. Builds on Sprint 07's paste matching. Nothing new on the matching side.

## Tasks

- [ ] `domain/pasteSections.ts`: split text on `## ` lines into `{ header, lines }[]`. Text before the first
      header is ignored. Each section's lines go through `pasteLines`
- [ ] Home **Import from text** action: paste text or upload a `.txt`. A preview lists each section with its
      header (editable as the list name), title count and a checkbox. Sections are unchecked by default if
      their header matches an existing list name (shows "name in use")
- [ ] **Create lists** makes one new Combined List per checked section, then matches each one through
      `POST /api/titles/match` in turn, with progress per list ("Modern Head Trips: 40 / 61")
- [ ] Each new list is left as a Draft with its matched Titles. A summary shows per-list counts and links to
      each list's editor, where the **Need a look** lines wait. Each list is saved on its own
- [ ] Unit tests: `pasteSections` (preamble ignored, empty sections, headers with `:` and `&`, repeated headers)

## Done when

- Importing `midnight_movies.txt` with the `CHECK BEFORE ADDING` section unchecked creates 23 lists
  named after their headers, each mostly matched
- Each list can be reviewed, fixed and saved on its own, and shows in Nuvio
- All tests pass

## Not in this sprint

- Creating the Nuvio collection automatically. Collections are built in Nuvio
- Re-importing a file to update existing lists
