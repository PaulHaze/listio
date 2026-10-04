# Sprint 11 — Import lists from text

**Status:** not started — ready to start (decisions agreed with owner on 4 Oct 2026)

## Goal

Paste or upload a plain text list of titles and turn it straight into saved Combined Lists (live
Catalogs in Nuvio). There are two modes:

- **Single list:** you type a list name, and the text is one title per line. One Combined List.
- **Multiple lists:** the text is split into sections by `## Header` lines. Each section becomes its
  own Combined List, named after its header and filled with the titles under it.

Matching reuses Sprint 07's paste matching (`pasteLines`, `POST /api/titles/match`, the Need a look
controls). Nothing new on the TMDB side. Adding the new Catalogs to a Nuvio collection is done by hand
in Nuvio. The collection JSON export is [Sprint 12](./12_Nuvio_Collection_Export.md).

Test files: `docs/movie_lists/absurd_movies.md` and `noir_not_noir.md` (single),
`docs/movie_lists/midnight_movies.md` (multiple, 25 sections, the last one TV series).

## The format

**Single list:** one title per line. The year is optional, written as `(YYYY)` at the end.

```
Brick (2005)
The Big Lebowski (1998)
Adaptation
```

**Multiple lists:** each list starts with a `## ` line holding the list name, then one title per line.

```
## The Foundational Weird

- El Topo (1970)
- Eraserhead (1977)

## Midnight Tv Shows
Twin Peaks (1990)
```

Accepted in both modes (same as Sprint 07 `pasteLines` today):

- Blank lines anywhere.
- Bullet markers at the start of a title line (`- `, `* `, `1. `), which are stripped.
- Leading/trailing whitespace, which is trimmed.
- A title repeated within one list is kept once. A title may appear in more than one section.

Every other non-blank line is a title. Title lines are **not** checked: a line TMDB can't match goes to
Need a look, as it does in the editor.

## Format errors

The text is checked as you type, paste or upload. **Every** error is listed with its line number, and
**Import** stays disabled until there are none. Nothing is created from text that has errors.

| Mode     | Error                                                                                                 | Example message                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Single   | The text contains a `## ` line                                                                        | `Line 1: "## The Foundational Weird" is a list header. Switch to Multiple lists, or remove it.` |
| Single   | List name is blank or over 100 characters                                                             | `Enter a list name of 100 characters or fewer.`                                                 |
| Single   | No titles                                                                                             | `Paste at least one title.`                                                                     |
| Multiple | No `## ` lines at all                                                                                 | `No "## " list headers found. Switch to Single list, or add headers.`                           |
| Multiple | A non-blank line before the first header                                                              | `Line 1: "Brick (2005)" is above the first "## " header.`                                       |
| Multiple | A header with no titles under it                                                                      | `Line 10: "## Giallo" has no titles.`                                                           |
| Multiple | A header name that is blank or over 100 characters                                                    | `Line 10: list names must be 1–100 characters.`                                                 |
| Multiple | Two sections with the same name (trimmed, case-insensitive)                                           | `Lines 10 and 83: two lists are named "Modern Head Trips".`                                     |
| Both     | Any other line starting with `#` (`#`, `###`, `#Foo`), so a wrong heading level isn't read as a title | `Line 5: "### Extras" isn't a valid header. Use "## " for list names.`                          |
| Both     | A list name matching an existing Combined List (trimmed, case-insensitive)                            | `Line 83: a list named "Modern Head Trips" already exists.`                                     |

In multiple-lists mode, name errors (blank, too long, duplicate, already exists) can be fixed by renaming
the section in the preview, without editing the text. A rename clears the error once it's valid.
An unticked section is skipped and isn't checked.

## Behaviour

1. **Home → Import from text** opens `/import`.
2. `/import` has a **Single list / Multiple lists** toggle (default Single), a **List name** field
   (single only), a textarea, and **Upload .txt/.md**, which reads the file into the textarea
   (it replaces the text and doesn't create anything).
3. Multiple lists shows a live **preview**: one row per section with a checkbox (ticked by
   default), an editable name (starts as the header text), the title count, and any errors for that section.
4. **Import** processes the lists one at a time, in file order. For each list it:
   - matches its lines through `POST /api/titles/match` in batches of 20, with Sprint 07's retry for
     transient failures. Progress shows per list, e.g. `Modern Head Trips (3 of 25): 40 / 61`
   - then creates the list (`POST /api/lists`) and saves it with its confidently matched Titles
     (`PUT /api/lists/{id}`, using the same Draft → saved conversion as the editor). The list exists
     only once matching for it has finished, so a run never leaves half-filled lists. It is a live
     Catalog straight away
5. **Results**: each list shows its name (linking to its editor), Titles saved, duplicates skipped and its
   Need a look lines. These use the same pick-a-match / search / dismiss controls as the editor. Each
   pick is saved straight to that list. **Copy unresolved lines** copies the ones left, so they can be
   pasted into the list's editor later. Unresolved lines aren't stored anywhere, so leaving the page
   drops them (warn on `beforeunload` while any remain).
6. **Interruptions**: if a run stops (TMDB error, rate limit, network), finished lists stay saved. Results
   show which sections weren't imported and a **Continue import** button that carries on from the first
   unfinished section. If the create succeeded but the save failed, Continue retries the save on the same
   list rather than creating another. If the page was closed, re-paste. The finished sections now fail
   "already exists", so untick them and import the rest.

## Tasks

- [ ] `domain/pasteSections.ts`: pure parser `parseImport(text, mode)` that returns
      `{ lists: { name, line, lines: PasteLine[] }[], errors: { line?, message }[] }`, using `pasteLines`
      for each section's titles. It checks the structure only. The page checks name clashes with
      existing lists.
- [ ] `pasteLines`: stop silently dropping `#…` lines. The parser reports them as errors instead
      (the editor paste keeps ignoring `#` and `//` lines)
