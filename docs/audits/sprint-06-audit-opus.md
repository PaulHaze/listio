## Audit: last commit cab8a1c — feat(sprint-06): review grid with remove, restore, views and progressive rendering

_Scope: Sprint 06 — GUI: Review grid (from `docs/sprints/06_GUI_Review_Grid.md`)_

Files audited: `src/components/editor/Editor.tsx`, `src/components/editor/draft.ts`, `src/styles/main.css`, `test/editor.test.ts`. I also read `src/domain/sort.ts`, `src/addon/catalog.ts`, `src/storage/lists.ts`, `src/api/validate.ts`, `src/pages/api/lists/[id].ts` and `src/pages/lists/[id].astro` as collaborators, and used the sprint doc, `list-combiner-spec.md` (review grid) and `docs/implementation-plan.md` §6 for scope. Claude wrote this commit in the same session; there is no external contributor. This report replaces an earlier low-effort pass on the same commit.

### Warning

1. **Restore does not return a Title to its original position, except in "Order added" sort.** `src/components/editor/draft.ts:75`
   `restoreTitles` adds restored Titles to the end of `draft.titles`. `sortTitles` breaks ties by array index (`src/domain/sort.ts:32`). Year ties are common in Newest/Oldest, and Titles with no year all tie, so a restored Title moves to the end of its tie group. Example: A (seq 1, 2020) and B (seq 2, 2020) show as A, B in Newest. After you remove and restore A, they show as B, A. The addon catalog uses the same `sortTitles` over `list.titles` (`src/addon/catalog.ts:15`), so once any other change is saved, the new order also reaches Nuvio. Three things back up the wrong behaviour:
   - the sprint doc says restore puts the Title back "to its original position" (`docs/sprints/06_GUI_Review_Grid.md:37`);
   - the test is named "keeping order" (`test/editor.test.ts:78`);
   - the test asserts the appended order `['tt2', 'tt1']` (`test/editor.test.ts:89`).
   Suggested fix: keep `draft.titles` in `addedSeq` order when restoring: `titles: [...draft.titles, ...moved].sort((a, b) => a.addedSeq - b.addedSeq)`. The array is already in `addedSeq` order because merge appends with increasing sequence numbers, so this restores the invariant. Change the assertion to `[['tt1', 1], ['tt2', 2]]`, and add a Newest-sort tie case.

### Suggestion

2. **Keyboard focus is lost after each removal or restore.** `src/components/editor/Editor.tsx:523-530`, `:501-511`, `:563-570`
   Trash, Restore and **Remove selected** each unmount the element that has focus: the card, or the floating button once the selection is empty. Focus then falls back to `<body>`. A keyboard user trimming a list has to tab back through the whole Sources panel after every cut. That works against the sprint goal "scan a large grid quickly, cut what isn't wanted".
   Suggested fix: before removing, note the next card's id (or the previous one, for the last card). After the update, focus that card's trash or Restore button, for example with a `data-id` lookup in a `useEffect` keyed on a "focus next" ref. After **Remove selected**, focus the grid heading.

3. **Restore buttons have no Title in their accessible name.** `src/components/editor/Editor.tsx:501-511`
   Trash and checkbox carry `aria-label={`Remove ${label}`}` and `aria-label={`Select ${label}`}`. Restore is only "Restore", so a screen-reader list of buttons shows N identical "Restore" entries.
   Suggested fix: add `aria-label={`Restore ${label}`}`.

4. **The first render after a view or sort change uses the old batch count.** `src/components/editor/Editor.tsx:266`
   `useEffect(() => setVisible(BATCH), [view, draft.sort])` runs after the commit. If you have scrolled All out to 1,000 cards and change the sort, React first reorders and renders all 1,000 cards, then drops back to 60. That is a heavy render, avoidable on exactly the 1,000-Title list the Done-when targets.
   Suggested fix: call `setVisible(BATCH)` inside `showView` and in the sort `onChange`, so it batches with the change, and delete the effect.

5. **The floating bar can cover the last row of cards.** `src/styles/main.css:416-427`
   The bar is `position: fixed` at the bottom-right with no matching space under the grid. At the end of a list, it can sit over the trash buttons and checkboxes of the bottom-right cards.
   Suggested fix: give `.editor` about `padding-bottom: 6rem`. The bar appears whenever there are unsaved changes, so applying it always is simplest.

