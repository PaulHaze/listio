## Audit: last commit 8259fc5 — feat: import multiple lists from sectioned text

_Scope: Sprint 13 — Import several lists from text (from docs/sprints/13_Import_Multiple_Lists_From_Text.md)_

Files audited: `src/domain/pasteSections.ts`, `src/client/importQueue.ts`, `src/client/importList.ts`, `src/components/import/ImportFromText.tsx`, `test/import-parser.test.ts`, `test/import-queue.test.ts`, `test/import-review.test.tsx`.

**Scope match:** Every task checkbox in the sprint doc has matching code and tests. The parser has a multiple mode with stable section IDs. Structural validation is kept separate from preview validation. The commit adds the mode toggle and preview, a queue runner over `ImportListRun`, per-list review isolation, an unload warning across lists, and fixture, queue and review tests. No non-goals are touched: there is no export work, no re-import into existing lists, no persisted run state and no matching changes. Deployed acceptance is still pending, as the doc says.

### Warning

**1. A section that keeps failing blocks the rest of the queue, and the only way out loses review state.**
`src/client/importQueue.ts:37-42`, `src/components/import/ImportFromText.tsx:51-52, 206, 237`

- Once `queue.current` exists, `locked` is permanently true. That disables the checkboxes (`:237`), the textarea (`:206`) and upload.
- If a section always ends `empty`, the queue stops on it every time. Example: every line returns `No match`, perhaps a badly spelled section or one TV block that TMDB can't resolve.
- **Continue import** calls `retryEmpty()` and re-matches the same lines. The section can't be unticked or skipped, so the remaining sections can never run.
- The only way out is a reload. That throws away the unresolved Need a look lines of the lists that already finished, which is the state Behaviour item 6 sets out to keep.
- The sprint doc says "A failed section stops the queue", which is correct for transient failures. It doesn't consider a failure that will never clear.
- **Fix:** let the user skip the first unfinished section while the queue is stopped. For example, an "Skip this list" button next to **Continue import** that marks the entry skipped, or keep the checkbox enabled for not-started and `empty` entries and filter them out in `continue`. Either way, completed runs and their review stay in place.

**2. A `## ` header containing `//` is silently dropped, and its titles join the previous list.**
`src/domain/pasteSections.ts:78`

- `if (raw.includes('//')) return;` runs before header detection.
- Example: `## Movies // to sort` vanishes with no error. Its titles become part of the section above. If it's the first header, they become "above the first header" errors that point at the title lines, not the real cause.
- This follows Sprint 12's recorded `//` policy. In single mode, ignoring a line only loses that line. In multiple mode, ignoring a header line moves Titles into a different saved list. That goes against this sprint's "other `#` lines are errors rather than silently ignored" principle.
- **Fix:** check for a header before applying the `//` skip. Then report `Line N: "## …" contains "//". Remove the comment from the header.` with the section's ID, so unticking the section clears it. This needs an owner decision because it narrows the Sprint 12 policy for headers only.

**3. The midnight fixture test hardcodes counts from a data file that is still being edited, and it already fails on your uncommitted edit.**
`test/import-parser.test.ts:168-188`

- The test asserts 25 sections and exact per-section counts read from `docs/movie_lists/midnight_movies.md`.
- That file is a working list. The doc even says its additions are "awaiting assignment to sections". Your current uncommitted edit has 34 `## ` headers.
- `pnpm vitest run test/import-parser.test.ts` now fails with `expected [ …(34) ] to have a length of 25 but got 34`. The committed copy has 25 headers, so the test passes at `HEAD`.
- Every curation edit will break `pnpm test`.
- **Fix:** freeze a copy at `test/fixtures/midnight_movies.md` for the exact-count assertions. Against the live file, assert only structural validity: zero errors, at least one section, and the last section is the TV section. The alternative is to accept the churn and update the counts with each list edit, which is an owner call. Either way, the Done-when criterion "creates 25 saved lists" needs to match whichever file is the acceptance input.

### Suggestion

**4. Need a look is disabled on every finished list while later sections are still importing.**
`src/components/import/ImportFromText.tsx:419`

