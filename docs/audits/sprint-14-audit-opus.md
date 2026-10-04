## Audit: last commit f70cc65 — feat: add Nuvio collection export

_Scope: Sprint 14 — Nuvio collection export (from docs/sprints/14_Nuvio_Collection_Export.md)_

Files audited: `src/domain/nuvioCollection.ts`, `src/components/export/ExportCollection.tsx`, `src/pages/export.astro`, `src/addon/manifest.ts`, `src/components/import/ImportFromText.tsx`, `src/pages/index.astro`, `test/nuvio-collection.test.ts`, `test/export-collection.test.tsx`, `test/import-review.test.tsx` (diff). Also checked against `docs/nuvio/import-collection.md`, `docs/nuvio/collection-reference.json`, `src/storage/lists.ts`, `src/pages/addon/[secret]/manifest.json.ts` and `src/middleware.ts`.

**Scope match:** All five sprint tasks are delivered: the builder, the Home export action, the import-results shortcut, the runbook, and the unit and UI tests. The two "Done when" items are still open, and the sprint doc says so honestly: the owner-exported sample (the open QUESTION) and a live Nuvio import. Nothing strays into the out-of-scope direct push.

### Warning

1. **Collection and folder IDs embed raw user text, including JSON punctuation.** `src/domain/nuvioCollection.ts:27` builds `listio:["org.listio.addon","Weekend Picks"]`, and `:42` builds `listio-folder:["…","listId"]`. The collection title is free text, so `/`, `?`, `#`, `&`, quotes and emoji all end up inside the ID. The runbook only confirms that Nuvio TV checks IDs are present. It doesn't say whether Nuvio uses IDs in navigation routes or as file or preference keys, where a `/` or `"` could break something. The unit tests only round-trip the IDs in JS, and nothing has been imported live yet. **Fix:** keep the same stable inputs but encode them into a safe form, e.g. `listio-${base64url(sha256(addonId + '\0' + title))}`, or at least `encodeURIComponent` each part. This keeps the "same name + addon gives the same ID" rule (sprint doc, *Format verification*) and removes the charset risk. Changing it now is free, because no exported file exists in the wild yet. After the first live import, changing it would create duplicate collections.

2. **Folder IDs aren't scoped to the collection.** At `src/domain/nuvioCollection.ts:42`, the folder ID depends only on `addonId` and `listId`. If the same Combined List is exported into two different collections, both get the identical folder ID. The API brief describes `id` as a "Unique folder ID" (sprint doc, field table). Whether Nuvio needs folder IDs unique per collection or globally isn't covered by the runbook evidence. This follows the documented decision "folder IDs follow list IDs", so it may be intentional. Please confirm. **Fix:** derive the folder ID from the collection ID plus `listId`. Renaming a list still keeps its folder identity, and the collision goes away.

3. **Preselected imported lists are dropped without telling the user.** `src/components/export/ExportCollection.tsx:18-24` silently filters out any `?list=` ID that isn't in the index or has no types. `/export` reads the index from KV (`src/pages/export.astro:8`), and KV reads can be stale for up to about a minute after the import's saves (the runbook already warns that "KV propagates"). So a user who clicks **Export these as a Nuvio collection** straight after an import can land on a page with some or none of the lists ticked, and nothing explains why. This undermines the sprint task "opens the export with the imported lists ticked, in file order". **Fix:** count the requested IDs that were dropped and show a line such as "2 imported lists aren't available yet — refresh in a minute", or list them by ID.

### Suggestion

1. **The addon ID is worked out in two places.** `src/pages/export.astro:24` and `src/pages/addon/[secret]/manifest.json.ts:14` each do their own version of `env.ADDON_ID?.trim() || default`. If the collection's `addonId` ever differs from the manifest's `id`, every folder points at an addon Nuvio doesn't have, and no test would catch it because neither page is tested. **Fix:** add one `resolveAddonId(env)` helper and use it in both places.

2. **`DEFAULT_ADDON_ID` lives in the export module.** `src/addon/manifest.ts:2` now imports a core addon constant from `domain/nuvioCollection.ts`, so the dependency runs the wrong way: the addon depends on an optional export feature. **Fix:** move the constant (and the helper from Suggestion 1) into a small `addon/config.ts` or similar, and have both modules import it from there.

3. **The collection ID is case-sensitive on the name.** Exporting "Weekend" and later "weekend" creates two collections in Nuvio, not one replacement. The UI note at `ExportCollection.tsx:82-85` says "the same name" without mentioning case. **Fix:** either normalise case in the ID input, or mention it in the note. This is low priority.

### Positive observations

- The builder is pure, validates every precondition (blank name, empty selection, duplicate or unnamed lists, typeless lists), and puts types in a fixed `movie, series` order no matter what order they arrive in. The mixed-list test covers that, including duplicates.
- The private addon URL never reaches the downloaded file (sprint decision *Addon reference*), and a test asserts it (`test/nuvio-collection.test.ts:69`).
- The import shortcut only includes runs that are `completed` and have saved Titles. It is tested for a pending save, a skipped empty section, a renamed section, and a later section still matching. The existing `beforeunload` guard protects the mid-queue case.
- The download path cleans up properly: the object URL is revoked, the anchor is removed, and failures show a retryable error (tested).
- `collectionFilename` handles Windows-reserved characters, control characters, and trailing dots and spaces, and falls back to a default name.
- The docs are candid: the reference fixture is labelled as hand-authored, the evidence is pinned to a specific Nuvio commit, and the acceptance steps still to do are listed.
