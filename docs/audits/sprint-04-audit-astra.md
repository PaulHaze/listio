# Commit audit

## Audit target

- Repository: `/Users/paulhayes/code/AI/nuvio_projects/listio`
- Branch: `sprint-04`
- Task: `Sprint 04 — GUI: Home & Combined List management`
- Specification: `docs/sprints/04_GUI_Home_Lists.md`, complete pre-commit document.
- Commit: `52d0ce5b55f11daecc1f76d8b01c233ca6347fd3` — `feat: add Combined List home management and API` (no commit body).
- Diff basis: `fbe475711fe332506b6f3a5e9fb8eab42db96c82..52d0ce5b55f11daecc1f76d8b01c233ca6347fd3`; normal, single-parent commit.
- Working tree: clean at the target commit throughout validation; only this report was added afterward.
- Report: `/Users/paulhayes/code/AI/nuvio_projects/listio/docs/audits/sprint-04-audit-astra.md`
- Verdict: **PASS WITH CONCERNS**

## Executive summary

The commit implements the Combined List home page, plain CSS, create/rename/delete APIs, confirmation, refresh notices, and an editor stub that loads its API. Sequential duplicate creation receives a `-2` suffix; rename preserves the stable ID and editor data. The existing storage and manifest integrations support the normal management flows. The sprint specification was marked complete without weakening its requirements.

One reproducible failure-recovery defect remains: an interrupted storage operation can leave a visible index entry without its list, and the new DELETE endpoint refuses to remove that entry. This is a warning about recovery from partial writes, rather than a failure of the ordinary successful workflow.

All 50 tests and changed-source ESLint passed independently. Read-only local HTTP checks passed. Browser automation could not start because its Chrome profile was already in use, and no production deployment or Cloudflare acceptance check was performed.

## Findings summary

| Category | Count |
| --- | ---: |
| Critical | 0 |
| Warnings | 1 |
| Suggestions | 0 |

## Critical findings

None.

## Warnings

### [Warning 1] DELETE cannot clean up a list left in the index by a partial write

**Location:** `src/pages/api/lists/[id].ts:26-28`. Related paths: `src/pages/api/lists/index.ts:11-12`, `src/storage/lists.ts:66-67`, `src/storage/lists.ts:71-74`, and `src/pages/index.astro:7`.

**Task requirement:** The home page must manage and delete Combined Lists through `DELETE /api/lists/{id}`, and deletion must be reflected in the addon manifest. This warning concerns recovery after a storage failure; ordinary deletes work.

**Evidence:** The DELETE handler returns 404 whenever `getList` returns null, before calling `deleteList`. The unchanged storage helper deliberately supports cleanup without a list: it deletes the key and filters the index. Two concrete partial-write paths reach the new guard:

1. During create, `putList` writes `index` successfully and the subsequent `list:{id}` write fails. The API returns 500. Retrying POST reserves the indexed ID and creates a suffixed list, leaving the original index row behind. DELETE of that original row returns 404 forever, even after KV has recovered.
2. During delete, removal of `list:{id}` succeeds and the subsequent index write fails. The API returns 500. Retrying DELETE returns 404 before attempting the unfinished index cleanup.

An in-memory Node harness imported the actual route modules and storage implementation and injected only these KV write failures. Observed output: failed create returned 500 with `weekend` still indexed; retry created `weekend-2`; deleting `weekend` returned 404 with the row unchanged. Failing the index write when deleting `weekend-2` returned 500 after removing its list key; retry returned 404 and both index entries remained. This does not rely on an eventual-consistency race.

**Impact:** The home page continues rendering the orphaned row from `index`, but opening, renaming, and deleting it all fail. After a partial deletion of a populated list, its index types also continue advertising stale catalogs in the manifest. The user cannot recover through the implemented UI and needs direct storage intervention. The existing non-atomic storage design is not itself the finding; the new API guard prevents its available cleanup operation.

**Recommendation:** Permit DELETE to reconcile an indexed ID even when its list key is absent, or make deletion idempotently clean both locations. If 404 for wholly unknown IDs is retained, distinguish absence from both the index and list from a partial-write state. Add route-level failure-injection tests for an interrupted create and an interrupted delete, asserting that a later delete removes the orphaned index row and manifest catalogs.

## Suggestions

None.

## Task coverage

