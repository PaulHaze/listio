# Sprint 13 — Import several lists from text

**Status:** not started — depends on Sprint 12

## Goal

Extend [Sprint 12's text import](./12_Import_Single_List_From_Text.md) to create several saved Combined
Lists from one sectioned file. Each `## Header` becomes a list; import checked sections one at a time,
in file order, and continue safely after an interruption.

Matching, saving and Need a look reuse the shared controls and per-list import operation completed in
Sprints 11–12. The single-list flow stays available and is the default mode.
Collection export follows in [Sprint 14](./14_Nuvio_Collection_Export.md).

Test file: `docs/movie_lists/midnight_movies.md` — 25 sections, the last one TV series.

## The format

Each list starts with a `## ` line holding its name, followed by one title per line.

```text
## The Foundational Weird

- El Topo (1970)
- Eraserhead (1977)

## Midnight Tv Shows
Twin Peaks (1990)
```

Use Sprint 12's title parsing, whitespace, bullet, year and comment rules. A repeated title within
one section is kept once. The same title may appear in several lists. Title spelling and year syntax
are not validated. Headers are recognized after trimming surrounding whitespace; other `#` lines
are errors rather than silently ignored comments.

## Format errors

Validate live and show every error with its original source line number. **Import** is disabled if
there are errors or nothing selected. Check only ticked sections, using their edited preview names;
an unticked section is skipped and its section errors do not block import. Errors before the first
header, and the absence of headers, still block import because they do not belong to a section.

| Error                                                                           | Example message                                                        |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| No `## ` headers                                                                | `No "## " list headers found. Switch to Single list, or add headers.`  |
| Non-blank text before the first header                                          | `Line 1: "Brick (2005)" is above the first "## " header.`              |
| A selected section has no titles                                                | `Line 10: "## Giallo" has no titles.`                                  |
| A selected section's name is blank or over 100 characters                       | `Line 10: list names must be 1–100 characters.`                        |
| Two selected sections have the same trimmed, case-insensitive name              | `Lines 10 and 83: two lists are named "Modern Head Trips".`            |
| Any other line starting with `#` (`#`, `###`, `#Foo`)                           | `Line 5: "### Extras" isn't a valid header. Use "## " for list names.` |
| A selected name matches an existing Combined List, trimmed and case-insensitive | `Line 83: a list named "Modern Head Trips" already exists.`            |

Blank, too-long, duplicate and existing-name errors can be fixed by renaming in the preview. Validate
the edited name rather than keeping an error from the original header. Unticking one duplicate makes
the other eligible. Keep source line/section identity independent of its editable name.

## Behaviour

1. Add a **Single list / Multiple lists** toggle to `/import`, defaulting to Single. Multiple mode
   hides the single name field and shows a live preview: one row per section, a checkbox ticked by
   default, an editable name, parsed title count and section errors.
2. Keep user renames and selections when changing preview fields. Replacing the source text rebuilds
   the preview from that text. Upload still replaces the text and creates nothing.
3. Import snapshots the checked sections, edited names and titles in file order. Disable input and
   mode changes during the run. Process one section through match → create → save before starting
   the next. Show progress such as `Modern Head Trips (3 of 25): 40 / 61`.
4. Show per-list results using Sprint 12's counts, editor links, Need a look, Copy unresolved lines
   and save-on-pick. Keep each list's Titles, pending additions and review choices separate. Resolving
   one list cannot alter another, even when both contain the same title text or IMDb ID.
5. A failed section stops the queue. Finished lists stay saved; show the pending section and those
   not started. **Continue import** resumes the first unfinished section, then the remaining selected
   sections. Reuse Sprint 12's pending match/save state: a known successful create is never repeated,
   and a failed save is retried on the same list ID.
6. Unresolved review lines from finished lists survive a queue interruption while the page remains
   open. Warn before leaving while any remain. Closing/reloading loses import state; re-paste the
   file, untick already-created sections, and import the rest. A list awaiting its save can be
   completed through its editor if the page state has been lost.

## Tasks

- [ ] Extend `domain/pasteSections.ts` with multiple mode, preserving source line numbers and stable
      section identity. Split on `## ` headers and return section titles plus structural errors;
      retain section association on errors so the page can exclude unticked sections
- [ ] Validate edited names with Sprint 12's rules, adding duplicate names among selected sections.
      Keep validation of source structure separate from preview names and selection
- [ ] `/import` mode toggle and live multiple-list preview: tick/untick, rename, counts and all active
      errors. Update single-mode header errors to suggest switching to Multiple lists
- [ ] Queue runner around Sprint 12's per-list operation: section-order snapshot, one list at a time,
      list/Title progress, per-list results, stop on failure, and Continue from the first unfinished list
- [ ] Isolate per-list review and saves. Keep completed results after interruption and apply the
      unload warning across all unresolved lines
- [ ] Unit tests for multiple parsing/preview validation: every table error, several errors together,
      empty/blank/long/repeated headers, names with `:` `&` `'`, repeated titles within/across lists,
      source line numbers, unticked sections and renames clearing the correct errors
- [ ] File fixtures: midnight valid as multiple with 25 lists, expected per-list parsed counts and the
      TV section; absurd/noir rejected as multiple. Keep Sprint 12's single-mode fixture checks passing
- [ ] Queue integration tests: checked lists saved in file order, unchecked lists untouched, interruption
      preserves completed lists, Continue skips completed sections, and create-success/save-failure
      retries the same ID before starting the next section
- [ ] Review integration checks: picks persist to the correct list, the same title can be saved in
      different lists, a failed pick stays unresolved, and unfinished review survives a queue failure

## Done when

- Importing `midnight_movies.md` creates 25 saved lists in section order, each mostly matched,
  including the final TV section as a series Catalog in Nuvio
- Every format/name error blocks import for the selected sections and shows its source line number
- Unticking or renaming resolves the appropriate errors without changing the source text
- Need a look lines can be resolved and saved to the right list independently
- An interrupted run continues without recreating completed lists; any pending save fills its existing
  list before the next section starts
- Single-list import continues to work
- `pnpm test`, `pnpm build` and `pnpm lint:check` pass

## Not in this sprint

- Nuvio collection JSON export
- Re-importing text to update or add to existing lists
- Storing unresolved lines or run state for recovery after closing/reloading the page
- New TMDB matching logic or changes to title-line syntax rules
