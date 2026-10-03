# Sprint 11 — Import several lists from one text file, export a Nuvio collection (optional)

**Status:** not started — blocked on the open questions below

## Goal

Turn one sectioned text file into several Combined Lists in one go, then download a Nuvio
collection JSON that puts them all in one collection. Each `## Header` becomes a new list named
after the header, filled with the lines under it. For example,
`docs/movie_lists/midnight_movies.md` becomes 24 lists, and the export makes one collection with
one folder per list. Builds on Sprint 07's paste matching. Nothing new on the matching side.

## Open questions (owner to supply before starting)

- [ ] **Sample Nuvio collection export.** Export an existing collection from Nuvio that has at least
      two folders, one holding a movie Catalog and one holding a series Catalog (or both in one
      folder). Save it as `docs/nuvio/collection-sample.json`. Remove anything private
- [ ] **Addon reference.** How the JSON points at an addon Catalog: by addon manifest URL, addon ID
      (`manifest.id`) or something else. The sample should show this. If it embeds the manifest URL,
      the export needs the secret addon slug, so confirm that's OK in a downloaded file
- [ ] **Required vs optional fields.** Which fields Nuvio needs on import (collection name, folder
      name, folder image/poster, IDs, order, version). If folder images are needed, say what to use
      (blank, the first Title's poster, or something else)
- [ ] **Import behaviour.** Does importing a collection with the same name create a duplicate or
      replace the old one? Are folders shown in file order?
- [ ] **Where it's imported.** The Nuvio screen and steps for importing the JSON, for the runbook

## Tasks

- [ ] `domain/pasteSections.ts`: split text on `## ` lines into `{ header, lines }[]`. Text before the first
      header is ignored. Each section's lines go through `pasteLines`
- [ ] Home **Import from text** action: paste text or upload a `.txt` or `.md` file. A preview lists each
      section with its header (editable as the list name), title count and a checkbox. Sections are unchecked
      by default if their header matches an existing list name (shows "name in use")
- [ ] **Create lists** makes one new Combined List per checked section, then matches each one through
      `POST /api/titles/match` in turn, with progress per list ("Modern Head Trips: 40 / 61")
- [ ] Each new list is left as a Draft with its matched Titles. A summary shows per-list counts and links to
      each list's editor, where the **Need a look** lines wait. Each list is saved on its own
- [ ] `domain/nuvioCollection.ts`: pure builder that takes a collection name and an ordered list of
      `{ listId, name, types }` and returns the Nuvio collection JSON. One folder per list, named after the
      list, holding that list's movie and/or series Catalog (Catalog ID = Combined List ID). Exact shape
      follows `docs/nuvio/collection-sample.json`
- [ ] **Download Nuvio collection** on the import summary: collection name (defaults to the file's first line,
      editable), downloads `{name}.json` built from the newly created lists in section order. A list's
      Catalog types come from its saved Titles, so the button is enabled once every list has been saved
      at least once. Lists still at 0 saved Titles are left out, with a note
- [ ] Home **Export collection** action: tick any existing lists, set a name and order, and download the same
      JSON. This covers re-exporting after edits, or building a collection from lists made by hand
- [ ] Runbook `docs/nuvio/import-collection.md`: how to import the JSON in Nuvio, and the refresh/reinstall
      needed when lists are new
- [ ] Unit tests: `pasteSections` (preamble ignored, empty sections, headers with `:` and `&`, repeated headers);
      `nuvioCollection` (movie-only, series-only and mixed lists, folder order, matches the sample's shape)

## Done when

- Importing `midnight_movies.md` creates 24 lists named after their headers, each mostly matched
- Each list can be reviewed, fixed and saved on its own, and shows in Nuvio
- The downloaded collection JSON imports into Nuvio and shows one folder per list, in file order, each
  opening that list's Catalog(s)
- All tests pass

## Not in this sprint

- Pushing the collection into Nuvio directly. The JSON is downloaded and imported by hand
- Re-importing a text file to update existing lists
