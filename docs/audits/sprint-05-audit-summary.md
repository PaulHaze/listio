# Audit Summary: sprint-05 — GUI: Editor — adding Sources

Combined findings of Astra and Opus audits:

**What each audit covered:** Both audits reviewed the same commit, `d0436c0` (`feat: add Source Draft editor and versioned list saving`), against `docs/sprints/05_GUI_Editor_Add_Sources.md`.
- **Astra** gave the verdict **FAIL**. Astra ran the tests, TypeScript, lint and whitespace checks, and reproduced its Trakt finding with in-memory probes.
- **Opus** only read the code and ran no checks. It raised one warning and four suggestions.

Both auditors independently found the same Trakt pagination problem (#1, #2).

## Issues

### 1. Trakt imports have no page limit, so one Source can exceed the Worker's request budget [Critical] · raised by Astra

- **What it is:** The new Source route calls the Trakt fetcher with only `{ clientId: key }`. MDBList, by contrast, gets `maxPages: 40`. If you don't pass a limit, the Trakt helper sets `maxItems` to `Infinity` and keeps asking for pages until Trakt says there are no more. There is no separate page or request budget. The route therefore exposes the helper's unlimited mode inside a single Worker request, which has a limited budget. The sprint doc says "an existing 1,000-Title cap remains in place", which is false for this path. `test/editor-routes.test.ts:32-63` only tests a one-page Trakt list. The request-budget tests cover MDBList and TMDB only.
- **Task requirement:** Source fetching has to support a 500+ Title Source without hitting Worker limits (`docs/sprints/05_GUI_Editor_Add_Sources.md:14,23`). The implementation plan documents a 50-request budget per Worker invocation (`docs/implementation-plan.md:10`), and a Trakt flow of 100-item pages with at most 1,000 items (`docs/implementation-plan.md:106-107`).
- **Evidence (Astra's reproduction):** Two in-memory Node probes imported the committed `fetchTrakt` and passed exactly the route's options plus a fake `fetch`, with no real network calls and no file writes.
  - 11 pages of 100 valid, unique movie Titles each (`x-pagination-page-count: 11`) returned **1,100 Titles in 11 calls**.
  - 51 pages advertised, each with 100 movie records but only 10 valid, unique IMDb IDs. That's **510 usable Titles**; the rest were correctly skipped. A fake upstream that throws after call 50 recorded **51 attempted calls**, and the fetch failed with `Simulated Worker external subrequest limit exceeded`.
  - An earlier 51-page probe where every record was valid also reached call 51.

  These reproduce the request count reliably. They don't claim a deployed Worker was run.
- **Why it matters:** At the platform budget the repo targets, a Trakt Source with enough pages fails before any Titles reach the Draft. The route turns that into a generic 502 error, and the editor tells you to retry a request that will fail the same way. A Source with only 510 usable Titles can still hit this, because pages full of skipped records use up requests. Large, dense Sources also go past the documented import limit. TMDB chunking can't help, because the failure happens earlier, during the Source fetch.
- **Where:** `src/pages/api/sources/fetch.ts:27-30`. Supporting helper code: `src/sources/trakt.ts:194-203`, `src/sources/trakt.ts:215-229`. Inaccurate sprint-doc note: `docs/sprints/05_GUI_Editor_Add_Sources.md:41-44`.
- **Related:** #2. Opus raised the same problem as a Warning. Kept separate for the owner to judge.
- **Suggested fix (Astra):** Enforce an explicit Trakt request or page budget at the Worker boundary. It must count pages full of skipped or unsupported records too. Implement the intended 1,000-item policy explicitly, and tell the user about any cap or truncation. If a Source needs more requests than one invocation allows, either use a continuation flow or return a clear budget error before the budget runs out, as MDBList already does. A `maxItems` limit alone won't protect against sparse pages. Add route-level tests for a dense oversized Source and for a sparse Source, checking the number of upstream calls and the response. Correct the sprint note so it describes the policy that is actually enforced.

### 2. Trakt Sources have no page or item cap; the sprint doc's 1,000-Title claim is false [Warning] · raised by Opus

- **What it is:** `fetch.ts:29` calls `fetchTrakt(source, { clientId: key })` without `maxItems` or a page budget. `TraktFetchOptions` says "Lists have no size cap by default" (`src/sources/trakt.ts:30`), and nothing in `src/` passes `maxItems`. The loop at `src/sources/trakt.ts:201` keeps requesting 100-item pages until the list ends.
- **Why it matters:** A Trakt list with more than about 5,000 items makes more than 50 upstream requests in one Worker invocation, which is over the Free-plan subrequest limit. The request that crosses the limit throws. The route's catch-all turns that into a 502 with "Unable to fetch this Source. Check the URL and try again.", which is misleading because the URL is fine. This contradicts the sprint doc ("Trakt's existing 1,000-Title cap remains…") and plan §4 ("≤1,000 items max"). It's also inconsistent with MDBList, which got `maxPages: 40` in the same commit.
- **Where:** `src/pages/api/sources/fetch.ts:29`, `src/sources/trakt.ts:30`, `src/sources/trakt.ts:201`
- **Related:** #1. Astra raised the same problem as Critical and also proved that sparse pages trigger it at only 510 usable Titles, a case Opus didn't consider. Kept separate.
- **Suggested fix (Opus):** Give Trakt the same treatment as MDBList. Add a `maxPages` option to `fetchTrakt` that throws `SourceRequestBudgetError` before it requests page `maxPages + 1`, and pass `maxPages: 40` from `fetch.ts`. Move `SourceRequestBudgetError` into a shared module such as `src/sources/errors.ts`, and add a route test that mirrors the MDBList 40-page test. Opus also offered `maxItems: 1000` (the plan's literal cap) as an alternative, but noted that it silently truncates. Astra's point in #1 rules it out as the *only* safeguard, because it doesn't limit requests on sparse pages. Recommendation: use the page budget, and optionally add a 1,000-item cap on top only if you're happy with truncation. Fix the sprint doc sentence either way.

### 3. Changing the sort always counts as a change, even when you switch back [Suggestion] · raised by Opus

- **What it is:** Every change to the sort dropdown adds 1 to the Draft's `changes`. Picking *A–Z* and then going back to the saved *Newest* leaves `changes: 2`, even though nothing has really changed.
- **Why it matters:** The Save button stays visible, the status line says "2 unsaved changes", and you get a "leave this page?" warning for a Draft that matches the saved list. It's misleading but harmless.
- **Where:** `src/components/editor/Editor.tsx:357-363`, `src/components/editor/Editor.tsx:101-109`
- **Suggested fix:** Don't count sort as a running total. Derive it from `draft.sort !== saved.sort`, for example `totalChanges = draft.changes + (draft.sort !== saved.sort ? 1 : 0)`. Use `totalChanges` for the Save button visibility, the status line, the confirm text and the `beforeunload` warning.

### 4. The per-Source status numbers don't add up [Suggestion] · raised by Opus

- **What it is:** The status line shows "N Titles · X new · Y skipped (Z — no IMDb ID)". N only counts Titles the server returned, which already excludes items with no IMDb ID and invalid items. Y adds the "already in list" duplicates (which are inside N) to the no-IMDb and invalid counts (which aren't). Example: 100 returned, 80 new, 20 already in the Draft, 5 with no IMDb ID shows "100 Titles · 80 new · 25 skipped (5 — no IMDb ID)", and 80 + 25 ≠ 100.
- **Why it matters:** It's cosmetic, but the user can't make the numbers reconcile.
- **Where:** `src/components/editor/Editor.tsx:144-146`
- **Suggested fix:** List the categories separately, for example "100 Titles · 80 new · 20 already in list · 5 skipped (no IMDb ID)". Or make N the total received, so that new + skipped = N.

### 5. A server route imports from the editor component folder, and the 40-Title limit is copied in two places [Suggestion] · raised by Opus

- **What it is:** The `/api/titles/enrich` route imports its budget helpers from `src/components/editor/enrichment.ts`, so server code depends on the browser island's folder. The 40-Title limit is also written as a bare number in two places: the client chunker and the server check. The error message repeats it a third time.
- **Why it matters:** This is about maintainability. If the limit changes on one side only, the client will send chunks the server rejects with a 400.
- **Where:** `src/pages/api/titles/enrich.ts:5-8`, `src/pages/api/titles/enrich.ts:16`, `src/components/editor/enrichment.ts:14`
- **Suggested fix:** Move `enrichmentCost`, `MAX_ENRICH_REQUESTS` and a new `MAX_ENRICH_TITLES = 40` into a shared non-UI module (for example `src/tmdb/budget.ts`). Import them from both the route and the client chunker.

### 6. The editor repeats work on every render [Suggestion] · raised by Opus

- **What it is:** The editor re-renders once for each enrichment chunk, which is about 18–35 times for a 700-Title Source. On every render it:
  - rebuilds the "already requested URLs" set by running URL detection over every saved Source (`Editor.tsx:70-80`);
  - builds a new enrichment queue and a new AbortController (`Editor.tsx:81-82`);
  - copies and sorts the whole Draft, even when the Review List isn't open (`Editor.tsx:225`).

  `useRef` keeps only the first value, so the rebuilt ones are thrown away.
- **Why it matters:** It's wasted work with no wrong results today. It will matter more when Sprint 06 adds the full grid.
- **Where:** `src/components/editor/Editor.tsx:70-82`, `src/components/editor/Editor.tsx:225`
- **Suggested fix:** Create these values once with lazy initialisers (e.g. `useState(() => new Set(...))`). Only sort when `review` is true, inside `useMemo(..., [draft.titles, draft.sort])`.

---
**Tally:** 6 issues total (1 from Astra, 5 from Opus). 1 critical, 1 warning, 4 suggestions.
**Overlaps to judge:** #1 ↔ #2 (both describe the missing Trakt budget; Astra rated it Critical, Opus rated it Warning).
**Conflicts to resolve:** No factual disagreement. The audits differ in two ways:
- **Severity of the Trakt problem:** Astra says Critical, Opus says Warning.
- **Remedy:** Opus offered `maxItems: 1000` as an alternative fix. Astra explicitly says `maxItems` alone doesn't protect sparse pages, and its 510-usable-Title reproduction backs that up.

## Auditor notes

**Astra: verdict and summary.** **FAIL.** The commit delivers a working React editor with separate saved and Draft state, Source fetching and merging, metadata that fills in progressively, a basic review grid, and validated versioned saves. The browser enrichment queue keeps three requests in flight and budgets both Titles and actual TMDB calls; Titles with no TMDB ID correctly shrink the chunk size. The existing merge, storage and addon modules handle deduplication, remembering Removed Titles, and publishing as expected. Critical 1 must be fixed before the implementation is ready. Sprint 05 should stay incomplete until the real-URL, deployed Worker and Nuvio checks are recorded as successful. No implementation changes were made during the audit.

**Astra: checks run.**
- Full diff `3ab3053..d0436c0` inspected, all 16 files. The full sprint doc was read; the acceptance criteria were not deleted or weakened.
- Read-only repository checks passed: root, branch, target, first parent, unique Sprint 05 doc, writable report directory. The working tree stayed clean before the report was written.
- `pnpm exec vitest run --no-cache --no-fsModuleCache --configLoader runner`: passed, **9 files, 65 tests**.
- `pnpm exec tsc --noEmit --incremental false`: passed. This doesn't replace a fresh Astro build.
- `pnpm lint:check`: passed (Prettier + ESLint, no fix flags).
- `git diff --check 3ab3053 d0436c0`: passed.
- Node in-memory Trakt probes reproduced Critical 1: 11 calls returned 1,100 Titles, and the sparse case with 510 usable Titles attempted a 51st call.
- `pnpm check` / `pnpm build` were not run, because they write generated files, which the audit rules forbid. The handoff's passing-build claim was not treated as independent evidence.
- Real-URL browser, deployed Worker and Nuvio checks were not run. The audit is read-only, and the sprint doc itself records these as pending.

**Astra: task coverage.**

| Requirement | Status | Evidence |
| --- | --- | --- |
| Paste Source URLs and build an unsaved Draft | Satisfied | `Editor.tsx:111-186,265-270` calls the Source API and merges locally. Saving only happens in `save()` at line 188. |
| React island mounted in `pages/lists/[id].astro`, loading the saved list | Satisfied | `[id].astro:9,22` loads the list from KV and passes it to `<Editor client:load>`. A missing list returns 404. `Editor.tsx:57-59` initialises saved and Draft state. |
| Draft has titles, removed, sources, sort, newIds and change count | Satisfied | `draft.ts:9-35`. `test/editor.test.ts:43` checks the saved state is left alone, new IDs, Removed memory and the change count. |
| URL input plus a small `+` button for another Source | Satisfied | `Editor.tsx:237-306` |
| Per-Source fetching, count, skipped and error status | Satisfied | `Editor.tsx:116-149,164-183,285-316`. Route errors leave out upstream bodies that could contain credentials. |
| `POST` Source detect, fetch and normalise using Sprint 02 modules | Partially satisfied | `fetch.ts:12-41` connects both fetchers. Tests at `test/editor-routes.test.ts:32,65,88,110`. Trakt's missing budget is Critical 1. |
| Merge through `domain/merge.ts`, de-duplicate overlaps and skip Removed Titles | Satisfied | `draft.ts:20-34` and the unchanged `merge.ts`. `test/editor.test.ts:43` |
| Enrichment accepts ≤40 Titles, about 3 chunks in parallel | Satisfied | `enrich.ts:13-19`, `enrichment.ts:5-23,27-57`. Tests at `test/editor.test.ts:75`, `test/editor-routes.test.ts:127,140` |
| Metadata fills in progressively; a failed enrichment keeps Titles usable | Satisfied | `Editor.tsx:151-173`, `draft.ts:38-56`. Tests at `test/editor-routes.test.ts:173`, `test/editor.test.ts:105` |
| Review List opens a basic review grid | Satisfied | `Editor.tsx:331,349-399`. The full grid is Sprint 06. |
| `PUT` save validates the Draft and returns 409 when its version is out of date | Satisfied | `[id].ts:50-68`, `validate.ts:42-87`, `putList`/`apiError`. `test/list-routes.test.ts:124,162`. The existing KV consistency limitations still apply. |
| Save confirmation, unsaved-changes warning, reset from the Save response | Satisfied | `Editor.tsx:101-109,188-216` |
| Two real URLs give a de-duplicated Draft with posters filling in | Unable to verify | Local tests pass. Real-URL acceptance is pending (sprint doc line 60). |
| A 500+ Title Source enriches fully within Worker limits | Partially satisfied | The MDBList (501) and queue (601) tests pass. Trakt can exceed the limit with 510 usable Titles (Critical 1). Deployed acceptance is pending (line 61). |
| Save persists Titles and Nuvio shows them | Partially satisfied | The `PUT` persistence and index tests pass, and the addon builders read the saved fields correctly. Checking in Nuvio is pending (line 62). |
| Deferred Sprint 04 populated-list CRUD check on the deployed GUI | Unable to verify | `test/list-routes.test.ts:51,78,124` cover the API locally. The deployed GUI and Nuvio checks are pending (lines 63-64). |
| Sources are static snapshots; an already-added URL can't be fetched again | Satisfied | `Editor.tsx:69-80,125-133`. No scheduled sync was added. |
| Full Sprint 06 grid features | Not applicable | Deferred by the brief. |

**Astra: remaining risks.**
- The original acceptance checks are still needed: real upstream behaviour, posters filling in with real credentials, running on the production Worker, and populated-list CRUD in Nuvio. Missing evidence isn't proof of a defect.
- KV can't serialise writers that save at the same time, and it is eventually consistent. Writes to the two keys aren't atomic. These are existing, documented limitations, not new findings.
- MDBList Sources that need more than 40 pages are deliberately rejected with an explicit error. Supporting them needs a future continuation flow.
- The tests don't mount the React island. Astra did not repeat the implementer's mocked 700-Title browser smoke test.

**Opus: positive observations.**
- The enrich route rejects more than 40 Titles *and* more than 40 TMDB calls before it calls TMDB. `enrichmentCost` matches what `tmdb/enrich.ts` actually does.
- MDBList fails rather than truncating: `SourceRequestBudgetError` returns a 422 before page 41.
- `savedDraft` only takes the editable fields from the client, keeps `id`/`updatedAt` from the server, and works out `nextSeq` on the server across `titles` and `removed`. It also rejects duplicate IMDb IDs and duplicate `addedSeq` values. A test proves a request body with a forged id and `nextSeq` can't change the list.
- Upstream error bodies are kept out of responses in both new routes, and tests check this.
- One enrichment queue is shared across Sources. A test proves no more than 3 requests are in flight across two Sources, and that one failed chunk doesn't stop the others.
- `addSource` and `applyEnrichment` don't modify their inputs. Enrichment can't change a Title's identity, type or order, and Save resets the Draft from the server's response.
- Save is blocked while Sources are fetching or enriching, and `beforeunload` covers in-progress work. Aborted requests don't update state after the editor unmounts.
