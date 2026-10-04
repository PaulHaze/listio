# Audit Summary: sprint-11 — Shared title matching and review controls

Combined findings of Astra and Opus audits:

Astra's verdict is **PASS** with no findings: 0 critical, 0 warnings, 0 suggestions. All 8 issues below come from Opus. Two of Opus's findings contradict rows in Astra's task-coverage table. See **Conflicts to resolve** at the end.

## Issues

### 1. The "choices scoped to their owner" test passes even when choices are shared  [Warning] · raised by Opus

- **What it is:** Sprint 11 requires that a review choice made in one list's editor never resolves a line in another list. The test meant to prove this renders a second editor whose Draft is empty. The editor reuses a remembered choice only when that Title is already in the current Draft (active or Removed), so an empty Draft can never resolve the line, whether choices are shared or not.
- **Why it matters:** The test can't catch the regression it exists to prevent. Opus checked this directly: with the per-editor memory temporarily replaced by one shared by every editor, all 7 tests in the file still passed. The production code is correct, because `resolutions` is per instance. Only the test coverage is missing.
- **How much:** No user-facing bug today. The safety net for a sprint requirement doesn't work, which matters because Sprint 12 will reuse these controls. Raised by Opus only. Astra's coverage table counts this same test as proof (see Conflicts).
- **Where:** `test/title-controls.test.tsx:309-314`; behaviour in `src/components/editor/TitleDiscovery.tsx:45`, `:52-66`.
- **Suggested fix:** Let the test's `DiscoveryOwner` accept initial titles. Start the second owner with `title(22001)` already in its list (in `titles` or `removed`). Then assert `0 added · 0 already in list · 1 need a look`. A shared memory would produce `0 added · 1 already in list · 0 need a look`, so the test would fail as it should.

### 2. The editor's main Search is now locked while an addition is pending  [Warning] · raised by Opus

- **What it is:** Before, a candidate grid blocked a second click only on the *same* candidate. Now it allows one addition at a time per grid. The search box is also disabled while any addition from its grid is in progress. That applies to the editor's main Search panel too, not only the review rows' searches.
- **Why it matters:** The sprint brief says the editor keeps its current search behaviour. The implementation notes describe locking "edits to *its review search*", which doesn't cover the main panel. The effect is small in practice, because lookups are usually cached and fast. Still, the behaviour differs from the brief and was never written down as a decision.
- **How much:** A minor change in how the editor feels, not a bug. Opus rated it a Warning so the owner can confirm. Astra's coverage table marks "prevent repeated clicks" and "search behaves as before" as Satisfied (see Conflicts).
- **Where:** `src/components/titles/TitleControls.tsx:77` (input disabled), `:157` (one-at-a-time guard), `:226` (buttons disabled).
- **Suggested fix:** A judgement call with two options:
  - **(a)** Accept the stricter lock and record it in the sprint doc as an intended change.
  - **(b)** Keep the lock only for review rows. For example, keep the old per-candidate guard when no `onPending` is passed, or add an opt-out prop for the main Search panel.

  Recommendation: (a), unless the owner notices the lock in normal use. It is simpler, and it guards Sprint 12's async saves.

### 3. Two explanatory comments were dropped from the match loop  [Suggestion] · raised by Opus

- **Correction (Opus, after the audit):** The original Opus finding listed six lost comments. Four of them were never lost: in `api.ts:26`, `TitleControls.tsx:121`, `:129-130` and `:149`, and `TitleDiscovery.tsx:44`. The file view Opus audited from had `//` comments stripped by a token-saving shell filter (RTK). That also shifted some Opus line numbers in `TitleControls.tsx` and `TitleDiscovery.tsx`, which are corrected throughout this summary to match commit `e2db8d6`. Only the two `matchLines.ts` comments below were actually dropped.
- **What it is:** The old editor match loop explained two decisions that the new `matchLines` module lost: that lines with a transient TMDB error get one more try at the end, and that a transiently failed lookup keeps its candidate for review.
- **Why it matters:** Neither decision is obvious from the code, and Sprint 12 will reuse this module.
- **How much:** Readability only, no behaviour impact. Raised by Opus.
- **Where:** `src/client/matchLines.ts:57-74` (lookup failure handling and the retry condition).
- **Suggested fix:** Restore both comments above the lookup `catch` and the retry condition.

### 4. `src/components/editor/api.ts` is now a redundant re-export  [Suggestion] · raised by Opus

