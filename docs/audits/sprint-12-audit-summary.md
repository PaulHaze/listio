# Audit Summary: sprint-12 — Import one list from text

Combined findings of Astra and Opus audits:

Astra's verdict is **FAIL**, with 1 critical finding. Opus raised 1 warning and 4 suggestions. Astra's critical (#1) and Opus's warning (#2) are both about getting stuck after a failed list creation. They cover different failure cases and propose different fixes. Opus's fix alone would not fix Astra's cases.

## Issues

### 1. Continue cannot recover a create that actually failed  [Critical] · raised by Astra

- **What it is:** Before sending the "create list" request, the import runner marks the create as uncertain (`uncertainCreate = true`). It leaves that flag set for *every* failed response. On every later Continue, the runner only looks for an existing list with that name:
  - If the saved index has no single matching name, Continue throws.
  - If it has one, Continue fetches that list and throws when it doesn't exist.

  Neither path can repair the list or start creation again. Creating a list (`putList`) also takes two storage writes, index first and then `list:{id}`. If the second write fails, the index keeps an entry that points to no list.
- **Evidence (Astra's reproduction):** Astra ran the committed runner against the real `POST /api/lists`, `GET /api/lists`, `GET/PUT /api/lists/{id}` and the real storage code, using an in-memory KV store that could inject faults. Only matching was stubbed, returning one confident Title. The list was named `Test` with input `Brick (2005)`.
  1. Make exactly the first `kv.put('list:test', …)` fail. All later storage operations are healthy.
  2. Import stops with the API's HTTP 500 error. Storage contains only `index`, and the run keeps no list ID.
  3. Continue finds the matching index entry, requests `/api/lists/test`, gets `Combined List not found.`, and stops again.
  4. Every further Continue repeats the same 404. The orphan is permanent, not a KV delay. Reopening the import page also rejects `Test` as an existing name, and that list's editor can't load.

  Failing the first `kv.put('index', …)` instead left nothing saved. Every Continue then only fetched the empty index and reported that the create outcome was still unknown. In both cases the one-off fault had passed, and no further create or save was attempted. The healthy control run completed with exactly one match request, one index read, one create and one save.
- **Why it matters:** A short-lived create failure makes the promised Continue workflow useless. The user has to throw away the matched results and start again by hand. In the partial-index case, a broken list entry also has to be cleaned up, and it blocks reusing the name. The form stays locked the whole time the run is stopped. The existing uncertain-create tests only simulate a successful create that shows up late, so they don't catch these failures.
- **How much:** Astra rated it Critical, because it fails the required interrupted-run recovery: Behaviour 6 and the "Done when" item "an interrupted run can be continued". Astra's assessment: the implementation note saying an absent or ambiguous result "only checks again" records this limitation. It doesn't satisfy or replace the original requirement, and the owner's answers didn't remove creation-failure recovery.
- **Where:** `src/client/importList.ts:112-134`; storage behaviour at `src/storage/lists.ts:66-67`; locked form at `src/components/import/ImportFromText.tsx:33`.
- **Related:** #2: Opus raised a different part of the same stuck-after-create problem. Kept separate for the owner to judge.
- **Suggested fix (Astra):**
  - Add a limited, explicit recovery path for failed or partial creation. It should safely reconcile and repair the reserved list, or restart once it is established that creation failed. Either way it keeps the snapshot and avoids creating a duplicate.
  - Don't treat one missing read, which may just be KV delay, as proof that repeating the POST is safe.
  - Where the current API can't establish the outcome, offer a concrete repair or restart action with server support behind it, instead of a Continue that never works.
  - Test both failures through the real route and storage functions: before the index write, and between the index and list writes.
- **Extra (Opus's note, an alternative angle):** One server-side option fits Astra's recommendation. Make `POST /api/lists` accept a client-generated id, or a repair flag, so that re-posting the same id is idempotent. The server would complete an index-only orphan and leave a fully written list untouched. Continue could then safely re-send the same request.

### 2. Name-taken and rejected creates also lock the form  [Warning] · raised by Opus

- **What it is:** Once the run stops, the name field, textarea, Upload and Import are all disabled. **Continue import** is the only button left. Two more failures can't be fixed by Continue:
  - **The name is taken by the time of creation.** The fresh index check throws `A list named "…" already exists. Open the existing list from Home.` Every Continue repeats the same check and fails the same way. The user can't rename, because the field is locked, so they have to reload and lose the match results.
  - **The server definitely rejects the create.** A 400 `NAME_ERROR` or any other 4xx response means nothing was written, but the create is still marked uncertain. Every Continue then looks for a list that doesn't exist and shows "The create response was lost…". The run can never recover, and the message is wrong.
- **Why it matters:** It partly misses Behaviour 6, "Continue import retries the unfinished work". Not repeating a create should only apply when its outcome is actually unknown.
- **How much:** Opus rated it a Warning. The owner is the only user, so it's a recoverable annoyance (reload the page) rather than data loss.
- **Where:** `src/client/importList.ts:124-135`, `:154-162`; `src/components/import/ImportFromText.tsx:33`.
- **Related:** #1: same stuck-after-create area, with different failure cases. The two auditors also suggest different fixes. Opus's fix keeps 5xx responses marked as uncertain, but Astra's reproduction shows that a 5xx from a failed storage write leaves the run permanently stuck. Opus's fix alone therefore wouldn't fix #1.
- **Suggested fix (Opus):**
  - In the POST `catch`, set `uncertainCreate` only when the error is *not* an `ApiError` with a 4xx status. That leaves network errors, aborts after sending and 5xx responses as uncertain.
  - When the run stops with `!state.list && !uncertainCreate`, unlock the name field and the form. That could be a new `'rejected'` phase, or a `locked` that ignores a list-less stop. The user can then rename and import again with the same matched results, or start over.

  Recommendation: do this together with whatever fixes #1. The unlock-and-rename path is useful in both.

### 3. The no-matches message blames the list format when TMDB is the problem  [Suggestion] · raised by Opus

- **What it is:** Some line failures are transient: a TMDB outage that survives the one retry, or a lookup failure that becomes `ambiguous` with an error reason. If every line fails that way, the run becomes final (`'empty'`) with a message like `TMDB is unavailable. No titles were found. Check the list format and try again.`
- **Why it matters:** The recorded policy asks for the specific matching error *or* the format hint, not both. Here the format hint sends the user looking for a problem in their list that isn't there.
- **How much:** Minor wording issue. Import still works as the retry, because the form unlocks in `'empty'`. Raised by Opus.
- **Where:** `src/client/importList.ts:87-99`.
- **Suggested fix:** If any review row has `retry` set, or a reason other than `'No match'`, show only that reason plus "Try again shortly". Keep the format hint for genuine no-matches.

### 4. A `client/` module depends on component code  [Suggestion] · raised by Opus

- **What it is:** The import runner in `src/client/` imports `createDraft` from `components/editor/draft.ts` and `ReviewLine` from `components/titles/TitleControls.tsx`.
- **Why it matters:** Shared client logic now depends on UI component modules, the wrong way round. Sprint 13 will reuse this runner, so the tangle would spread.
- **How much:** Code structure only. Raised by Opus.
- **Where:** `src/client/importList.ts:6-7`.
- **Suggested fix:** Move `ReviewLine` (and optionally `AddStatus`) to `src/client/` or `src/domain/`, and import it from there into `TitleControls.tsx`. Inline `createDraft`, which is just `{ ...list, newIds: new Set() }`, or move `Draft`/`createDraft` to `src/domain/`.

### 5. Error alerts show on an empty page  [Suggestion] · raised by Opus

- **What it is:** When the page opens with an empty name and empty text, it already shows "Enter a list name of 100 characters or fewer." and "Paste at least one title." as `role="alert"` errors.
- **Why it matters:** The user sees errors before doing anything, and screen readers announce them straight away. The spec asks for validation "as the user types, pastes or uploads", not before.
- **How much:** Minor UX and accessibility issue. Raised by Opus.
- **Where:** `src/components/import/ImportFromText.tsx:99-116`, `:153-157`.
- **Suggested fix:** Track whether each field has been touched, by an edit, an upload or an Import attempt. Show those two messages only after that. Import's disabled state stays the same.

### 6. The existing list is looked up twice in the name-error link  [Suggestion] · raised by Opus

- **What it is:** The "Open existing list" link runs `initialLists.some(...)` and then `initialLists.find(...)!` with the same trimmed, case-insensitive comparison inside the JSX.
- **Why it matters:** Repeated logic that is harder to read, and the `!` assertion depends on the two checks staying in sync.
- **How much:** Tidiness only. Raised by Opus.
- **Where:** `src/components/import/ImportFromText.tsx:102-109`.
- **Suggested fix:** Compute `const existing = initialLists.find(...)` once above the return, and render the link when `existing` is set.

---

**Tally:** 6 issues total (5 from Opus, 1 from Astra). 1 critical, 1 warning, 4 suggestions.
**Overlaps to judge:** #1 ↔ #2. Both are about a stopped run getting stuck after a failed create, with the form locked. They cover different failure cases (Astra: 5xx and partial storage writes; Opus: name taken and 4xx rejections) and are kept separate.
**Conflicts to resolve:**

- **Severity:** Astra rates the stuck-after-create problem Critical, a FAIL against the Behaviour 6 and Done-when requirements. Opus rates its part a Warning, a recoverable annoyance for a single user.
- **Fix approach:** Opus's fix keeps 5xx create failures marked as uncertain and offers no way to retry them. Astra shows that exactly those 5xx cases (a failed index write, or a failed list write after the index write) leave the run permanently stuck, and calls for a repair or restart path with server support. Opus's fix is not enough on its own for #1.
- **Coverage gap:** Opus only read the code and didn't model failures between the two storage writes. Astra reproduced both storage-boundary failures with a fault-injecting harness. Astra's evidence for #1 is the stronger of the two.

## Auditor notes

**Astra:**

- **Verdict:** FAIL. "Successful imports and persisted review are well covered, but the mandatory interrupted-run recovery behavior is incomplete for actual creation failures." Fix Critical 1 and verify both failed-create storage boundaries before considering the work complete. Deployed acceptance must still show the required lists in Nuvio.
- **Scope:** Astra read the complete original and committed specifications, with the owner's two answers taking precedence over the original open questions. Astra inspected all 13 changed files, including tests and docs, and also reviewed:
  - the shared matching, identity and review controls
  - editor Draft and save behaviour
  - validation, list APIs and KV writes
  - Basic Auth
  - Astro layout and navigation protection
  - addon manifest and catalog routes
  - test and build configuration
- **Task coverage:**
  - **Satisfied:**
    - home action and authenticated `/import`
    - name, textarea, upload (replacement only) and file-read errors
    - pure parser with separate name validation
    - blank lines, whitespace, years, bullets and repeated lines
    - the `//` policy and headings with line numbers
    - no spelling or year guessing, with editor comment behaviour unchanged
    - name rules
    - live errors blocking writes
    - snapshot, locked inputs and repeated-submit guards
    - shared batches, progress and retry (a 25-line test observed batches of 20, 5 and 5)
    - match before create and save
    - IMDb de-duplication with correct sequence numbers
    - zero-match behaviour
    - results counts, editor link and pending-save label
    - save-on-pick with retry
    - serialised additions and immutable row resolution
    - Skip, copy and removing the leave warning
    - a failed match creating no list
    - known-ID save retries
    - absurd and noir parsing as single lists, with midnight rejected
    - page-local progress only, and one-list scope
  - **Partially satisfied:**
    - uncertain-create reconciliation
    - reopening checks existing names (an orphan index entry blocks the name)
    - required automated checks, since the full suite, build and lint were supplied by the implementer
  - **Not satisfied:** an interrupted run continuing after a creation failure.
  - **Unable to verify:** absurd and noir showing as saved Catalogs in deployed Nuvio.
- **Validation:**
  - Targeted Vitest run of 5 files: **passed**, 31 tests. Run with caches disabled to respect the report-only boundary.
  - `git diff --check`: passed.
  - In-memory TypeScript and KV fault harness: the healthy control passed, and the creation-recovery defect was reproduced for both storage-write failures. The harness created no files.
  - The implementer reports the full 168-test suite, build and lint passing. Astra didn't rerun those in full, because the build writes generated output.
- **Residual risks:**
  - Deployed TMDB, Workers KV consistency and write behaviour, and Nuvio display were not exercised.
  - The UI was verified with happy-dom only, so clipboard and navigation confirmation weren't tested in a real browser.
  - The KV harness doesn't model eventual consistency. It only shows that the failure states are permanent even with consistent reads.

**Opus:**

- **Scope:** audited the 6 changed source files only, at the owner's choice. Opus also read the unchanged list `[id]` route, `savedDraft`, storage version checks, `addTitle`, `draft.ts` and `Editor.save()` for context. Tests weren't audited.
- **Commands run:** `pnpm test`, which **passed** with 18 files and 168 tests. Build and lint weren't rerun.
- **Positives:**
  - Careful creation that never repeats a POST it can't account for, and reconciles a lost save response through a version-aware reread.
  - Continue rematches only unfinished lines.
  - Save-on-pick is serialised, builds on the newest version, and follows Sprint 11's awaited-addition and row-identity rules.
  - The parser matches the recorded owner policy.
  - No list is created when nothing matches.
  - Leaving the page is guarded, including ClientRouter navigation.
  - The new `GET /api/lists` sits behind Basic Auth.
  - Upload rejects other file types and discards late file reads.
