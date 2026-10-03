# Sprint 11 — Import several lists from one text file, export a Nuvio collection (optional)

**Status:** not started — blocked on the open questions below

## Goal

Turn one sectioned text file into several Combined Lists in one go, then download a Nuvio
collection JSON that puts them all in one collection. Each `## Header` becomes a new list named
after the header, filled with the lines under it. For example,
`docs/movie_lists/midnight_movies.md` becomes 24 lists, and the export makes one collection with
one folder per list. Builds on Sprint 07's paste matching. Nothing new on the matching side.

## Nuvio collection format (from the public API docs)

Source: [Nuvio public API](https://nuvio.tv/docs) (raw: `https://nuvio.tv/docs/nuvio-public-api.md`,
v1.3, 20 Aug 2026), Collections section. This is the sync API's format. The in-app import file may
differ, so check it against the sample below.

Each profile stores its collections as one JSON array (`collections_json`):

```json
[
	{
		"id": "collection-1",
		"title": "Weekend Picks",
		"backdropImageUrl": "https://cdn.example.com/backdrops/weekend.jpg",
		"pinToTop": true,
		"viewMode": "TABBED_GRID",
		"showAllTab": true,
		"folders": [
			{
				"id": "folder-1",
				"title": "Sci-Fi",
				"coverImageUrl": "https://cdn.example.com/folders/scifi.jpg",
				"coverEmoji": "🚀",
				"tileShape": "LANDSCAPE",
				"hideTitle": false,
				"catalogSources": [
					{
						"addonId": "com.example.catalog",
						"type": "movie",
						"catalogId": "top"
					}
				]
			}
		]
	}
]
```

| Object            | Field              | Type    | Notes                                    |
| ----------------- | ------------------ | ------- | ---------------------------------------- |
| Collection        | `id`               | string  | Unique collection ID                     |
|                   | `title`            | string  | Collection name                          |
|                   | `backdropImageUrl` | string  | Optional                                 |
|                   | `pinToTop`         | boolean | Pin to top of home screen                |
|                   | `viewMode`         | string  | `TABBED_GRID`, `ROWS` or `FOLLOW_LAYOUT` |
|                   | `showAllTab`       | boolean | Show "All" tab in tabbed view            |
|                   | `folders`          | array   | Folder objects, in display order         |
| Folder            | `id`               | string  | Unique folder ID                         |
|                   | `title`            | string  | Folder name                              |
|                   | `coverImageUrl`    | string  | Optional                                 |
|                   | `coverEmoji`       | string  | Optional                                 |
|                   | `tileShape`        | string  | `POSTER`, `LANDSCAPE` or `SQUARE`        |
|                   | `hideTitle`        | boolean | Hide the tile title text                 |
|                   | `catalogSources`   | array   | Catalog references                       |
| Catalog reference | `addonId`          | string  | Addon's `manifest.id`                    |
|                   | `type`             | string  | `movie` or `series`                      |
|                   | `catalogId`        | string  | Catalog ID                               |

For Listio: `addonId` = `com.paulhaze.listio` (`src/addon/manifest.ts`), `catalogId` = the Combined
List ID, and there's one `catalogSources` entry per type the list has. The docs' push example sends only
`id`, `title`, `viewMode` and `folders`, so the other collection fields look optional.

API notes (for a possible later direct push, still out of scope): `sync_pull_collections` /
`sync_push_collections` (`p_profile_id`, `p_collections_json`). A push **replaces the profile's whole
collections blob**, so anything left out is deleted. A direct push would have to pull, merge, then push.

## Open questions (owner to supply before starting)

- [ ] **Sample Nuvio collection export.** Export an existing collection from Nuvio that has at least
      two folders, one holding a movie Catalog and one holding a series Catalog (or both in one
      folder). Save it as `docs/nuvio/collection-sample.json`. Remove anything private. Check whether
      the in-app file matches the API format above (one collection object or an array)
- [x] **Addon reference.** By addon ID (`manifest.id`), not manifest URL, so the downloaded file
      doesn't hold the secret addon slug (see format above)
- [ ] **Required vs optional fields.** Partly answered: the API push example needs only `id`, `title`,
      `viewMode` and `folders`, and images/emoji are optional. Confirm what in-app import needs, and
      pick defaults for `tileShape`/`hideTitle` (proposed: `POSTER`, `false`, no cover image)
- [ ] **Import behaviour.** Does importing a collection with the same name create a duplicate or
      replace the old one? Are folders shown in file order? (Collections have an `id`, so a stable
      ID across exports may let a re-import replace rather than duplicate)
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
