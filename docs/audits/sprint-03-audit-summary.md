# Audit Summary: sprint-03 — Storage & Nuvio addon

Combined findings of Astra and Opus audits:

Commit audited by both: `b6506b0` — `feat: implement sprint 03 KV storage and Nuvio addon`.
Sources: [`sprint-03-audit-opus.md`](./sprint-03-audit-opus.md), [`sprint-03-audit-astra.md`](./sprint-03-audit-astra.md).

**Verdicts at a glance**
- **Astra:** **PASS WITH CONCERNS.** No critical issues, warnings or suggestions. The implementation passes review, but **Sprint 03 is not complete** because the on-device Nuvio checks are still outstanding.
- **Opus:** no critical issues; 1 warning and 5 suggestions, listed below. Opus agrees the sprint doc correctly marks on-device acceptance as pending.

## Issues

All numbered findings come from Opus, because Astra reported none. Astra did raise residual risks that aren't findings; they're kept in full under *Astra's audit notes* below, and #1 links to the one that overlaps.

### 1. A failed index write leaves a list that can't be seen and can't be re-seeded  [Warning] · raised by Opus
- **What it is:** Saving a list takes two separate writes to KV (Cloudflare's key-value store): first the list itself, then the `index`, the table of contents the manifest reads. If the first write succeeds and the second fails, for example because of a network blip during `--remote` seeding, the list is stored but missing from the index.
- **Why it matters:** Nuvio never sees that list, because the manifest only reads the index. You also can't simply re-run the seed. The seed script refuses ("already exists") and `putList` would reject version 0. The only recovery is deleting the KV key by hand. The sprint doc's "Storage limitation" section covers two writers racing each other, but not this half-finished save.
- **Where:** `src/storage/lists.ts:63-64`; the retry block is at `scripts/seed-list.ts:93-94`.
- **Related:** Astra residual risk #3 (KV writes not atomic, "can leave index/list state temporarily inconsistent"). Astra treats this as an accepted property of the planned KV design, not a defect. Opus flags the specific way it fails and can't recover, at Warning level. Kept separate for the owner to judge.
- **Suggested fix:** Write the index first and the list second. An index entry with no list behind it already fails safely (the catalog returns an empty `{ metas: [] }`), and a retry overwrites it. Alternatively, have `putList` or the seed repair a missing index entry when the list already exists. Either way, add this partial-failure case to the sprint doc's "Storage limitation" note. Recommendation: swap the write order. It's a two-line change.

### 2. Remote "key not found" detection depends on Wrangler's exact error text  [Suggestion] · raised by Opus
- **What it is:** When the seed script runs with `--remote`, it treats a missing KV key as "not found" only if Wrangler's error output matches a specific wording (`… - 404: Not Found`) or prints `Value not found`.
- **Why it matters:** If a future Wrangler version rewords that message, every remote seed of a *new* list fails at the "does it already exist?" check. Nothing gets written, so it fails safely, but the error is confusing.
- **Where:** `scripts/seed-list.ts:47-54`
- **Suggested fix:** Loosen the match (e.g. any `404` or `not found`, case-insensitive), or note the expected Wrangler version in a comment. A small test with a fake Wrangler call would catch a regression.

### 3. The remote seed store ignores the "read as JSON or text" argument  [Suggestion] · raised by Opus
- **What it is:** The remote KV stand-in in the seed script always parses values as JSON, whatever the caller asks for. A blanket type cast (`as unknown as ListStore`) hides the mismatch from TypeScript. The local stand-in returns raw text unless JSON is requested, so the two return different shapes for the same call.
- **Why it matters:** It works today only because `putList` always asks for JSON, and the one text-mode call (`scripts/seed-list.ts:93`) only checks for null. Any future caller expecting text would break, but only on the remote path.
- **Where:** `scripts/seed-list.ts:33`, `:55`, `:74`
- **Suggested fix:** Let `get(key, type?)` return raw text unless `type === 'json'`, matching real KV and the local stand-in. Then drop the double cast.

### 4. The two addon route handlers have no automated tests  [Suggestion] · raised by Opus
- **What it is:** The unit tests cover the building blocks (manifest builder, catalog builder, path parser, secret check, headers) but not the two route files that wire them together.
- **Why it matters:** The decisions that matter most for security and graceful failure are only checked against the live Worker. Those are: the secret is checked *before* the path is parsed (so a wrong secret reveals nothing), a malformed path returns 404, and an unknown type or list returns an empty list (plan §5). A future refactor could reorder them without any test failing.
- **Where:** `src/pages/addon/[secret]/manifest.json.ts`, `src/pages/addon/[secret]/catalog/[type]/[...rest].ts`
- **Coverage note:** Astra did check this behavior independently against the deployed Worker (wrong secret → 404 on both routes, negative skip → 404, unknown list/type → empty, headers correct). So it is verified live today; what's missing is a regression test.
- **Suggested fix:** Add a small test that calls each route's `GET` with a fake `env` (reuse the Node dev stand-in for `cloudflare:workers` via `vi.mock`) to lock in the ordering and the 404-versus-empty decisions.

### 5. Type and skip are checked in two places  [Suggestion] · raised by Opus
- **What it is:** The catalog route rejects unknown types, and then `buildCatalog` checks the type again. Likewise `parseCatalogPath` and `buildCatalog` both check that `skip` is a safe integer.
- **Why it matters:** It's harmless now, but the rule "unknown type → empty list" lives in two places that could drift apart.
- **Where:** `src/pages/addon/[secret]/catalog/[type]/[...rest].ts:18-19`; `src/addon/catalog.ts:11-18`, `:40-41`
- **Suggested fix:** Leave validation to `buildCatalog` and remove the route's type check, along with the `params.type!` non-null assertion that comes with it.

### 6. The seed script relies on enrichment keeping titles in their original order  [Suggestion] · raised by Opus
- **What it is:** After TMDB enrichment (adding posters and blurbs), the seed script copies each title's `addedSeq` back from the pre-enrichment array by position. That assumes enrichment returns the titles in the same order and number.
- **Why it matters:** Opus confirmed that `enrichTitles` does keep the order (results are stored by index), so **this is correct today**. But the dependency isn't written down anywhere, and the helper used (`enrichSourceTitles`) overwrites `addedSeq` itself, which is why the copy-back is needed.
- **Where:** `scripts/seed-list.ts:121-130`; order preservation at `src/tmdb/enrich.ts:229`
- **Related:** Astra's task coverage says the seed "preserves sequence numbers across Sources". Both auditors agree the result is correct; only Opus suggests simplifying.
- **Suggested fix:** Call `enrichTitles(merged.newTitles, key)` directly. Those titles already carry the right `addedSeq`, so the copy-back step can go.

## Positive observations

**Opus:**
- **Spec match is tight.** Manifest shape, one Catalog per type present, `skip` extra, pages of 100, `{ id: imdbId, type, name, poster }` metas, unknown list/type → `{ metas: [] }`, and CORS `*` + `max-age=60` on every response, including 404s, all match plan §5.
- **The secret check is done right.** Both values are hashed to equal length before `timingSafeEqual`, empty or missing secrets are rejected, and the check runs before any path parsing or KV read (`src/addon/http.ts:4-14`).
- **Pagination filters by type before slicing and sorts a copy.** Removed Titles are excluded and the list isn't mutated.
- **Path parsing is strict**, with edge cases tested (`-1`, `1.5`, 2^53).
- **The KV concurrency limitation is documented honestly** in code (`src/storage/lists.ts:42-45`) and in the sprint doc.
- **The seed CLI handles secrets carefully.** It uses a 0600 temp file outside the repo that is removed on exit, and puts no secrets in arguments. The install URL is kept out of tracked docs, and Opus confirmed it matches the current `.dev.vars` secret.
- **The sprint doc is honest about status.** On-device acceptance is marked pending rather than ticked.

**Astra:** no defects or improvement recommendations relative to the task spec. Full task-coverage evidence is below.

## Astra's audit notes (kept in full)

### Audit target
- Branch `sprint-03`; commit `b6506b04849b25e6b4f077e00372b9057794366a`, no commit body. Diff basis: `1e4da2c..b6506b0`, a normal single-parent commit; Astra reviewed the full 718-line patch.
- Spec: `docs/sprints/03_Storage_Nuvio_Addon.md` (the complete original brief from the first parent), plus `docs/implementation-plan.md` §§3 and 5, with the product-spec and domain context.
- The working tree was dirty only from the unrelated deletion of `docs/LISTIO_MANUAL_LISTS_HANDOFF.md`, which was excluded from the audit and left untouched.

### Task coverage (Astra)

| Requirement | Status | Evidence |
| --- | --- | --- |
| Get, put and delete a Combined List under `list:{id}` | Satisfied | `src/storage/lists.ts:20`, `:46`, `:68`; repository lifecycle test verifies persistence, update and deletion. |
| Check the submitted version and increment saved versions | Satisfied | `src/storage/lists.ts:50`; `VersionConflictError` carries status 409; stale and invalid initial versions are rejected before writes. Subject to the documented consistency limitation. |
| Maintain the `index` key with id, name, count and present types | Satisfied | `src/storage/lists.ts:27`, `:31`, `:58`; tests verify create, rename/type changes, deletion, preservation of another list and an absent-list deletion. |
| Manifest: one Catalog per present type with stable list ID and `skip` extra | Satisfied | `src/addon/manifest.ts:3`; mixed/empty index tests; the live manifest contains movie and series Catalogs for the seeded list. |
| Catalogs: type filtering, list sort order, pages of 100 and required metadata | Satisfied | `src/addon/catalog.ts:6`; tests verify filtering before pagination, added/newest/oldest order, boundaries, metadata and no mutation. Live series pages contain 100/100/100/7 distinct IDs. |
| Both required addon routes and pagination URL forms | Satisfied | `manifest.json.ts:11`, `[...rest].ts:14`, `src/addon/catalog.ts:35`; live initial and `skip=N` requests pass. |
| Constant-time secret comparison; mismatch returns 404 | Satisfied | `src/addon/http.ts:4`; both handlers check before storage access; empty/absent/mismatched inputs tested; live wrong-secret requests return 404 on both routes. |
| CORS `*` and `Cache-Control: max-age=60` | Satisfied | `src/addon/http.ts:17`; unit tests and live requests confirm both headers on success and handled 404s. See the User-Agent observation below. |
| Unknown list/type returns `{ metas: [] }` | Satisfied | `src/addon/catalog.ts:11`, catalog route `:18`; unit and live checks pass. |
| Seed a real Source through Sprint 02 normalization, merge and TMDB enrichment into KV | Satisfied | `scripts/seed-list.ts:92-146` preserves sequence numbers across Sources and prevents overwriting an existing ID. Astra observed the resulting 322 Titles / 321 poster fields live; the seed itself was not re-run because it writes KV. |
| Generate/upload `ADDON_SECRET` and deploy | Satisfied | Reported by the implementer. Astra confirmed the private manifest URL works and a different secret fails. The command history and deployed commit identity were not independently confirmed. |
| Install addon in Nuvio from the deployed URL | **Unable to verify** | No device evidence supplied; the sprint doc says device checks have not been performed. |
| Seeded row shows posters and correct order; scrolling loads beyond 100 Titles | **Partially satisfied** | HTTP pagination works and 321/322 Titles have posters. Nuvio rendering, displayed order and scrolling are unverified. The exact saved-order comparison is implementer-reported. |
| Mixed movie/show list appears as two Catalogs in Nuvio | **Partially satisfied** | Two correct Catalogs in the deployed manifest; visibility in Nuvio unverified. |
| Add a Catalog to a Nuvio collection folder | **Unable to verify** | Requires the outstanding on-device check. |
| Wrong secret returns 404 | Satisfied | Verified independently on both deployed routes, with the required headers. |

### Validation Astra performed
- Inspected the repository state, commit metadata and parent, full patch, original and changed sprint brief, referenced plan/spec, and relevant unchanged integration code.
- `vitest run --no-cache` passed: 5 files, 41 tests.
- `tsc --noEmit` passed.
- ESLint on `src/addon`, `src/storage`, `src/pages/addon/**/*.ts`, `src/env.d.ts` passed.
- Read-only live HTTP probes (`User-Agent: ListioAudit/1.0`, with the secret read privately and never printed) passed:
  - manifest 200 with two types
  - movie page: 15 Titles, 14 posters
  - series pages: 100/100/100/7, 307 posters, no duplicate IDs
  - unknown list/type → empty; negative skip → 404; wrong secret → 404 on both routes
  - CORS and cache headers correct throughout
- **The first HTTP probe, with Python's default User-Agent, got HTTP 403** (17-byte `text/plain` body). Retrying with `Mozilla/5.0` or `ListioAudit/1.0` returned JSON 200 with the correct headers. This shows Cloudflare treats clients differently at the hostname, outside the route code. The cause is not established, and it doesn't prove Nuvio fails.
- Not re-run because they write files or state: `pnpm build` (the implementer reports it passed), the seed CLI, the secret upload and the deploy. Nuvio device checks were not performed.
- Live checks show what is currently deployed, not proof that it is exactly the audited commit.

### Residual risks (Astra)
1. You must still confirm every on-device criterion: install, rows/posters/order, scrolling beyond 100, both Catalogs for the mixed list, and adding to a collection folder. The sprint stays pending until they pass.
2. **The deployed hostname rejected Python's default User-Agent.** Astra's successful requests with an explicit User-Agent don't prove Nuvio can reach it, so Nuvio's actual client remains part of device acceptance.
3. KV version checks and list/index writes are not atomic. Concurrent writes and eventual consistency can defeat the version check or leave index and list temporarily out of step. This follows the specified KV design. (Related: Opus #1.)
4. The exact Source-to-KV ordering comparison and the original seed/deploy runs rely on implementer-reported evidence. Independent checks cover structure, pagination, counts and poster presence, not actual image rendering or every saved value.

### Final verdict (Astra)
**PASS WITH CONCERNS.** No implementation fixes required. **Sprint 03 is not complete** until the Nuvio device checks pass.

---
**Tally:** 6 issues total (6 from Opus, 0 from Astra). 1 warning, 5 suggestions.
**Overlaps to judge:** Opus #1 ↔ Astra residual risk #3 (both about non-atomic list/index writes; Astra accepts it as planned design, while Opus flags the unrecoverable half-save case as a Warning). Opus #4 ↔ Astra's live route checks (same behavior: Astra verified it live, Opus asks for a regression test).
**Conflicts to resolve:** Astra reports zero warnings or suggestions, while Opus reports 1 warning and 5 suggestions. The two don't disagree on any fact; they differ on what counts as a finding. Opus #1 is the one where the auditors reach different conclusions on substance.
**Coverage gaps:** Astra ran the tests, type-check, lint and live HTTP probes against the deployed Worker, and found the User-Agent 403. Opus only read the source and checked that the install URL's secret matches `.dev.vars`. Opus did not notice the User-Agent behavior.
