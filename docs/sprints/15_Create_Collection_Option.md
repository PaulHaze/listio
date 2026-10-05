# Sprint 15 — New collection from text

**Status:** implemented; acceptance pending

## Goal

Add a **+ New collection** option beside **+ New list** on Home. You enter a collection title, paste
a sectioned file (like `docs/movie_lists/midnight_movies.md`), and get one saved Combined List per
`## ` header, followed by a Nuvio collection JSON named after the title, with one folder per list.

This sprint only adds an entry point and connects existing features. Sectioned parsing, the
one-list-at-a-time queue, Need a look and recovery come from
[Sprint 13](./13_Import_Multiple_Lists_From_Text.md). The collection JSON comes from
[Sprint 14](./14_Nuvio_Collection_Export.md). The parsing rules, matching and save path don't change.
[ADR 0007](../adr/0007-public-list-builder-byok.md) describes the same "sectioned file → lists +
collection JSON" flow for a possible public version.

Acceptance fixture: `test/fixtures/midnight_movies.md` (25 sections, the last one TV series).

## What already exists

| Need                                          | Where                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Split text on `## ` headers, with line errors | `src/domain/pasteSections.ts` (`parseImport(text, 'multiple')`, `validateImportSections`)                                 |
| Preview, rename/untick, queue, review, resume | `src/components/import/ImportFromText.tsx` (Multiple lists mode), `src/client/importQueue.ts`, `src/client/importList.ts` |
| Collection JSON, file name, export link       | `src/domain/nuvioCollection.ts` (`buildNuvioCollection`, `collectionFilename`, `collectionExportUrl`)                     |
| Download a JSON file in the browser           | `src/components/export/ExportCollection.tsx` (blob + anchor click, revoke, retryable error)                               |
| A list's ID, name and Catalog types           | `src/storage/lists.ts` (`indexEntry`, pure)                                                                               |
| Addon ID used in collection JSON              | `src/domain/addonId.ts` (`resolveAddonId`)                                                                                |
| Home **+ New list** dropdown                  | `src/pages/index.astro` (`<details class="panel new-list">` inside `<list-manager>`)                                      |

**What's missing:** a Home entry point, a collection-title step, and a way to download the
collection straight from the import results. Listio doesn't store collections. A collection exists
only as the JSON downloaded from Sprint 14's builder. This sprint doesn't change that (see open questions).

## Behaviour

1. **Home.** Add **+ New collection** beside **+ New list**. It opens a dropdown panel, built the
   same way as **+ New list**, holding a **Collection title** field (required, 100 characters max,
   at least one non-space character) and a **Paste lists** button. Submitting creates nothing. It
   opens `/import?collection={title}`. **+ New list** stays as it is. Give both `<details>` the same
   `name` so that opening one closes the other.
2. **Collection mode on `/import`.** When the `collection` query parameter is present (even if
   blank), the page heading reads **New collection**. The import runs in Multiple lists mode with
   the Single/Multiple toggle and the single **List name** field hidden. An editable **Collection
   title** field is shown, prefilled from the query. The textarea, upload, live section preview,
   renaming/unticking, errors, queue, Need a look, Continue/Skip and the unload warning work exactly
   as in Sprint 13. Without the parameter, `/import` doesn't change.
3. **Validation.** **Import** is disabled until the trimmed collection title is 1–100 characters, as
   well as the existing Multiple-mode checks. Errors show once the field has been edited:

   | Problem                      | Message                                                                         |
   | ---------------------------- | ------------------------------------------------------------------------------- |
   | Blank or over-long title     | `Enter a collection title of 100 characters or fewer.`                          |
   | Paste has no `## ` headers   | `No "## " list headers found. A collection needs a "## " header for each list.` |
   | Text before the first header | Sprint 13's existing message, with its line number                              |
   | Duplicate headers            | See Behaviour 4                                                                 |

   In collection mode, the no-headers message replaces Sprint 13's "Switch to Single list" wording,
   because that toggle is hidden. A single header is valid: the collection gets one folder.