- **What it is:** The file now only re-exports `api` and `ApiError` from `src/client/api.ts`. Its only remaining importer is `Editor.tsx:22`.
- **Why it matters:** The same helper now has two import paths. A later edit could import from either, and the extra file adds a little indirection.
- **How much:** Tidiness only. Raised by Opus.
- **Where:** `src/components/editor/api.ts:1`, `src/components/editor/Editor.tsx:22`.
- **Suggested fix:** Change `Editor.tsx` to import from `../../client/api.ts` and delete `src/components/editor/api.ts`.

### 5. The match loop counts a line as completed before its result callback succeeds  [Suggestion] · raised by Opus

- **What it is:** `matchLines` records a line as completed, then awaits the caller's `onResult` callback. The callback can be async, which invites Sprint 12 to save each Title inside it. If that save fails, the `MatchStopped` error still lists the line as completed, even though the caller never committed it.
- **Why it matters:** A future import page could tell the user a line was handled when it wasn't. The editor is not affected, because its callback is synchronous and can't fail.
- **How much:** No current impact. This is a trap for the next sprint. Raised by Opus.
- **Where:** `src/client/matchLines.ts:78-79`.
- **Suggested fix:** Record the line as completed only after `onResult` resolves. Alternatively, state in the doc comment that "completed" means *matched*, not *committed*. Recommendation: move the push. It's a one-line change, and the meaning then holds for every caller.

### 6. `MatchStopped` declares its own `cause` and hides the built-in one  [Suggestion] · raised by Opus

- **What it is:** The error class declares its own `readonly cause` field instead of passing the cause to the standard `Error` constructor.
- **Why it matters:** Standard error chaining is the built-in way an error records "this was caused by that". Devtools and loggers display it automatically, and a hand-rolled field partly bypasses that.
- **How much:** Minor polish. Raised by Opus.
- **Where:** `src/client/matchLines.ts:13-19`.
- **Suggested fix:** Use `super(message, { cause })` and drop the `readonly cause` parameter property.

### 7. Things for Sprint 12 to know about the shared review controls  [Suggestion] · raised by Opus

- **What it is:** Two limits that are safe in the editor but could bite an async caller like the import page:
  - **Rows are identified by position.** Need a look reports which row was resolved by its position in the list, and the callback is captured when the user clicks. If an async save is still running and the caller replaces or reorders its rows, the wrong row gets resolved.
  - **Click blocking is per row.** Two review rows offering the same candidate (e.g. a duplicated pasted line) can both start saving the same Title at once.
- **Why it matters:** The editor avoids both because its addition is instant and it blocks a new paste while one is pending. Sprint 12's import page will await real saves, so it needs the same protections or a sturdier design.
- **How much:** No current bug. These are design notes for the next sprint. Raised by Opus.
- **Where:** `src/components/titles/TitleControls.tsx:244-270`.
- **Suggested fix:** Give each row a stable id from the owner (e.g. line key plus position) instead of relying on position alone. Optionally share one "currently adding" set, keyed by candidate, across all rows of a Need a look. At minimum, note both limits in the Sprint 12 brief.

### 8. The shared identity cache has no reset for tests  [Suggestion] · raised by Opus

- **What it is:** The cache that maps each TMDB result to its IMDb ID is module-wide and has no way to clear it. Tests avoid leaking state into each other only because each one uses unique IDs (21001…, 22001…).
- **Why it matters:** A future test that reuses an ID would quietly get a cached answer from an earlier test. That can produce confusing passes or failures that depend on test order.
- **How much:** Test hygiene only. Raised by Opus.
- **Where:** `src/client/titleIdentity.ts:11`.
- **Suggested fix:** Export a small test-only `clearIdentities()` and call it in `afterEach` in both test files.

---

**Tally:** 8 issues total (8 from Opus, 0 from Astra). 2 warnings, 6 suggestions.
**Overlaps to judge:** none noted. Astra raised no findings.
**Conflicts to resolve:**