- `disabled={busy > 0 || active}` uses the page-wide `active` flag. During a 25-list run, the user can't resolve list A's picks until the whole queue finishes or stops.
- Picks save to their own list through `run.add`, so they can't conflict with the section currently being processed. The flag was carried over from Sprint 12, where `active` meant the same list.
- **Fix:** pass `active={['matching','creating','saving'].includes(run.state.phase)}` for each run, not the page-wide flag.

**5. The rename-after-rejection path inside a queue has no test.**
`src/components/import/ImportFromText.tsx:256-274`

- The name input re-enables only for a queue entry in `rejected`. It updates the preview and calls `run.rename`. **Continue import** is then gated on preview `errors`.
- This is the only way to recover a section whose name was taken on the server after page load (stale `initialLists`). No test covers it. The single-mode equivalent is covered at `test/import-review.test.tsx:217`.
- **Fix:** add an `it` where `GET /api/lists` returns the second section's name, then assert:
  - only that row's name input is enabled;
  - renaming clears the error;
  - Continue creates the list under the new name;
  - section 1 is not created again.

**6. The list-name rules are written out three times.**
`src/domain/pasteSections.ts:52-66, 138-153`, `src/components/import/ImportFromText.tsx:55-57`

- The 1–100 length check and the trimmed, case-insensitive "existing" comparison are reimplemented in `validateImportSections` and again in the component's `existing` lookup.
- The task says "Validate edited names with Sprint 12's rules". A shared helper, for example `nameTaken(name, existing)` plus a `nameLengthOk`, would keep single mode, multiple mode and the server-side `ImportListRun` check from drifting apart.

**7. Blank names produce confusing error messages.**
`src/domain/pasteSections.ts:136, 154-161`

- Two selected blank `##` headers each get "list names must be 1–100 characters". The second one also gets `Lines X and Y: two lists are named "".`
- A blank-named empty section reads `"## " has no titles.`
- **Fix:** skip the duplicate and existing checks when `name` is empty. Use the original header text, or `Line N:` alone, in the no-titles message.

**8. The text is parsed twice on every render, including every progress tick.**
`src/components/import/ImportFromText.tsx:39-40`

- `parseImport(text, 'single')` and `parseImport(text, 'multiple')` run on every re-render. During a queue run, `changed()` fires for every match result, so a file of about 1,000 lines is re-parsed twice for each Title matched.
- **Fix:** `useMemo(() => …, [text])` for both.

**9. Result panels are keyed by array index.**
`src/components/import/ImportFromText.tsx:327`

- `ImportResult key={index}` keeps local `busy` and `copyMessage` state when the `runs` array changes underneath it, for example a single run being replaced by a queue.
- **Fix:** key by `sectionId` (queue) or `'single'`.

**10. Smaller items.**

- `importQueue.ts:21-31`: `unfinished` and `progress` each repeat the same `findIndex`. `progress` could use `this.unfinished` together with `indexOf`.
- `ImportFromText.tsx:248`: the checkbox label is `Import section on line N`. Including the name (`Import "A" (line N)`) would help screen-reader users tab through 25 rows.
- `ImportFromText.tsx:74-87`: a queue stopped with unstarted sections but no unresolved lines and no pending save doesn't warn on leave. This matches the spec's wording, which only asks for a warning while unresolved lines remain. Warning here would still save the user from re-pasting and unticking. Owner call.

### Positive observations

- **Section identity:** `section-${sourceLine}` keeps identity separate from the editable name. Structural errors carry a `sectionId`, so unticking a section removes them cleanly, while global errors (text above the first header, no headers) still block. This matches the Format errors rules exactly.
- **Queue design:** `ImportQueue` is a thin wrapper over `ImportListRun`, so idempotent create, same-ID save retry and lost-response reconciliation come from Sprint 12 unchanged. The `match → create → save` event-order assertions in `import-queue.test.ts:108-118` and `:143-148` prove both "one section at a time" and "pending save finishes before the next section".
- **Review isolation:** each run owns its review rows and list. The review test confirms that identical picks land in the correct lists and that a failed pick stays unresolved across a queue interruption.
- **Fixture handling:** the invalid `###` appendix was moved to a separate file rather than loosening the parser, which respects the "no format relaxation" stance.