- [ ] Home **Import from text** action → new `/import` page (Basic Auth-protected like the rest)
- [ ] `/import` UI: mode toggle, name field, textarea, file upload, live error list, multiple-lists preview with
      tick/rename, Import button disabled while there are errors or nothing to import
- [ ] Import runner: per-list match → create → save in order, progress, retry, stop and Continue
- [ ] Pull the editor's match loop and Need a look controls out of `TitleDiscovery.tsx` into shared
      pieces used by both the editor and `/import`, so they don't drift apart
- [ ] Results view: per-list counts, editor links, Need a look with save-on-pick, Copy unresolved lines,
      `beforeunload` warning
- [ ] Unit tests: `parseImport`, covering
  - each error in the table, and several errors reported together
  - bullets, blank lines and `(YYYY)` years
  - headers containing `:` `&` `'`
  - single mode treating every non-blank, non-`#` line as a title, and multiple mode rejecting text above the first header
  - unticked/renamed sections
  - the three `docs/movie_lists` files (absurd/noir valid as single and failing as multiple; midnight
    valid as multiple with 25 lists and the right per-list counts, and failing as single)
- [ ] Component/integration tests for the runner: lists saved in order, interruption keeps finished lists,
      Continue resumes without duplicates, a failed save retried on the same list

## Done when

- Single list: importing `absurd_movies.md` with a typed name creates one saved Combined List that
  shows in Nuvio without opening the editor
- Multiple lists: importing `midnight_movies.md` creates 25 saved lists named after their headers, in
  file order, each mostly matched, including the TV section as a series Catalog
- Each wrong case in the format table shows its error with a line number and blocks the import
- Need a look lines can be resolved on the results page and saved to the right list
- An interrupted run can be continued without duplicate or empty lists
- `pnpm test`, `pnpm build` and `pnpm lint:check` pass

## Not in this sprint

- The Nuvio collection JSON export ([Sprint 12](./12_Nuvio_Collection_Export.md))
- Re-importing text to update or add to existing lists
- Storing unresolved lines on a Combined List for later
- Checking the format of title lines (e.g. `Title 1970` instead of `Title (1970)`)
