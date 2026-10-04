# Sprint 14 — Nuvio collection export (optional)

**Status:** not started — blocked on the open questions below

## Goal

Download a Nuvio collection JSON that puts chosen Combined Lists into one collection, one folder per
list, so a set of lists (e.g. one imported in [Sprint 13](./13_Import_Multiple_Lists_From_Text.md))
can be added to Nuvio in one go instead of folder by folder.

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

For Listio, `addonId` is the configured addon ID (`src/addon/manifest.ts`, `ADDON_ID`, Sprint 10).
`catalogId` is the Combined List ID, with one `catalogSources` entry per type the list has. The docs'
push example sends only `id`, `title`, `viewMode` and `folders`, so the other collection fields look optional.

API notes (for a possible later direct push, still out of scope): `sync_pull_collections` /
`sync_push_collections` (`p_profile_id`, `p_collections_json`). A push **replaces the profile's whole
collections blob**, so anything left out is deleted. A direct push would have to pull, merge, then push.

## Open questions (owner to supply before starting)

- [ ] **QUESTION — Sample Nuvio collection export.** Export an existing collection from Nuvio that has at least
      two folders, one holding a movie Catalog and one holding a series Catalog (or both in one
      folder). Save it as `docs/nuvio/collection-sample.json`. Remove anything private. Check whether
      the in-app file matches the API format above (one collection object or an array)
- [x] **Addon reference.** By addon ID (`manifest.id`), not manifest URL, so the downloaded file
      doesn't hold the secret addon slug
- [ ] **QUESTION — Required vs optional fields.** Partly answered: the API push example needs only `id`, `title`,
      `viewMode` and `folders`, and images/emoji are optional. Confirm what in-app import needs, and
      pick defaults for `tileShape`/`hideTitle` (proposed: `POSTER`, `false`, no cover image)
- [ ] **QUESTION — Import behaviour.** Does importing a collection with the same name create a duplicate or
      replace the old one? Are folders shown in file order? (Collections have an `id`, so a stable
      ID across exports may let a re-import replace rather than duplicate)
- [ ] **QUESTION — Where it's imported.** The Nuvio screen and steps for importing the JSON, for the runbook

## Tasks

- [ ] `domain/nuvioCollection.ts`: pure builder that takes a collection name and an ordered list of
      `{ listId, name, types }` and returns the Nuvio collection JSON. One folder per list, named after the
      list, holding that list's movie and/or series Catalog (Catalog ID = Combined List ID). The exact shape
      follows `docs/nuvio/collection-sample.json`
- [ ] Home **Export collection** action: tick existing lists, set a collection name and the folder order, then
      download `{name}.json`. A list's Catalog types come from its saved Titles. Lists with 0 saved Titles
      can't be ticked
- [ ] Sprints 12–13 import results: an **Export these as a Nuvio collection** shortcut that opens the export with
      the imported lists ticked, in file order, and the collection name blank
- [ ] Runbook `docs/nuvio/import-collection.md`: how to import the JSON in Nuvio, and the refresh/reinstall
      needed when lists are new
- [ ] Unit tests for `nuvioCollection`: movie-only, series-only and mixed lists, folder order, and that the
      output matches the sample's shape

## Done when

- The downloaded collection JSON imports into Nuvio and shows one folder per list, in the chosen order,
  each opening that list's Catalog(s)
- All tests pass

## Not in this sprint

- Pushing the collection into Nuvio directly. The JSON is downloaded and imported by hand
