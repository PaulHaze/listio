# Sprint 11 — Shared title matching and review controls

**Status:** not started — ready to start

## Goal

Make Sprint 07's title matching and Need a look controls reusable before building the text import
page. The editor keeps its current search, paste, Draft and Save behaviour. This sprint is a focused
refactor with its own regression audit.

The original Sprint 11 import brief is now split across this sprint,
[Sprint 12 — single-list import](./12_Import_Single_List_From_Text.md), and
[Sprint 13 — multiple-list import](./13_Import_Multiple_Lists_From_Text.md).
Collection export follows in [Sprint 14](./14_Nuvio_Collection_Export.md).
The import decisions agreed with the owner on 4 Oct 2026 carry forward into those briefs.

## Behaviour

- Search still offers Add, Added, In list and Restore, including Titles without a TMDB ID.
- Paste still matches in batches of 20, follows lookup continuations and retries transient per-line
  failures once at the end. A stopped request leaves completed additions in the editor's Draft.
- Need a look still offers candidates, a prefilled search for a no-match line, and Skip.
- Repeating a paste still reuses earlier choices and handles duplicates and restores correctly.
- Search and paste still change only the Draft. Only the editor's Save publishes those changes.

Shared controls must let the caller decide how an addition is committed. The editor adds to its Draft;
the future import page will await a save. A failed addition must leave its review line unresolved,
with an error and a way to retry. No import persistence is implemented here.

## Tasks

- [ ] Extract the batch match loop from `components/editor/TitleDiscovery.tsx` into a shared client
      module. Accept parsed `PasteLine[]`, an abort signal and progress/result callbacks. Preserve
      batches of 20, lookup continuations, result-to-line association and the existing one-time retry.
      Keep enough completed-result information for callers to report a stopped run
- [ ] Extract shared candidate lookup and identity handling. Preserve the TMDB/type-to-IMDb cache,
      recognition of active and Removed Titles, and the distinction between a missing IMDb ID and a
      transient lookup failure
- [ ] Extract the search, candidate grid and Need a look controls into shared components. Let the
      caller supply its current Titles and an addition callback that may be synchronous or asynchronous;
      await success before resolving a row. Preserve pending/error states and prevent repeated clicks
- [ ] Keep remembered line-to-IMDb choices scoped to the editor/list that owns them. Sharing controls
      must not make one list's review choices resolve another list's lines
- [ ] Rewire `TitleDiscovery.tsx` to the shared pieces. Preserve summaries, repeat-paste reconciliation,
      busy tracking, abort handling and the editor's current button labels
- [ ] Regression tests for the extracted match loop: multiple batches, lookup continuation, one-time
      per-line retry, fatal request failure after a completed batch, and abort
- [ ] Regression checks for review: candidate Add and Skip, prefilled no-match search, duplicate/restore
      identity, remembered choices on repeat paste, and an asynchronous addition failing without
      resolving the row. Use component tests where practical and record browser checks for UI paths

## Done when

- The editor imports the shared matching and review pieces rather than keeping a second implementation
- Search, repeated paste, Need a look, duplicates and restores behave as before
- A stopped match preserves completed Draft additions; unmounting stops outstanding client work
- A caller can await an addition before the shared review control marks its line resolved
- `pnpm test`, `pnpm build` and `pnpm lint:check` pass

## Not in this sprint

- The `/import` page, text format validation or file upload
- Creating or saving lists from import results
- Changes to TMDB confidence rules, endpoint contracts or Workers request budgets
- Nuvio collection export