4. **Duplicate headers.** In collection mode, two `## ` headers with the same name (trimmed,
   case-insensitive) are an error that blocks Import. Show
   `Lines {a} and {b}: the header "{name}" is used twice. Each header must be unique. Edit the text box to fix it.`
   next to the text box. Reuse Sprint 13's duplicate check in `validateImportSections` and give it a
   stable marker (e.g. `code: 'duplicate-header'`) so the component can swap the wording without
   matching on text. The user fixes it by editing the pasted text, and the preview updates live, so
   the error clears once the headers are unique. A header that matches a list that already exists is
   the same kind of error: show `Line {n}: a list named "{name}" already exists. Change the header in the text box.`
   with a stable marker (e.g. `code: 'existing-list'`), and fix it by editing the text. Unticking or
   renaming a section in the preview doesn't clear these header errors: a partial collection under
   the same title would replace the full one in Nuvio. To recover after a reload, the user removes
   the already-created sections from the text, imports the rest, then builds the full collection in
   `/export`. The existing-list message and the queue's recovery note say so in collection mode.
   A clash made by renaming in the preview keeps Sprint 13's wording beside the renamed field. Listio keeps no record of collection names, so a repeated collection title can't
   be checked. Sprint 14 derives the Nuvio collection ID from the addon ID and the trimmed,
   case-insensitive title. Importing a file with a title already used in Nuvio **replaces** that
   collection. Show Sprint 14's existing note next to the title field.
5. **Export modal.** When the queue has no unfinished sections (every section imported and approved,
   or skipped) and at least one list finished with saved Titles, open a modal automatically. It
   shows the collection title, the folder count and **Download collection**. It can be closed, and a
   **Download collection** button stays on the results so it can be reopened. Build the file from the page's completed runs
   (`indexEntry(run.state.list)`), in file order, leaving out skipped sections. Do not use the KV
   index, so the download doesn't hit the up-to-a-minute index delay that
   `ExportCollection` warns about. Use the current collection title and `collectionFilename`. Build at
   click time, so Need a look picks made before the click are included (e.g. a series added to a
   movie list). On success, show `Collection downloaded with N folders. Import the JSON in Nuvio.`
   If Titles are resolved afterwards, say that downloading again picks them up. The file only
   downloads when the user clicks the button, never automatically.
6. **Reorder or partial export.** The existing **Export these as a Nuvio collection** link stays. In
   collection mode it also carries the title (`/export?list=…&name=…`), and `/export` prefills
   **Collection name** from `name`. Use it to reorder folders, or to export before every section has
   finished.

## Tasks

- [x] Home: **+ New collection** `<details>` beside **+ New list**, with a GET form to `/import`
      (`name="collection"`, `required`, `maxlength` 100, a pattern that rejects all-space input),
      both details sharing one `name`. The `<list-manager>` submit handler currently calls
      `preventDefault()` on every form inside it and treats any non-`create` form as a rename. Make
      it return early unless `data-action` is `create` or `rename`, so the new form navigates
      normally
- [x] `src/pages/import.astro`: read `collection` from the query and pass `initialCollection` and
      `addonId={resolveAddonId(env.ADDON_ID)}` to `ImportFromText`. Switch the page title, heading and
      intro text in collection mode
- [x] `ImportFromText` collection mode: force `multiple`, hide the toggle, add the `#collection-title`
      field and its validation to the Import gate, and add the no-headers wording. Keep one parser.
      Give the existing no-headers error a stable marker (e.g. `code: 'no-headers'` on `ImportError`)
      so the component can swap the message without matching on its text
- [x] Extract the blob/anchor download from `ExportCollection` into a small shared client helper
      (e.g. `src/client/downloadCollection.ts`), and use it for both the export page and the import
      page's **Download collection**. Don't change the export page's behaviour
- [x] Export modal (accessible dialog: focus moves in, Escape and a close button dismiss it) that
      opens when the queue finishes, plus a **Download collection** button on the results to reopen
      it, as described in Behaviour 5
- [x] `collectionExportUrl(listIds, name?)` adds `name` when it's given. `/export` passes
      `initialName` from `?name=` to `ExportCollection`
- [x] Docs: a **Collection** entry in `CONTEXT.md` (a Nuvio collection: one folder per Combined List,
      downloaded as JSON, not stored by Listio). Add the New collection route to
      `docs/nuvio/import-collection.md` step 2 and to the README usage steps. Add row 15 to
      `docs/sprints/README.md`