6. **The 409 Reload triggers the unsaved-changes prompt, and the message overstates the cause.** `src/components/editor/Editor.tsx:124-132`, `:413-424`
   After a conflict, `changes > 0`, so clicking **Reload** fires the `beforeunload` prompt. That prompt is redundant, because the Draft can't be saved anyway. The message also says the list "was saved somewhere else (another tab or device)". A 409 only means the stored version differs. Because KV has no compare-and-swap and reads can be stale (`src/storage/lists.ts:42-48`), that may not literally be true.
   Suggested fix: skip the listener while `conflict` is true. Soften the copy to "This Combined List changed after you opened it (for example in another tab)…".

7. **Clicking the active "All" button clears the selection.** `src/components/editor/Editor.tsx:298-301`, `:435-441`
   `showView('all')` always calls `setSelection(new Set())`, even when the view is already All. A stray click on the highlighted button silently drops a selection that may have taken a while to build.
   Suggested fix: in `showView`, return early when `next === view`. The "Show only new" toggle would still work, because it passes `'all'` only when the current view is `'new'`.

8. **Empty states don't cover a list whose Titles are all Removed.** `src/components/editor/Editor.tsx:80`, `:473-480`
   If every Title is trashed, All says "No Titles yet. Add a Source to start your Draft.", which is misleading. On reload, such a list starts with the grid closed, because `review` is only `true` when there are active Titles. The user then has to click **Review List** to reach **Removed (N)**.
   Suggested fix: open the grid when `titles.length + removed.length > 0`. When `draft.removed.length > 0`, show "All Titles are removed. Restore them from Removed (N)." in the All view.

9. **Every visible card re-renders on each Draft change.** `src/components/editor/Editor.tsx:483-552`
   Trash clicks, checkbox ticks and every 40-Title enrichment chunk re-sort the list and rebuild every rendered card, including the inline SVG. Once a 1,000-Title list has been scrolled to the end, that is about 1,000 cards per click. It isn't measured yet.
   Suggested fix: if the browser check shows lag, extract a `memo`ised `TitleCard` that receives `selected`, `view` and stable `onRemove`/`onToggle`/`onRestore` callbacks.

10. **CSS tidy-ups.** `src/styles/main.css:387-393`
    The new `.title-card { position: relative; }` is unused, since nothing inside is absolutely positioned, and it duplicates the existing `.title-card` rule at `:342`. Unpressed view buttons drop the button background and have no border, so they look like plain text rather than toggles.
    Suggested fix: delete the `position: relative` block. Give `[aria-pressed='false']` a `1px solid var(--primary)` border.

11. **Grid behaviour has no automated tests.** `test/editor.test.ts`
    The pure Draft helpers are covered. Selection, bulk remove, views, progressive batches, 409 handling and the `beforeunload` gate are only covered by the pending manual browser check. The repo has no DOM test environment, so this is reasonable for now. If the grid grows in Sprint 07, consider adding `happy-dom` and `@testing-library/react`.

### Auditor notes

- `docs/implementation-plan.md:169` still describes the Draft as `{ …, changes:number }`. The field is now derived by `countChanges`. This is minor doc drift worth fixing alongside #1's sprint-doc correction.
- I checked these and found them correct:
  - Save is blocked while fetching or enrichment is in flight, and controls are disabled while saving, so no edits are lost between sending the PUT and resetting the Draft.
  - `removeTitles` and `restoreTitles` keep `titles` and `removed` disjoint, so the server's uniqueness check (`src/api/validate.ts:66-71`) can't reject a Draft built by the UI.
  - The IntersectionObserver effect re-runs whenever the sentinel mounts, because the sentinel depends only on `visible` and `titles.length`, both effect dependencies.
  - React renders `aria-pressed={false}` as `"false"`, so the attribute selector in the CSS matches.

### Positive observations

- `countChanges` compares with the saved list instead of tallying actions. The confirm count and the `beforeunload` gate therefore reflect real differences: remove then restore, or a sort switched back, counts as zero.
- `applyEnrichment` now also updates `removed`, which closes the race where a Title is trashed while its poster chunk is in flight.
- A removed new Title is saved as Removed, so a later Source still skips it, meeting the "Removed Titles stay out" Done-when through the existing merge.
- The 409 path is a persistent alert with a Reload action and a disabled Save, rather than a transient error string.
- Every Sprint 06 task item is delivered with no scope creep. `pnpm test` (69), `pnpm lint:check` and `pnpm build` pass.
