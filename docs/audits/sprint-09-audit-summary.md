# Audit Summary: sprint-09 — IMDb Source

Combined findings of Astra and Opus audits:

Inputs: `docs/audits/sprint-09-audit-opus.md` (Opus) and `docs/audits/sprint-09-audit-astra.md` (Astra). Both audited commit `b379942` ("feat: import IMDb Sources with CSV fallback") against `docs/sprints/09_IMDb_Source.md`.

Astra gave a **PASS** verdict with no findings: 0 critical, 0 warnings, 0 suggestions. Every issue below comes from Opus. Neither auditor found a critical defect.

## Issues

### 1. Mobile IMDb links (`m.imdb.com`) are rejected  [Warning] · raised by Opus
- **What it is:** The URL detector accepts only `imdb.com` and `www.imdb.com` as IMDb hosts. A list link from IMDb's mobile site or share sheet looks like `https://m.imdb.com/list/ls…/`, and pasting one shows "Unsupported source URL".
- **Why it matters:** It is the same list with the same ID, and the code already rewrites the URL to the `www.imdb.com` form. A user pasting from a phone gets an error for no real reason. The sprint task says "recognise `imdb.com/list/ls…`", and a mobile share link is a reasonable reading of that.
- **How much it matters:** Moderate. It is a usability gap for mobile-sourced links, not a data or security problem.
- **Where:** `src/sources/detect.ts:120` (IMDb branch), via `hostIs` at `src/sources/detect.ts:46`. The test cases to extend are at `test/imdb.test.ts:26`.
- **Coverage note:** Astra's task-coverage table says detection "accepts the IMDb host… and rejects unrelated URLs". It did not mention `m.imdb.com` either way. This is a difference in what each auditor looked at, not a direct contradiction.
- **Suggested fix:** Change the check to `hostIs(parsed.hostname, 'imdb.com', 'm.imdb.com')`. Add `https://m.imdb.com/list/ls004285275/` to the "recognizes and canonicalizes" test cases at `test/imdb.test.ts:26`.

### 2. IMDb failures leave no trace in the logs  [Suggestion] · raised by Opus
- **What it is:** When an IMDb import fails, the route turns every cause into the same friendly "upload a CSV instead" response and discards the actual error. Causes include a bad HTTP status, GraphQL errors, a changed response shape and a timeout.
- **Why it matters:** IMDb's GraphQL endpoint is unofficial. It depends on browser-style client headers (`imdb-web-next`) and a raw query, so it is the Source most likely to break without warning. When it breaks, Cloudflare Workers logs will show nothing, and diagnosing the problem means reproducing it by hand.
- **How much it matters:** Low today, but it makes a likely future breakage harder to diagnose.
- **Where:** `src/pages/api/sources/fetch.ts:54-62`
- **Related:** #3 involves the same `if (imdb)` error branch, but a different concern (the response contract rather than logging). Kept separate for the owner to judge.
- **Suggested fix:** In the `if (imdb)` branch, before returning, add `console.warn('IMDb import failed', error instanceof Error ? error.message : error)`. This is safe because the errors thrown in `src/sources/imdb.ts` never include upstream response bodies.

### 3. The server's `fallback: 'imdb-csv'` signal is never read  [Suggestion] · raised by Opus
- **What it is:** The route sends `fallback: 'imdb-csv'` in its error response, but the editor ignores it. The editor shows the CSV upload whenever an IMDb row fails (`site === 'imdb'`), whatever the reason. That includes being offline, a Worker 500, or an expired Basic Auth session.
- **Why it matters:** The response field is an unused contract. It suggests the server controls when the fallback appears, but it does not. In practice the effect is mild: CSV parsing runs in the browser, so offering the upload even when offline still works.
- **How much it matters:** Low. This is tidiness and contract clarity, not a user-facing bug.
- **Where:** `src/pages/api/sources/fetch.ts:59` (field sent) and `src/components/editor/Editor.tsx:238` (client decides by `site === 'imdb'` instead).
- **Related:** #2 involves the same route error branch with a different concern. Kept separate.
- **Suggested fix:** There are two options. (a) Remove `fallback` from the response and keep the client's site-based rule. (b) Make `api()` expose the parsed error body on `ApiError` and set `csvFallback` from it. Opus recommends (a) as the simpler option.

### 4. An empty IMDb list counts as a successful import, which may hide a non-title list  [Suggestion] · raised by Opus
- **What it is:** If IMDb's first page is empty and says there are no more pages, the import succeeds with 0 Titles. This is deliberate and tested. However, IMDb *people* lists and *image* lists also use `ls…` IDs. If IMDb returns an empty title list for those, rather than an error, the user sees "0 Titles" and is not offered the CSV upload.
- **Why it matters:** Someone who pastes a non-title list gets a quiet empty result instead of a clear fallback. The "0 Titles" message is at least accurate.
- **How much it matters:** Low, and **unverified**. Opus did not check how IMDb actually responds for a people list.
- **Where:** `src/sources/imdb.ts:146` (terminal-page return), tested at `test/imdb.test.ts:126`.
- **Coverage note:** Astra listed "rejects malformed/error responses" as covered and did not raise this case. It is not a contradiction. Opus's point depends on an IMDb behaviour neither auditor confirmed.
- **Suggested fix:** First, run a quick live check against a public IMDb people list. If it returns empty edges, treat "0 Titles and 0 skips on page 1" as a failure, so the CSV fallback appears. If it returns an error, no change is needed. Leaving it as is is also a valid choice, given the honest message.