- [x] Unit tests (`test/import-parser.test.ts`, `test/nuvio-collection.test.ts`): the no-headers error
      carries its marker, and the existing message is unchanged. Duplicate headers (differing only in
      case or spacing) give the `duplicate-header` error naming both lines. A header matching an
      existing list gives `existing-list`. Outside collection mode both messages are unchanged. `collectionExportUrl` encodes a
      title with spaces, `&` and `'`, keeps list order, and leaves the URL unchanged without a name
- [x] UI tests (`// @vitest-environment happy-dom`, React `act`, stubbed `fetch`, following
      `test/import-review.test.tsx`), in `test/import-review.test.tsx` or a new
      `test/new-collection.test.tsx`:
  - Collection mode prefills the title, hides the toggle and the List name field, and shows the
    section preview.
  - Pasting two identical headers disables Import and shows the "Each header must be unique. Edit
    the text box" message. Editing one header clears it and enables Import.
  - A blank or 101-character title blocks Import with the message. A paste with no headers shows
    the collection wording, not "Switch to Single list".
  - A full run with a skipped section and a series section: the export modal stays closed
    while the queue is unfinished. It opens once the last section finishes, and **Download collection** then downloads `{title}.json` whose folders are the completed
    lists in file order, with series Catalog types, and without the skipped section. The fetch mock
    gets no `/api/lists` GET for the index.
  - A Need a look pick made before downloading changes the folder's Catalog types.
  - The export link carries `name`.
  - `ExportCollection` prefills `initialName`. Existing `/import` and `/export` tests pass unchanged.
- [x] Manual check on Home (Astro pages have no unit tests, as in Sprint 04): **+ New list** still
      creates and opens a list. The New collection form navigates and sends no `POST /api/lists`.
      All-space titles are refused. Opening one dropdown closes the other

## Done when

- From Home, **+ New collection** → title → paste `test/fixtures/midnight_movies.md` creates 25
  saved lists in section order. The export modal then opens, and **Download collection** gives one JSON titled with the entered
  title, with 25 folders named after the headers, in file order, the last one a series Catalog
- A blank title, a paste with no headers, duplicate headers, or text above the first header blocks Import with a
  clear message
- **+ New list** and plain `/import` (Single and Multiple) work as before
- The downloaded file imports into Nuvio and shows one folder per list (live acceptance, as for
  Sprint 14)
- `pnpm test`, `pnpm build` and `pnpm lint:check` pass

## Verification

- `pnpm test`: 212 tests passed across 22 files.
- `pnpm build`: passed; type check reports zero errors and two existing `returnValue` deprecation hints.
- `pnpm lint:check`: passed.
- Browser Home check: opening either dropdown closes the other; all-space titles fail HTML validation; the collection form navigates with its encoded title and sends no create request. New list still sends its create request and opens the returned list (intercepted response; no local data was created).
- Download tests reset the fetch mock after import completes and verify downloading does not fetch the KV index. The existing import save path still checks saved names before creating each list, as required by Sprint 13.
- Live Nuvio device import and the full 25-section fixture with live TMDB matching remain owner acceptance checks.

## Open questions

- [x] **RESOLVED — Store collections in Listio?** No. Each list is stored individually as it is
      today. In collection mode the pasted lists are also offered as an exportable JSON collection
      with the typed title, in a modal once every title is added and approved. To get a collection
      again, the user repeats the flow. Home doesn't group lists, and a repeated title can't be
      detected (importing it replaces that collection in Nuvio)
- [x] **RESOLVED — Duplicate headers.** Duplicate headers in a paste are an error. The user is told
      headers must be unique and to fix it in the text box (Behaviour 4). List names are not
      prefixed with the collection title
- [x] **RESOLVED — Header matching an existing list.** Collection mode treats it like a duplicate
      header: an error telling the user to change the header in the text box (Behaviour 4)
- [x] **RESOLVED — Paste on Home or on `/import`?** The Home dropdown takes only the title, then
      goes to `/import`, which expects the collection format (`## Heading` per list, titles below).
      The preview, errors, queue and Need a look are reused as they are

## Not in this sprint

- Storing collections, grouping lists by collection on Home, or editing a collection later
- Pushing the collection into Nuvio directly (still download and import by hand)
- Adding lists to an existing collection, or re-importing text to update existing lists
- Changes to section parsing, title-line rules, TMDB matching or the collection JSON shape
- Downloading the file automatically (the modal opens by itself, but the user clicks Download)
