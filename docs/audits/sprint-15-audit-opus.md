## Audit: last commit 8fc62f3 — feat: create Nuvio collections from sectioned text

_Scope: Sprint 15 — New collection from text (from docs/sprints/15_Create_Collection_Option.md)_

Files audited (source only; tests and docs excluded at owner's request): `src/client/downloadCollection.ts`, `src/components/export/ExportCollection.tsx`, `src/components/import/CollectionDialog.tsx`, `src/components/import/ImportFromText.tsx`, `src/domain/nuvioCollection.ts`, `src/domain/pasteSections.ts`, `src/pages/export.astro`, `src/pages/import.astro`, `src/pages/index.astro`, `src/styles/main.css`.

**Scope match:** every task in the sprint is delivered: the Home entry point, collection mode on `/import`, error codes, the shared download helper, the modal, `collectionExportUrl(…, name)` and the `/export` prefill. Nothing strays into the "Not in this sprint" items. There's no auto-download, no collection storage, and the parser rules are unchanged apart from the new error codes.

### Warning

1. **In collection mode, unticking no longer works for recovery, but the page still tells users to untick.** `src/components/import/ImportFromText.tsx:94-103` checks header collisions with *every* section treated as selected. The queue panel at `ImportFromText.tsx:496-500` still says "After closing or reloading, re-paste the file and untick already-created lists." In collection mode, once the KV index catches up, those already-created headers raise `existing-list` errors, and unticking can't clear them. Import stays blocked until the user deletes those sections from the text. Even if they do, the downloaded collection only holds the lists created in the second run. This is a conflict in the sprint doc itself: Behaviour 2 says "renaming/unticking … work exactly as in Sprint 13", while Behaviour 4 says existing-list errors must be fixed in the text box. The code follows Behaviour 4.
   **Fix (owner decision):** either (a) in collection mode, change the recovery wording to "remove already-created sections from the text, then use **Export these as a Nuvio collection** (or `/export`) to build the full collection", or (b) apply `existing-list` only to selected sections, so unticking works again, and keep `duplicate-header` on all sections.

2. **Clashes caused by renaming in the preview get the "edit the text box" wording, and editing the text box wipes the user's renames.** `ImportFromText.tsx:123-134` rewrites *every* `duplicate-header`/`existing-list` error, including those from `sectionErrors`, which use the edited preview names. Suppose two headers are unique in the text and the user renames one preview field to match the other, or to match an existing list. They're then told "the header … is used twice. Edit the text box to fix it." That header isn't duplicated in the text. Any edit to the textarea calls `replaceText` (`ImportFromText.tsx:209-223`), which rebuilds `preview` and throws away all renames and unticks.
   **Fix:** apply the collection wording (with `sectionId: undefined`) only to `headerErrors`. Leave preview-derived errors with Sprint 13's wording and their `sectionId`, so they show next to the field the user just edited. Drop a preview error when a header error with the same `code` and `line` already exists, instead of deduplicating on the message.

### Suggestion

3. **A prefilled title that's blank or too long blocks Import without saying why.** The title error only shows when `collectionTouched` is set (`ImportFromText.tsx:305`), and that's only set by `onChange`. If someone opens `/import?collection=` (blank, which the sprint doc allows: "even if blank") or a link with a 101-character title, then pastes valid text, Import stays disabled with no message. The sprint's UI test says "a blank or 101-character title blocks Import *with the message*."
   **Fix:** show the error when `collectionTouched || textTouched`.

4. **The closed dropdown on Home probably stretches to the height of the open one.** Both `<details class="panel new-list">` are now flex items inside `.form-row` (`src/pages/index.astro:33`). `.form-row` (`src/styles/main.css:287-291`) has no `align-items`, so it defaults to `stretch`. When **+ New collection** is open, the closed **+ New list** panel should grow to the same height and look like an empty box. I haven't checked this in a browser.
   **Fix:** add `align-items: flex-start` to this container, using a modifier class so other `.form-row` uses aren't affected.

5. **Screen readers announce the download message twice.** `downloadMessage` is shown inside the dialog (`CollectionDialog.tsx:67`) and on the page (`ImportFromText.tsx:532-534`), both as `role="status"`. While the dialog is open, the success message is announced twice.
   **Fix:** show the page copy only when `!dialogOpen`.

6. **Hard-coded `100` beside the shared constant.** The new Home input uses `maxlength={100}` (`index.astro:58`), while the **+ New list** input next to it uses `MAX_NAME_LENGTH`. Use the constant so the two stay in step.

### Positive observations

- The new error codes (`no-headers`, `duplicate-header`, `existing-list`, plus `name`/`previousLine`) in `src/domain/pasteSections.ts:7-9` let the component change the wording without matching on text, as Behaviour 4 asks. Sprint 13's messages are unchanged.
- `download()` (`ImportFromText.tsx:164-194`) builds the file at click time from the page's completed runs via `indexEntry`, in file order, leaving out skipped and empty runs. That avoids the KV index delay (Behaviour 5), and Need a look picks made before the click are included.
- `downloadCollection` (`src/client/downloadCollection.ts`) is a clean extraction. The `try/finally` now removes the anchor and revokes the URL even if `click()` throws, which the old inline code didn't do.
- The `<list-manager>` early return (`index.astro:130`) is the minimal fix the task asked for. The GET form navigates normally and the create/rename paths are untouched.
- `CollectionDialog` uses a native `showModal()`, moves focus to Close, handles Escape through `cancel`, and returns focus to the element that had it before. That meets the accessibility requirement in the task list.
- `offered` (a ref) makes sure the modal opens on its own only once, and `collectionReady` waits for both the queue and any active run to go idle.