- **The owner-isolation test (#1):** Astra's coverage table says `test/title-controls.test.tsx:277` "verifies a second owner does not inherit the first owner's choice". Opus showed by mutation that the test passes even with the memory shared across editors. Opus agrees the *code* is correctly scoped. The disagreement is only about whether the *test* proves it.
- **Search behaviour (#2):** Astra marks "Preserve Search … labels" and "prevent repeated clicks" as Satisfied and raises nothing about the main Search panel. Opus flags the new one-at-a-time lock and the disabled main search box as a change from the brief that the owner should confirm. Astra's table covers labels and repeated-click prevention. It doesn't address whether the stricter lock counts as a change in behaviour, so this may be a coverage gap rather than a direct contradiction.

## Auditor notes

**Astra:**

- **Verdict:** PASS. "No material defects or improvement recommendations were identified relative to the task specification." Fresh-context audit of the whole 12-file patch: package and lockfile changes, both new test files and tracking changes. Unchanged editor saving, Draft merging, list routing, parsing and API matching/lookup contracts were also inspected for integration.
- **Task coverage:** every Sprint 11 requirement is marked Satisfied, with file:line evidence. That covers:
  - the match loop (`matchLines.ts:23`, `:34`, `:48`, `:72`, `:73`, `:90`)
  - `MatchStopped` keeping completed results (`:13`)
  - the identity cache (`titleIdentity.ts:11`, `:16`, `:26`)
  - labels including IMDb-only Titles (`TitleControls.tsx:130`, `:193`)
  - the async addition contract (`:16`, `:155`, `:169-171`)
  - Add, Skip and prefilled search (`:282`, `:297`)
  - owner-scoped choices (`TitleDiscovery.tsx:45`, `:54`, `:113`; `src/pages/lists/[id].astro:22`)
  - repeat-paste reconciliation and summaries (`TitleDiscovery.tsx:52`, `:82`, `:112`, `:164`; `src/domain/merge.ts:151`)
  - busy tracking (`TitleDiscovery.tsx:30`, `:69`, `:105`, `:157`; `Editor.tsx:249`)
  - unmount cleanup (`TitleDiscovery.tsx:46`; `TitleControls.tsx:65`, `:125`)
  - Draft-only changes until Save (`Editor.tsx:248`, `:378`)
  - the required regression tests
  - the out-of-scope exclusions
- **Validation run:**
  - `pnpm test`: passed, 15 files and 149 tests. Run with `--no-cache --configLoader runner` to respect the report-only write constraint.
  - `tsc --noEmit --incremental false`: passed.
  - Source ESLint: passed.
  - `git diff --check d51dd707 e2db8d6`: passed.
  - `pnpm lint:check`: failed, solely on the independently modified `docs/movie_lists/midnight_movies.md`. That file's committed bytes pass Prettier separately.
- **Not run:** `pnpm build`, because the report-only constraint forbids generated output; the build success recorded in the sprint brief was accepted as supplied evidence. Browser checks were not repeated either, because the fixture harness was removed before commit. Component tests were run instead.
- **Residual risks:**
  - Live TMDB, real storage persistence, Workers and Nuvio acceptance were not exercised. The recorded browser checks used intercepted responses.
  - Production build success is supplied evidence, not a fresh audit run.
  - The workspace `pnpm lint:check` keeps failing while the unrelated movie-document change is present.

**Opus:**

- Audited HEAD `e2db8d6` against the sprint brief, comparing the new shared modules line by line with the pre-commit `TitleDiscovery.tsx` (`d51dd70`) to check that behaviour is unchanged.
- **Caveat:** the source views Opus audited from had `//` comments stripped by a shell output filter. That caused the incorrect parts of #3 and some shifted line numbers, both corrected above. Code behaviour findings are unaffected, because only comment lines were hidden.
- **Commands run:**
  - `pnpm test`: passed, 15 files and 149 tests.
  - A temporary mutation of `TitleDiscovery.tsx` (shared `resolutions` map) to test #1. The file was restored afterwards.
- **Not run:** `pnpm build` and `pnpm lint:check`.
- **Positives:**
  - The extraction matches the old behaviour (labels, reconciliation, summaries, button labels), and the editor has no second copy of the matching logic.
  - Async additions are awaited before a row resolves, and failures stay retryable. This is tested.
  - Small fixes picked up along the way:
    - `Search` ignores results that arrive after its request was aborted (`TitleControls.tsx:54`).
    - A batch response whose length doesn't match the request is now rejected (`matchLines.ts:46`).
    - `busy(-1)` now always runs on unmount (`TitleDiscovery.tsx:106`).
  - Remembered choices are correctly per instance, and the module-wide cache stores only TMDB-to-IMDb identity.
  - Thorough match-loop tests.
  - Stayed in scope. `happy-dom` was added as a dev dependency only.
