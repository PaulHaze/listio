# Sprint 12 — Import one list from text

**Status:** implemented; deployed acceptance pending

## Goal

Paste or upload one plain text list of titles, enter a name, and create one saved Combined List
without opening the editor. Confident matches become live Catalog Titles in Nuvio straight away;
Need a look can be resolved on the import page.

Builds on [Sprint 11's shared matching and review](./11_Shared_Title_Matching_Review.md).
Multiple lists arrive in [Sprint 13](./13_Import_Multiple_Lists_From_Text.md).
Adding Catalogs to a collection is done by hand in Nuvio until
[Sprint 14's collection export](./14_Nuvio_Collection_Export.md).

Test files: `docs/movie_lists/absurd_movies.md` and `docs/movie_lists/noir_not_noir.md`.

## The format

One title per line. The year is optional, written as `(YYYY)` at the end.

```text
Brick (2005)
The Big Lebowski (1998)
Adaptation
```

Accepted, as in Sprint 07:

- Blank lines anywhere.
- Bullet markers at the start of a title line (`- `, `* `, `1. `), which are stripped.
- Leading/trailing whitespace, which is trimmed.
- A title repeated within the list is kept once, using the existing `pasteLines` deduplication.

Title spelling and year syntax are not validated: a line TMDB can't match goes to Need a look.
Import checks `#` lines before calling `pasteLines`, so headings cannot disappear silently.
The editor's paste behaviour keeps ignoring `#` and `//` comments.

## Owner questions

- [x] **QUESTION — Lines beginning with `//`.** The previous brief says every other non-blank line is
      a title, but `pasteLines` currently ignores `//` comments. Should import ignore them like the
      editor, or send them to matching as title lines? This choice applies to both import modes

**ANSWER** Ignore lines with // in. A text list should be ONLY movie titles or a list heading which is prefaced by ##. Bulletpoints, -'s, and numbers before movie titles are fine and should be stripped. Anything else is an error and a error message should point out the issue and ask for it to be formatted correctly. IN the first version of this its only me using it so I am going to know how to format my lists

- [x] **QUESTION — No confident matches.** If all lines need a look, should import create an empty
      saved list and let you resolve the lines on the results page, or wait until you pick the first
      Title before creating the list? The previous brief's create-and-save sequence permits the former,
      while its "without ... empty lists" acceptance wording could suggest the latter

**ANSWER** If ALL lines need a look then there is something wrong with the list. If its clear what the issue is then let the user know. Dont create an empty list as there is no point. If the error isnt clear just state that no titles can be found and to check the list format as maybe it is incorrect.

Recorded policy: ignore any line containing `//` (including inline comments). Single mode rejects all headings, including `##`; bullets and numbers are stripped. Other title text, including unknown spellings and year syntax, goes through TMDB matching. Structural errors are reported with source line numbers; title spelling is not guessed or validated.

If every line needs a look, create no list. Show a specific matching error when available; otherwise say that no titles were found and ask the user to check the list format.

## Format errors

Validate as the user types, pastes or uploads. List every text error with its original line number.
Name errors belong to the name field. **Import** stays disabled until there are no errors and at least
one parsed title. Nothing is created from invalid input.

| Error                                                                | Example message                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A `## ` header                                                       | `Line 1: "## The Foundational Weird" is a list header. Use one title per line and remove list headers.` |
| Any other line starting with `#` (`#`, `###`, `#Foo`)                | `Line 5: "### Extras" isn't a title line. Remove the heading.`                                          |
| List name blank or over 100 characters                               | `Enter a list name of 100 characters or fewer.`                                                         |
| No titles                                                            | `Paste at least one title.`                                                                             |
| Name matches an existing Combined List, trimmed and case-insensitive | `A list named "Modern Head Trips" already exists.`                                                      |

## Behaviour

1. **Home → Import from text** opens `/import`, protected by the existing Basic Auth middleware.
   The page has a **List name** field, textarea, **Upload .txt/.md**, live errors and **Import**.
   Upload replaces the textarea contents and creates nothing.
2. Import takes a snapshot of the validated name and titles. Disable input changes and repeated Import
   clicks while that run is active. Matching uses Sprint 11's shared loop in batches of 20, showing
   `Matching 40 / 61`, including its one-time retry for transient per-line failures.
3. Only after matching completes, create the list with `POST /api/lists`, then save the confidently
   matched Titles with `PUT /api/lists/{id}`, using the editor's Draft-to-saved conversion and Title
   addition rules. Keep the matching output until that save succeeds. The zero-match case follows
   recorded policy above: create nothing and report the matching issue or ask the user to check the format.
4. Results show the list name linked to its editor, Titles saved, duplicates skipped and Need a look.
   Candidate picks and no-match searches use the shared controls; each addition is saved straight to
   this list. A failed save shows an error and leaves the line available to retry. Serialize additions
   so two picks cannot overwrite each other's Titles. Sprint 11's Need a look already runs one addition
   at a time across its rows and reports rows by object identity; replace resolved rows immutably. Dismiss/Skip resolves a line without saving a Title.
5. **Copy unresolved lines** copies the remaining original title lines for pasting into the editor.
   Unresolved lines are held only on this page. Warn on `beforeunload` while any remain, then remove
   the warning when they are all resolved or dismissed.
6. A failed matching request creates no list. **Continue import** retries the unfinished work using
   the same input snapshot, retaining completed match results without adding them twice. If create
   succeeded and its ID is known but save failed, Continue retries the save on that same ID, without
   matching again or creating another list. An uncertain create response must be reconciled with
   saved lists before retrying; never blindly repeat the create request.
7. The existing create-then-save APIs are two writes: a created list can temporarily be empty if its
   save fails. Show that pending save clearly; it is not a completed result. Continue must fill the
   same list. Closing the page loses the run state; after reopening, check existing lists before
   attempting another import and use the existing list's editor if it was already created.

## Tasks

- [x] `domain/pasteSections.ts`: introduce a pure `parseImport(text, mode)` parser for single mode,
      returning parsed `PasteLine[]` and all structural errors with source line numbers. Reuse
      `pasteLines` title parsing after checking headings and applying the agreed `//` policy.
      Keep name validation separate so Sprint 13 can validate renamed/selected sections
- [x] Name validation: trim, require 1–100 characters, and reject an existing name case-insensitively.
      Read the existing list index through the established server/page pattern and recheck it when
      retrying creation after a failure
- [x] Home action and `/import` page: name, text, `.txt`/`.md` upload, file-read errors, live validation,
      and disabled Import during errors, empty input or an active run
- [x] Single-list import runner: matching snapshot → create → save, progress, Title deduplication,
      stopped/pending/completed state and Continue. Retain the created ID and matching output across
      save retries. Use the existing list APIs; make the per-list operation reusable by Sprint 13
- [x] Results: counts, editor link, shared Need a look with save-on-pick, save errors/retry, Copy
      unresolved lines, and the `beforeunload` warning
- [x] Unit tests for single-mode parsing and name validation: all errors together and separately,
      bullets/blanks/years, repeated lines, source line numbers, the agreed `//` policy, absurd/noir
      valid as single, and midnight rejected because it contains headers
- [x] Runner integration tests with mocked APIs: match before create, persist confident Titles,
      deduplicate different lines matching the same IMDb ID, stop before creation on request failure,
      resume without repeated additions, retry a failed save on the same ID, and prevent repeated submits
- [x] Review integration checks: a pick is resolved only after persistence, failed saves remain retryable,
      successive picks preserve all Titles, copied lines exclude resolved/dismissed rows, and the
      zero-match case follows the agreed answer

## Done when

- Importing `absurd_movies.md` with a typed name creates one saved Combined List that shows in Nuvio
  without opening its editor
- `noir_not_noir.md` also imports as a single list; every format/name error blocks creation
- Need a look picks save to the right list and remain available if saving fails
- An interrupted run can be continued; a pending save is retried on the existing list
- No duplicate list is created by repeated clicks or retrying a known successful create
- Lines containing `//` are ignored; all headings are rejected with source line numbers
- When there are no confident matches, no list is created and the user sees a matching issue or a request to check the format
- The two owner questions have documented answers and corresponding checks
- `pnpm test`, `pnpm build` and `pnpm lint:check` pass

## Not in this sprint

- Multiple-list mode, section preview, checkboxes or section renaming
- Nuvio collection JSON export
- Re-importing text to update or add to existing lists
- Storing unresolved lines or import progress for recovery after closing/reloading the page
- Changing the editor's paste comment handling or TMDB matching rules
- Checking title-line syntax (e.g. `Title 1970` instead of `Title (1970)`)

## Implementation verification

- `pnpm test`: 168 tests passing across 18 test files, including single parsing/name checks, runner recovery and persisted review integration.
- `pnpm build`: passes; Astro reports the browser `beforeunload.returnValue` deprecation hints in the editor and import warning handlers.
- `pnpm lint:check`: passes.
- Runtime acceptance with real TMDB and Nuvio on the deployed Worker remains pending.
- Run state and unresolved lines remain page-local. Import creation now uses a per-run UUID and a server-side index reservation plus an initial snapshot. Continue reconciles and repairs that same identity; it never adopts an unrelated list by name. Replayed creation writes only the initial snapshot, leaving later saved Titles untouched even after a missing read. Definite rejections allow a name change while retaining matched results.
- Audit fixes cover both creation storage boundaries through real list routes, stale creation reads, unrelated identities, rejected/name-collision rename recovery, no-match wording and touched validation. The ordinary KV index and save operations remain eventually consistent rather than transactional across concurrent writers.