| Requirement | Status | Evidence |
| --- | --- | --- |
| Base layout and plain CSS styling | Satisfied | `src/layouts/Layout.astro:75`; ordinary CSS rules in `src/styles/main.css:181` onward. |
| Home reads index and shows names, Title counts, and editor links | Satisfied | `src/pages/index.astro:7`, `src/pages/index.astro:48-58`; URL encoding is applied to IDs. |
| `+ New list` → name → POST → editor | Satisfied | `src/pages/index.astro:27-40`, `src/pages/index.astro:106-113`, `src/pages/index.astro:161-165`; API creation test in `test/list-routes.test.ts:53`. |
| Rename through PATCH, changing display name while retaining ID/data | Satisfied | `src/pages/api/lists/[id].ts:11-18`; `test/list-routes.test.ts:83` verifies ID, Titles, sort, and catalog identity are retained. Storage version and timestamp advance as expected. |
| Delete through DELETE with confirmation | Partially satisfied | `src/pages/index.astro:115-130`; ordinary API deletion is covered by `test/list-routes.test.ts:83`. Warning 1 describes the failed-operation recovery gap. |
| Exact addon refresh notice after create, rename, and delete | Satisfied | Home notice at `src/pages/index.astro:20-23`; editor notice at `src/pages/lists/[id].astro:21-24`; success redirects select `created=1` or `changed=1`. |
| GET `/api/lists/{id}` for editor loading | Satisfied | `src/pages/api/lists/[id].ts:6-8`, `src/pages/lists/[id].astro:57-75`; GET round-trip test and local missing-ID 404/no-store check. |
| Stub editor page | Satisfied | `src/pages/lists/[id].astro:13-47`; title/count, next-sprint placeholder, and missing-list 404 are present. |
| Browser management and corresponding addon manifest changes | Partially satisfied | UI wiring reviewed and real API/storage/manifest modules exercised by passing tests. Warning 1 affects failure recovery. Independent browser interaction and deployed acceptance remain unverified. Empty lists correctly have no advertised type under the existing manifest contract; populated lists retain their catalog IDs on rename. |
| Duplicate name produces `-2` ID | Satisfied | `src/pages/api/lists/index.ts:11-17`, existing `src/domain/slug.ts`; passing creation test at `test/list-routes.test.ts:53`. |

## Validation performed

- Repository state, target metadata, complete parent-to-commit diff, and both versions of the canonical sprint document — inspected. The full patch was read using `rtk proxy git diff --find-renames fbe475711fe332506b6f3a5e9fb8eab42db96c82 52d0ce5b55f11daecc1f76d8b01c233ca6347fd3 --` without truncation.
- Unchanged storage, slug generation, domain types, manifest/catalog consumers, layout/router, Node KV stand-in, deployment configuration, and integration tests — inspected for dependencies and regressions.
- `rtk proxy pnpm exec vitest run --no-cache --configLoader runner --update=none` — passed: **7 files, 50 tests**. Cache writing, config bundling, and snapshot updates were disabled to preserve the report-only write boundary.
- `rtk proxy pnpm exec eslint src/api/http.ts src/layouts/Layout.astro 'src/pages/api/lists/[id].ts' src/pages/api/lists/index.ts src/pages/index.astro 'src/pages/lists/[id].astro'` — passed.
- `rtk proxy git diff --check fbe475711fe332506b6f3a5e9fb8eab42db96c82 52d0ce5b55f11daecc1f76d8b01c233ca6347fd3 --` — passed.
- `rtk proxy node --experimental-strip-types --input-type=module -` with an inline, memory-only fault-injection harness — completed; independently reproduced Warning 1 against the actual API and storage modules. No persistent KV was modified.
- `rtk proxy python3 -` with inline read-only HTTP checks against `http://127.0.0.1:4322` — passed: home returned 200 with the new-list control; its local index was empty. Missing API list returned 404 with `Cache-Control: no-store`; missing editor returned 404.
- Playwright browser inspection — blocked before execution: `Browser is already in use`. The existing browser session was not closed or altered.
- `pnpm check` / `pnpm build` — not rerun: Astro synchronization/build can create or modify generated files, which this report-only audit forbids. The implementation agent reported successful typecheck/build, but those results were not independently established here.
- Deployment and live Nuvio checks — not run: outside this report-only audit and not authorized as part of it.
- Git status immediately before writing the report — clean on `sprint-04` at the target commit. No source, tests, configuration, plans, or dependencies were modified by this audit.

## Residual risks

- The local server uses the Node KV stand-in. It does not validate Workers KV propagation, write limits, or production routing. The final deployed acceptance specified by ADR 0004 remains unverified for this sprint; the implementation's `done` status is not evidence that it occurred.
- Browser success/failure interactions, confirmation cancellation, client navigation, and responsive rendering were source-reviewed but not independently executed in this audit. The implementation agent's browser verification is supplementary evidence only.
- Existing KV concurrency limitations remain as documented in storage and Sprint 03. This audit does not claim serializable creation or editing across simultaneous writers.

## Final verdict

**PASS WITH CONCERNS.** The normal Sprint 04 workflows are implemented and supported by passing API/storage/manifest tests. Correct Warning 1 to restore recovery from partial writes. The sprint can be treated as implemented with that recorded concern, but full deployment acceptance remains outstanding and was not established by this audit.
