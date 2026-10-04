# Sprint 14 — Nuvio collection export (optional)

**Status:** implemented; owner sample and live Nuvio acceptance pending

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

## Format verification

Implemented against the official Nuvio TV importer/exporter at commit
`4a91028b3e7ef44187ec25d598930da92b07c017`, checked on 5 October 2026. See
[the runbook](../nuvio/import-collection.md) for pinned source links and acceptance
steps. The importer accepts a JSON array and the legacy `catalogSources` shape
from this brief. Defaults are explicit: `TABBED_GRID`, `showAllTab: true`,
`pinToTop: false`, `POSTER`, `hideTitle: false`, no artwork. IDs remain stable for
the same addon ID and trimmed collection name (ignoring case); folder IDs follow the collection ID
and list ID. IDs are percent-encoded parts joined by `:`, so they hold no path or JSON punctuation.

No owner-exported sample has been supplied. The source-derived
[reference fixture](../nuvio/collection-reference.json) is hand-authored, not a
Nuvio-exported sample. Actual target-client import compatibility remains an
acceptance check, not a claim based on unit tests.

## Open questions and source-backed decisions

- [ ] **QUESTION — Sample Nuvio collection export.** Export an existing collection from Nuvio that has at least
      two folders, one holding a movie Catalog and one holding a series Catalog (or both in one
      folder). Save it as `docs/nuvio/collection-sample.json`. Remove anything private. Check whether
      the in-app file matches the API format above (one collection object or an array)
- [x] **Addon reference.** By addon ID (`manifest.id`), not manifest URL, so the downloaded file
      doesn't hold the secret addon slug
- [x] **Required vs optional fields.** Nuvio TV validates collection/folder IDs, titles,
      folders and sources; artwork is optional. Defaults are declared above and in the runbook.
- [x] **Import behaviour (Nuvio TV source).** Imports replace by ID, append new IDs,
      and preserve folder order. Listio IDs are stable across exports of the same name/addon,
      so that client replaces the prior Listio collection rather than matching by display name.
- [x] **Where it's imported.** TV Collections management supports file/paste/URL import; the documented entry point and steps are in the runbook. Target-client labels still need live acceptance.

## Tasks

- [x] `domain/nuvioCollection.ts`: pure builder that takes a collection name and an ordered list of
      `{ listId, name, types }` and returns the Nuvio collection JSON. One folder per list, named after the
      list, holding that list's movie and/or series Catalog (Catalog ID = Combined List ID). The exact shape
      follows the verified official importer schema; compare against the owner sample when supplied
- [x] Home **Export collection** action: tick existing lists, set a collection name and the folder order, then
      download `{name}.json`. A list's Catalog types come from its saved Titles. Lists with 0 saved Titles
      can't be ticked
- [x] Sprints 12–13 import results: an **Export these as a Nuvio collection** shortcut that opens the export with
      the imported lists ticked, in file order, and the collection name blank
- [x] Runbook `docs/nuvio/import-collection.md`: how to import the JSON in Nuvio, and the refresh/reinstall
      needed when lists are new
- [x] Unit tests for `nuvioCollection`: movie-only, series-only and mixed lists, folder order, and that the
      output matches the source-derived reference shape. UI tests cover selection, ordering, download,
      empty lists and import shortcuts. Owner-sample comparison remains pending.

## Done when

- The downloaded collection JSON imports into Nuvio and shows one folder per list, in the chosen order,
  each opening that list's Catalog(s)
- All tests pass

## Verification

- `pnpm test`: 22 test files, 205 tests passed.
- `pnpm build`: passed with zero errors; two existing `BeforeUnloadEvent.returnValue`
  deprecation hints remain in the editor/import components.
- `pnpm lint:check`: passed.
- `git diff --check`: passed.
- Live Nuvio import and owner-sample comparison: pending, with steps in the runbook.

## Not in this sprint

- Pushing the collection into Nuvio directly. The JSON is downloaded and imported by hand
