# Audit Summary: sprint-13 — Import several lists from text

Combined findings of Astra and Opus audits:

Astra's verdict is **PASS WITH CONCERNS**, with 0 findings. Its concern is that deployed acceptance hasn't been checked, not a defect in the code. Opus raised 3 warnings and 9 suggestions. Astra's coverage table marks as "Satisfied" several requirements that Opus's warnings touch (#1, #2 and #3). Those differences are explained against each issue below.

## Issues

### 1. A section that keeps failing blocks the rest of the queue  [Warning] · raised by Opus

- **What it is:**
  - Once a multiple-list import starts, the page stays locked (`locked` is permanently true while `queue.current` exists). The section checkboxes, the textarea and Upload are all disabled.
  - Suppose a section always ends in the `empty` phase, meaning zero confident matches. For example, every line comes back `No match` because of bad spelling, or a TV block TMDB can't resolve. The queue stops on that section.
  - **Continue import** calls `retryEmpty()` and re-matches the same lines, so it fails the same way every time.
  - The section can't be unticked or skipped, so the sections after it can never run.
- **Why it matters:**
  - The only way out is to reload the page. That throws away the unresolved Need a look lines of the lists that already finished, which is exactly what Behaviour item 6 sets out to keep.
  - The sprint doc's "A failed section stops the queue" is right for short-lived failures, but it doesn't consider a failure that will never clear.
- **How much:** Opus rated it a Warning. It's recoverable by reloading and re-pasting, but the review work on finished lists is lost.
- **Where:** `src/client/importQueue.ts:37-42`; `src/components/import/ImportFromText.tsx:51-52, 206, 237`.
- **Coverage note:** Astra marks "Preserve zero-confident-match policy … stop queue and allow a fresh matching attempt on Continue" as **Satisfied**, citing `src/client/importList.ts:71-73,107-122` and `src/client/importQueue.ts:39-41`. That is accurate against the spec's wording. Astra didn't consider a section that fails every time, so the two audits aren't contradicting each other here. Opus is pointing at a gap in the spec, not a departure from it.
- **Suggested fix (Opus):** While the queue is stopped, let the user skip the first unfinished section. Two ways to do it:
  - Add a "Skip this list" button next to **Continue import** that marks the entry skipped.
  - Or keep the checkbox enabled for entries that haven't started or are `empty`, and have `continue` filter them out.

  Either way, completed runs and their review stay in place.

### 2. A `## ` header containing `//` silently disappears, and its titles join the previous list  [Warning] · raised by Opus

- **What it is:** `parseMultiple` skips any line containing `//` (`if (raw.includes('//')) return;`) *before* it checks whether the line is a header. A header like `## Movies // to sort` vanishes with no error:
  - Its titles are counted as part of the section above it.
  - If it was the first header, its titles become "above the first header" errors. Those errors point at the title lines, not at the real cause.
- **Why it matters:**
  - In single mode, ignoring a `//` line only loses that one line.
  - In multiple mode, ignoring a header line moves Titles into a *different* saved list without any warning.
  - That goes against this sprint's principle that other `#` lines "are errors rather than silently ignored".
- **How much:** Opus rated it a Warning. None of the headers in the current midnight file contain `//`, so the fixture isn't affected. The risk is to future lists.
- **Where:** `src/domain/pasteSections.ts:78`.
- **Coverage note:** Astra marks "the agreed policy ignoring every line containing `//`" as **Satisfied**. That's accurate, because the code follows Sprint 12's recorded policy. Opus agrees it follows the policy. Opus is pointing out that the policy has a bad side effect for headers specifically, which is a different question from whether the code complies.
- **Suggested fix (Opus):**
  - Check for a header *before* applying the `//` skip.
  - Then report `Line N: "## …" contains "//". Remove the comment from the header.` with the section's ID, so unticking that section clears the error.

  This needs an owner decision, because it narrows the Sprint 12 `//` policy for header lines only.

### 3. The midnight fixture test hardcodes counts from a list file that is still being edited  [Warning] · raised by Opus

- **What it is:**
  - `test/import-parser.test.ts` asserts exactly 25 sections and exact per-section title counts, read from `docs/movie_lists/midnight_movies.md`.
  - That file is a working list. The sprint doc says its additions are "awaiting assignment to sections".
  - Your current uncommitted edit has 34 `## ` headers. With it, `pnpm vitest run test/import-parser.test.ts` fails with `expected [ …(34) ] to have a length of 25 but got 34`.
  - The committed copy has 25 headers, so the test passes at `HEAD`.
- **Why it matters:** Every time you curate that list, `pnpm test` will break. Fixing it each time means rewriting the hardcoded counts.
- **How much:** Opus rated it a Warning. Code behaviour is fine, but the test suite is fragile in a way you'll hit straight away.
- **Where:** `test/import-parser.test.ts:168-188`.
- **Coverage note:** Astra's test run (187 passing) used the committed fixture. Astra said explicitly that the later working-tree edits to `midnight_movies.md` "were not audited, and the passing tests describe the earlier confirmed target inputs, not the subsequently edited fixture." Opus ran the tests after your edit. The two results don't conflict: they tested different versions of the file.
- **Suggested fix (Opus):**
  - Freeze a copy at `test/fixtures/midnight_movies.md` and run the exact-count assertions against it.
  - Against the live file, assert only that it's structurally valid: zero errors, at least one section, and a final TV section.
  - The alternative is to accept the churn and update the counts with each list edit. That's your call.
  - Either way, make the "creates 25 saved lists" Done-when criterion match whichever file is the acceptance input.

### 4. Need a look is disabled on every finished list while later sections are still importing  [Suggestion] · raised by Opus

- **What it is:** The Need a look controls are disabled with `disabled={busy > 0 || active}`, and `active` is a page-wide flag. During a 25-list run, you can't resolve list A's picks until the whole queue finishes or stops.
- **Why it matters:**
  - Picks save to their own list through `run.add`, so they can't clash with whichever section is currently processing. The lock is unnecessary.
  - The flag was carried over from Sprint 12, where `active` meant "this same list is busy".
- **How much:** UX friction only. Raised by Opus.
- **Where:** `src/components/import/ImportFromText.tsx:419`.
- **Coverage note:** Astra's coverage table notes "each result owns its busy state" (`ImportFromText.tsx:356-357,416-424`) as part of review isolation. It doesn't comment on the page-wide `active` flag.
- **Suggested fix (Opus):** Pass `active={['matching','creating','saving'].includes(run.state.phase)}` for each run, rather than the page-wide flag.

### 5. Renaming a rejected section during a queue run has no test  [Suggestion] · raised by Opus

- **What it is:**
  - If a queue entry is `rejected`, its name input re-enables. That happens when the name was taken on the server after the page loaded, because `initialLists` is out of date.
  - Typing there updates the preview and calls `run.rename`, and **Continue import** is gated on preview errors.
  - This is the only way to recover such a section, and no test covers it. The single-mode equivalent is tested at `test/import-review.test.tsx:217`.
- **Why it matters:** It's a recovery path whose logic spans the component and the runner, so it's easy to break without noticing.
- **How much:** Test-coverage gap. Raised by Opus.
- **Where:** `src/components/import/ImportFromText.tsx:256-274`.
- **Suggested fix (Opus):** Add a test where `GET /api/lists` returns the second section's name, then check that:
  - only that row's name input is enabled;
  - renaming clears the error;
  - Continue creates the list under the new name;
  - section 1 is not created again.

### 6. The list-name rules are written out three times  [Suggestion] · raised by Opus

- **What it is:** The 1–100 character check and the "already exists" comparison (trimmed, case-insensitive) appear in three places:
  - `validateImportName`
  - `validateImportSections`
  - the component's `existing` lookup
- **Why it matters:** The task says "Validate edited names with Sprint 12's rules". Three copies can drift apart, and the server-side check in `ImportListRun` uses `validateImportName`.
- **How much:** Maintainability only. Raised by Opus.
- **Where:** `src/domain/pasteSections.ts:52-66, 138-153`; `src/components/import/ImportFromText.tsx:55-57`.
- **Suggested fix (Opus):** Pull the rules into one shared helper, for example `nameTaken(name, existing)` plus `nameLengthOk`, and use it in all three places.

### 7. Blank names produce confusing error messages  [Suggestion] · raised by Opus

- **What it is:**
  - Two selected blank `##` headers each get "list names must be 1–100 characters". The second one *also* gets `Lines X and Y: two lists are named "".`
  - A blank-named section with no titles reads `"## " has no titles.`
- **Why it matters:** It's noisy and slightly confusing, though not wrong.
- **How much:** Wording only. Raised by Opus.
- **Where:** `src/domain/pasteSections.ts:136, 154-161`.
- **Suggested fix (Opus):**
  - Skip the duplicate and existing-name checks when the name is empty.
  - In the no-titles message, use the original header text or just `Line N:`.

### 8. The text is parsed twice on every screen update  [Suggestion] · raised by Opus

- **What it is:** `parseImport(text, 'single')` and `parseImport(text, 'multiple')` run on every re-render. During a queue run, the page re-renders for every match result. So a file of about 1,000 lines is re-parsed twice for each Title matched.
- **Why it matters:** It's wasted work. It's cheap today, but it grows with file size and list count.
- **How much:** Performance nicety. Raised by Opus.
- **Where:** `src/components/import/ImportFromText.tsx:39-40`.
- **Suggested fix (Opus):** Wrap both parses in `useMemo(() => …, [text])`.

### 9. Result panels are keyed by their position in a list  [Suggestion] · raised by Opus

- **What it is:** Each result panel is keyed by its array position (`key={index}`). React reuses a component by key, so a panel's local state (`busy`, `copyMessage`) can carry over to a different run if the array changes, for example a single run being replaced by a queue.
- **Why it matters:** Today this only causes a minor stale-state risk, but it's a trap for future changes.
- **How much:** Low. Raised by Opus.
- **Where:** `src/components/import/ImportFromText.tsx:327`.
- **Suggested fix (Opus):** Key by `sectionId` for queue runs, or `'single'` for the single run.

### 10. The queue repeats the same "find the first unfinished section" lookup  [Suggestion] · raised by Opus

- **What it is:** The `unfinished` and `progress` getters each run the same search for the first section that isn't completed.
- **Why it matters:** It's small duplication that could drift.
- **How much:** Tidy-up. Raised by Opus.
- **Where:** `src/client/importQueue.ts:21-31`.
- **Suggested fix (Opus):** Have `progress` use `this.unfinished` together with `indexOf`.

### 11. Section checkboxes are labelled only by line number  [Suggestion] · raised by Opus

- **What it is:** Each checkbox reads `Import section on line N` and doesn't include the list's name.
- **Why it matters:** A screen-reader user tabbing through 25 checkboxes hears only line numbers.
- **How much:** Accessibility polish. Raised by Opus.
- **Where:** `src/components/import/ImportFromText.tsx:248`.
- **Suggested fix (Opus):** Include the name, for example `Import "A" (line N)`.

### 12. No warning on leaving a stopped queue that has no unresolved lines  [Suggestion] · raised by Opus

- **What it is:** Suppose a queue stops partway and has unstarted sections, but no unresolved review lines and no pending save. Leaving the page then gives no warning.
- **Why it matters:** Recovering takes re-pasting the file and unticking the finished sections. A warning would prevent that by accident.
- **How much:** This follows the spec's wording, which only requires a warning while unresolved lines remain. Raised by Opus as an owner call.
- **Where:** `src/components/import/ImportFromText.tsx:74-87`.
- **Coverage note:** Astra marks the unload-warning requirement as **Satisfied** (`ImportFromText.tsx:66-87`). That's consistent with Opus, because this is a possible extension of the spec rather than a gap in meeting it.
- **Suggested fix (Opus):** Also warn when `queue.current?.unfinished` exists and the queue isn't active. Owner decision.

---

**Tally:** 12 issues total (0 from Astra, 12 from Opus): 3 warnings and 9 suggestions.

**Overlaps to judge:** #1 ↔ #12. Both are about losing state when a queue is stopped with sections left. #1 is about being unable to progress, #12 about being unable to leave safely. They're possibly related but address different things.

**Conflicts to resolve:** No direct factual disagreements. In #1, #2 and #12, Astra judged the code against the spec as written ("Satisfied"), while Opus raised gaps or side-effects in the spec itself. The test results differ in #3 because the two audits ran against different versions of `midnight_movies.md`.

## Auditor notes

**Astra:**

- **Verdict:** PASS WITH CONCERNS. Astra found no concrete implementation defects. The concern is that deployed end-to-end acceptance remains unverified: no real 25-list import against TMDB and Nuvio was done, so "each mostly matched" and the final series Catalog aren't established. Keep the sprint as "implemented; deployed acceptance pending".
- **Scope inspected:**
  - The complete patch, including both fixture changes, the sprint doc and all changed tests.
  - For integration, the unchanged matching, API, storage, shared review, import route and manifest code.
  - Against the original brief at the first parent `55bbb03`, Astra found no requirement deleted or weakened.
- **Fixture check:** The invalid scratch appendix was moved intact to `midnight_movies_additions.md`. An exact Git-blob comparison confirmed that the preceding content and the appendix were both preserved. The parser still rejects invalid headings.
- **Task coverage:** Every requirement row is **Satisfied**, with two exceptions:
  - "Import midnight into 25 saved lists … series Catalog visible in Nuvio" is **Unable to verify**.
  - "`pnpm test`, `pnpm build`, `pnpm lint:check` pass" is **Partially satisfied**. The build wasn't rerun, and lint wasn't run as a full-tree glob.

  Exclusions were respected: no collection export, no re-import into existing lists, no durable recovery, no new matching logic and no title-syntax changes.
- **Validation performed:**
  - `pnpm test --no-cache --configLoader runner`: passed, 20 files, 187 tests.
  - `astro check --noSync`: passed. 85 files, 0 errors, 0 warnings, and 2 existing `beforeunload.returnValue` deprecation hints (`Editor.tsx:109`, `ImportFromText.tsx:78`).
  - Prettier on tracked files: passed. The committed blob of the appendix was checked separately.
  - ESLint on `src/**`: passed.
  - `git diff --exit-code` against the target for the source, test, config and fixture files: passed.
  - `pnpm build`: **not rerun**, because it writes generated files. The implementer reported it passing.
  - Full-tree `pnpm lint:check`: **not rerun as a full-tree glob**, because that would include excluded user files.
  - Live TMDB, deployed storage and Nuvio acceptance: **not run**.
- **Working tree caveat:** External edits during and after the audit changed `midnight_movies.md` and deleted `midnight_movies_additions.md`. Astra didn't audit those edits, and its passing tests describe the committed fixture.
- **Residual risks:**
  - Live acceptance (25 lists, mostly matched, series Catalog in Nuvio) is still open.
  - The production build hasn't been independently rerun.
  - Native browser upload, clipboard and navigation prompts were tested only through component fixtures.
  - Sprint 12's KV eventual-consistency limits remain. The sequential mocked queue tests don't imply cross-writer guarantees.

**Opus:**

- **Scope match:** Every task checkbox has matching code and tests, and no non-goals are touched.
- **Tests run:** Opus ran only the three Sprint 13 test files, against the working tree. 23 passed and 1 failed, the fixture count test (see #3). Opus didn't run the build, lint or the full suite.
- **Positive observations:**
  - **Section identity:** source-line IDs keep identity separate from the editable name. Structural errors carry a `sectionId`, so unticking a section removes them cleanly, while global errors still block.
  - **Queue design:** `ImportQueue` is a thin wrapper over `ImportListRun`, so idempotent create, same-ID save retry and lost-response reconciliation are inherited from Sprint 12. The event-order assertions prove one section at a time, and that a pending save finishes before the next section.
  - **Review isolation:** each run owns its review rows and list, and the review test confirms identical picks land in the correct lists.
  - **Fixture handling:** the invalid appendix was moved out rather than loosening the parser.