---
**Tally:** 4 issues total (4 from Opus, 0 from Astra): 1 warning, 3 suggestions.
**Overlaps to judge:** #2 ↔ #3 (same route error branch, different concerns: logging vs. response contract).
**Conflicts to resolve:** No direct factual disagreements. The two overall verdicts differ: Astra says "no material defects or improvement recommendations", while Opus raises 1 warning and 3 suggestions. Both agree there are no critical defects and that the sprint's tasks and acceptance criteria are met.

## Auditor notes

### Astra
- **Verdict:** PASS. Sprint 09 meets its implementation and acceptance requirements with reasonable confidence, and no implementation follow-up is required.
- **Scope reviewed:** The full 13-file diff (`b3cd92d..b379942`), including every fixture and all 1,764 lines of `test/fixtures/imdb-live.json`. The working tree had unrelated uncommitted changes only in `docs/movie_lists/midnight_movies.md` and `docs/sprints/11_Import_Multiple_Lists_From_Text.md`.
- **Task coverage (all marked Satisfied):**
  - URL recognition: `src/sources/detect.ts:119`, tests at `test/imdb.test.ts:27`.
  - GraphQL fetch with cursor pagination: `src/sources/imdb.ts:6` and `:70`.
  - Title-type mapping: `src/sources/imdb.ts:22`, with a shared normaliser at `:43`.
  - Deployed Cloudflare verification: `docs/sprints/09_IMDb_Source.md:24`, deployment `83dd8bbb-17b7-47bf-910d-cbd25c8499fc`.
  - CSV prompt after failure: `src/pages/api/sources/fetch.ts:53`, `src/components/editor/Editor.tsx:233` and `:451`.
  - CSV parsing: `src/sources/imdb.ts:199` and `:156`.
  - Fixture tests: 41 cases in `test/imdb.test.ts`.
  - Live import or clean fallback: `docs/sprints/09_IMDb_Source.md:28`.
  - CSV produces the same Titles: `test/imdb.test.ts:44`, `docs/sprints/09_IMDb_Source.md:33`, `src/api/validate.ts:43`.
  - Deferred items (Simkl, addon catalogs) were not started.
- **Validation run:**
  - `pnpm test -- --cache=false`: 12 files, 130 tests, 41 of them IMDb cases, all passing.
  - `tsc --noEmit`: clean.
  - Prettier and ESLint on the changed files: both passed.
  - A **live call** of `fetchImdb` against public list `ls004285275`: 2 pages, 125 Titles, 0 skips. The first Title was `tt0190332` and the last `tt6751668`.
- **Not rerun:**
  - `pnpm build` and `pnpm check`, to avoid writing artifacts. The build is recorded as passing in the sprint doc, and `tsc` passed independently.
  - The repo-wide `pnpm lint:check`, which is blocked by unrelated Sprint 11 doc formatting.
  - The deployed browser upload and save flow. Astra relied on the committed verification record for this.
- **Residual risks:**
  - The CSV fixture is synthetic rather than a real authenticated IMDb export. This is a provenance limit, not an observed defect.
  - Deployed behaviour relies on the implementer's recorded checks.
  - IMDb may change its GraphQL API. This is mitigated by bounded pages, rejection of error and malformed responses, cursor-loop guards and the CSV fallback.
  - A cross-tab "changed elsewhere" alert appeared after a successful save. That logic is unchanged by this commit, so it is not a Sprint 09 defect.

### Opus
- **Scope reviewed:** `src/sources/imdb.ts`, `src/sources/detect.ts`, `src/pages/api/sources/fetch.ts`, `src/components/editor/Editor.tsx` and `test/imdb.test.ts`. Fixtures and `imdb-README.md` were read as context. Opus reviewed the source only and did not run tests or call IMDb live. Astra did both.
- **Positive observations:**
  - No partial imports. Every failure path throws, and the second-page 403 test confirms the upstream body does not leak (`test/imdb.test.ts:214`).
  - GraphQL and CSV share one `normalize()`, so both produce the same Titles by construction (`test/imdb.test.ts:44`).
  - The CSV parser is strict. It finds columns by header name, rejects duplicate or missing headers and ragged rows, handles BOM, CRLF, escaped quotes and newlines, and gives actionable errors.
  - URL detection is tight and canonical. Ports, credentials, extra path segments and look-alike hosts are rejected, and query strings and fragments are dropped.
  - The editor fallback is well contained. It appears only after an IMDb failure and hides when the URL is edited. The file input resets, the 5 MB cap is checked first, and a failed fetch frees the URL for the CSV retry. Results go through the existing merge, removal memory and enrichment (`test/imdb.test.ts:165`).
  - No new secrets. The API-key check is skipped only for IMDb, and the Trakt and MDBList paths are unchanged.
