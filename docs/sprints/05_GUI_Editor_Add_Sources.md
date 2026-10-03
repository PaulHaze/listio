# Sprint 05 — GUI: Editor — adding Sources

**Status:** implemented — pending deployed and Nuvio acceptance

## Goal

In the editor, paste Source URLs and pull their Titles into a Draft, ready for review.

## Tasks

- [x] React editor island mounted in `pages/lists/[id].astro`; loads saved list
- [x] Draft state (plan §6): titles, removed, sources, sort, newIds, change count
- [x] URL box + small `+` to add another; per-Source status (fetching / N Titles / N skipped / error)
- [x] `POST /api/sources/fetch` — detect + fetch + normalize (Sprint 02 modules)
- [x] Client-side merge into Draft (`domain/merge.ts`)
- [x] `POST /api/titles/enrich` — ≤40 Titles per request; client runs ~3 chunks in parallel
- [x] **Review List** button → review grid (basic render; full grid is Sprint 06)
- [x] `PUT /api/lists/{id}` save endpoint (version check, 409 on conflict)

## Done when

- Pasting two real URLs yields a de-duplicated Draft with posters filling in progressively
- A 500+ Title Source enriches fully without hitting Worker limits
- Saving persists the list and Nuvio shows the new Titles
- Deferred from Sprint 04: full CRUD check on the deployed build with a populated list — create, rename, delete and save Titles from the GUI, refreshing the addon in Nuvio after each to confirm the Catalog appears, renames, updates and disappears

## Implementation and verification

- React editor loads the server-rendered saved Combined List, keeps a separate Draft,
  merges overlapping Sources by IMDb ID, skips Removed Titles, fills metadata as chunks
  finish, and resets from the Save response. URL paste starts fetching immediately;
  typed URLs can be submitted with **Add Source**. Added Sources cannot be fetched again.
- Enrichment has one browser queue shared across Sources, with three requests in flight.
  Each request contains at most 40 Titles and budgets at most 40 upstream TMDB calls:
  a Title without a TMDB ID needs `/find` plus details, so an all-missing-ID chunk has
  20 Titles. The server validates both limits before making upstream requests.
- Save validates the full Draft, derives `nextSeq` on the server, preserves list identity,
  and returns 409 for an observed stale version. KV's existing eventual-consistency and
  non-atomic concurrency limitations still apply. Save waits for fetching/enrichment to
  finish; enrichment errors leave Titles available for saving.
- Trakt and MDBList imports stop with an explicit error after 40 API pages rather than
  importing a truncated Source. The budget counts every page, including pages whose
  records are all skipped. At the current 100-record page size this supports a 500+ Title
  Source with up to 4,000 records; larger Sources need a future continuation flow. This
  replaces the plan's silent 1,000-item Trakt cap.
- Automated verification: `pnpm test`, `pnpm build`, and `pnpm lint:check` passed.
  Tests cover 501-Title paginated Source fetching, 601-Title chunk processing, overlap and
  Removed-Title deduplication, request budgets, enrichment failures, save validation,
  persistence/index updates and version conflicts. Build reports only the TypeScript
  deprecation hint for `beforeunload.returnValue`, kept for browser compatibility.
- Local browser smoke with mocked upstream APIs: a 601-Title Source and an overlapping
  200-Title Source produced 700 unique enriched review cards; GUI Save persisted 700
  Titles and two Sources at version 2, and reload reset new IDs and unsaved changes.
  The temporary Combined List was deleted afterward. The existing development server
  needed a restart to clear stale React dependency optimization on first use of the island.

## Pending acceptance

These checks were **not** performed; this sprint is not yet accepted as complete:

- Paste two real public URLs and check progressive poster filling with real credentials.
- Verify a 500+ Title Source on the deployed Worker, including its actual subrequest limit.
- Save from the deployed GUI and confirm the new Titles appear in Nuvio.
- Complete the deferred Sprint 04 populated-list CRUD check on the deployed GUI, refreshing
  the addon in Nuvio after create, rename, save and delete to confirm Catalog behavior.

The full review grid (remove/restore, selection, views and progressive card rendering)
remains Sprint 06 work.

#### ✅ Summary of work — completed & audited 2026-10-03

_Full audit consolidation: [`audits/sprint-05-audit-summary.md`](../audits/sprint-05-audit-summary.md) (6 issues — 1 critical, 1 warning, 4 suggestions; Astra FAIL on unbounded Trakt pagination, all now fixed). Deployed/Nuvio acceptance above is still pending._

**Files created / changed:**

- `src/components/editor/Editor.tsx` **(new)** — React island: Source URL rows, per-Source status, progressive enrichment, basic Review List, Save with confirm and 409 handling.
- `src/components/editor/draft.ts` **(new)** — pure Draft helpers (`createDraft`, `addSource`, `applyEnrichment`) over `domain/merge.ts`.
- `src/components/editor/enrichment.ts` **(new)** — cost-aware chunking and one shared 3-wide enrichment queue.
- `src/tmdb/budget.ts` **(new)** — shared enrichment limits (`MAX_ENRICH_TITLES`, `MAX_ENRICH_REQUESTS`, `enrichmentCost`).
- `src/sources/errors.ts` **(new)** — shared `SourceRequestBudgetError`.
- `src/pages/api/sources/fetch.ts` **(new)** — detect + fetch + normalize, 40-page budget for Trakt and MDBList, sanitized errors.
- `src/pages/api/titles/enrich.ts` **(new)** — validates Title and TMDB-call budgets before enriching.
- `src/api/validate.ts` **(new)** — `savedDraft` validation for PUT.
- `src/pages/api/lists/[id].ts` — added `PUT` save with version check.
- `src/sources/trakt.ts`, `src/sources/mdblist.ts` — `maxPages` option that fails instead of truncating.
- `src/pages/lists/[id].astro`, `src/styles/main.css`, `src/env.d.ts` — island mount, editor styles, env typing.
- `test/editor.test.ts` **(new)**, `test/editor-routes.test.ts` **(new)**, `test/list-routes.test.ts` — Draft, queue, route-budget and save tests.

**Key decisions made:**

- Source imports fail with a 422 after 40 upstream pages rather than truncating; ⚠️ this replaces the plan's silent 1,000-item Trakt cap, and Sources over 40 pages need a future continuation flow.
- Save derives `nextSeq` and keeps `id` on the server; only editable fields are accepted from the client.
- Sort counts as one change only while it differs from the saved sort.

**Audit outcomes (owner-actioned 2026-10-03):**

- 🔴 **#1 (Critical, Astra) — fixed:** unbounded Trakt pagination; Trakt now uses the 40-page budget, counting pages of skipped records, with dense and sparse route tests.
- 🟡 **#2 (Warning, Opus) — fixed:** same Trakt gap and false sprint-doc claim; resolved by #1's change and the corrected note.
- 🔵 **#3 (Suggestion, Opus) — fixed:** sort toggles no longer inflate the change count.
- 🔵 **#4 (Suggestion, Opus) — fixed:** per-Source status numbers now add up.
- 🔵 **#5 (Suggestion, Opus) — fixed:** enrichment limits moved to `src/tmdb/budget.ts`; no server import from the component folder.
- 🔵 **#6 (Suggestion, Opus) — fixed:** lazy initialisers and review-only memoised sort in the editor.

`pnpm test` (68 tests), `pnpm lint:check` and `pnpm build` pass.
