# Commit audit

## Audit target

- Repository: `/Users/paulhayes/code/AI/nuvio_projects/listio`
- Branch: `sprint-03`
- Task: `Sprint 03 — Storage & Nuvio addon`
- Specification: `docs/sprints/03_Storage_Nuvio_Addon.md`, complete original first-parent brief; referenced `docs/implementation-plan.md` §§3 and 5, with its product-spec and domain context.
- Commit: `b6506b04849b25e6b4f077e00372b9057794366a` — `feat: implement sprint 03 KV storage and Nuvio addon` (no commit body).
- Diff basis: `1e4da2c1df89d26d222c23f589a2595bff361ebd..b6506b04849b25e6b4f077e00372b9057794366a`; normal single-parent commit.
- Working tree: dirty only from the unrelated deletion of `docs/LISTIO_MANUAL_LISTS_HANDOFF.md` when validation began. That deletion was excluded from the audit and left untouched. Examined implementation, dependencies, configuration and tests matched the target commit.
- Auditor: independent Astra audit using `$audit-commit` and root `AGENTS.md`.
- Verdict: **PASS WITH CONCERNS** — implementation review passes; mandatory on-device acceptance remains unverified and the sprint is not complete.

## Executive summary

The commit implements KV list storage and its index, observed-stale-version rejection, manifest/catalog builders, authenticated addon routes, and a Source-based seed CLI. The entire 718-line supplied parent-to-commit patch was reviewed, together with the original sprint brief and relevant unchanged domain, Source, enrichment, development-binding and build configuration code. The original acceptance criteria remain intact; the changed sprint document explicitly identifies the outstanding device checks.

No concrete implementation defect was established. Independently rerun validation passed all 41 tests, TypeScript checking and changed-source ESLint. Independent read-only deployment checks confirmed two Catalogs, 15 movie Titles and 307 series Titles, series pagination of 100/100/100/7, expected empty responses, wrong-secret rejection and required headers.

These results do not prove that Nuvio installs the addon, renders the rows and posters in the intended order, loads later pages while scrolling, or adds a Catalog to a collection folder. Paul has not supplied device acceptance evidence. This important residual uncertainty prevents an unconditional PASS or a declaration that Sprint 03 is complete.

## Findings summary

| Category | Count |
| --- | ---: |
| Critical | 0 |
| Warnings | 0 |
| Suggestions | 0 |

## Critical findings

None.

## Warnings

None.

## Suggestions

None.

> No material defects or improvement recommendations were identified relative to the task specification. The residual acceptance concerns below are unverified behavior, not established code defects.

## Task coverage

| Requirement | Status | Evidence |
| --- | --- | --- |
| Get, put and delete a Combined List under `list:{id}` | Satisfied | `src/storage/lists.ts:20`, `:46`, `:68`; repository lifecycle test verifies persistence, update and deletion. |
| Check the submitted version and increment saved versions | Satisfied | `src/storage/lists.ts:50`; `VersionConflictError` carries status 409, stale and invalid initial versions are rejected before writes. This is the planned KV check, subject to the documented consistency limitation. |
| Maintain the `index` key with id, name, count and present types | Satisfied | `src/storage/lists.ts:27`, `:31`, `:58`; tests verify create, rename/type changes, deletion, preservation of another list and an absent-list deletion. |
| Manifest: one Catalog per present type with stable list ID and `skip` extra | Satisfied | `src/addon/manifest.ts:3`; mixed/empty index tests; live manifest contains movie and series Catalogs for the seeded list. |
| Catalogs: type filtering, list sort order, pages of 100 and required metadata | Satisfied | `src/addon/catalog.ts:6`; tests verify filtering before pagination, added/newest/oldest order, boundaries, metadata and no mutation. Unchanged `src/domain/sort.ts` supplies all sort modes. Live series pages contain 100/100/100/7 distinct IDs. |
| Both required addon routes and pagination URL forms | Satisfied | `src/pages/addon/[secret]/manifest.json.ts:11`, `src/pages/addon/[secret]/catalog/[type]/[...rest].ts:14`, `src/addon/catalog.ts:35`; live initial and `skip=N` requests pass. |
| Constant-time secret comparison; mismatch returns 404 | Satisfied | `src/addon/http.ts:4` hashes both inputs to equal-length buffers before `timingSafeEqual`; both route handlers check before storage access. Empty/absent/mismatched inputs tested; live wrong-secret requests return 404 on both routes. |
| CORS `*` and `Cache-Control: max-age=60` | Satisfied | `src/addon/http.ts:17`; unit tests and independent live requests confirm both headers on addon success and handled 404 responses. See the upstream User-Agent observation below. |
| Unknown list/type returns `{ metas: [] }` | Satisfied | `src/addon/catalog.ts:11`, catalog route `:18`; unit tests and independent live unknown-list/unknown-type requests pass. |
| Seed a real Source through Sprint 02 normalization, merge and TMDB enrichment into KV | Satisfied | `scripts/seed-list.ts:92` through `:146` builds and saves the list through existing modules, preserves sequence numbers across Sources and prevents observed existing-ID overwrites. Implementer reports the real Trakt/MDBList seed run; audit independently observes the resulting 322 Titles and 321 poster fields. Seed execution was not repeated because it writes KV. |
| Generate/upload `ADDON_SECRET` and deploy | Satisfied | Implementer reports 256-bit generation, `wrangler secret put` and deployment. Audit independently verifies the private manifest URL works and a different secret fails. The actual generation/upload command history and deployed commit identity were not independently attested. |
| Install addon in Nuvio from the deployed URL | Unable to verify | Original sprint `:22`; current sprint `:51`–`:55` explicitly says device checks have not been performed. No device evidence supplied. |
| Seeded row displays posters and correct order; scrolling loads beyond 100 Titles | Partially satisfied | Builders and live HTTP pagination work; 321 of 322 live Titles have poster fields. Nuvio rendering, displayed order and scrolling have not been verified. Exact comparison against the saved KV metadata/order is implementer-reported evidence, not independently repeated in this audit. |
| Mixed movie/show list appears as two Catalogs in Nuvio | Partially satisfied | Two correct Catalog entries observed in the deployed manifest; visibility in Nuvio remains unverified. |
| Add a Catalog to a Nuvio collection folder | Unable to verify | Original sprint `:25`; requires the outstanding on-device check. |
| Wrong secret returns 404 | Satisfied | Independently verified against both deployed addon routes, with required response headers. |

## Validation performed

- Repository state, commit metadata and parent, complete supplied patch, original and changed sprint brief, referenced plan/specification, and relevant unchanged integration code — inspected.
- `rtk proxy pnpm exec vitest run --no-cache --configLoader runner` — passed: 5 test files, 41 tests. Cache disabled and the runner config loader used to avoid writing a bundled config.
- `rtk proxy pnpm exec tsc --noEmit --incremental false` — passed, using the existing generated Astro declarations; no emitted files.
- `rtk proxy pnpm exec eslint src/addon src/storage 'src/pages/addon/**/*.ts' src/env.d.ts` — passed, without fix or cache flags.
- Read-only Python HTTP probes, run through `rtk proxy` with `User-Agent: ListioAudit/1.0` and the URL read privately from the ignored install file — passed: manifest 200 and two types; movie page 15 Titles/14 poster fields; series pages 100/100/100/7 and 307 poster fields; no duplicate IDs within either Catalog; unknown list/type empty; negative skip 404; wrong-secret requests 404 on both routes; CORS/cache headers correct throughout. The secret and install URL were never printed or copied into this report.
- Initial HTTP probe with Python's default User-Agent — failed before JSON validation: deployment returned HTTP 403 with a 17-byte `text/plain` body. Follow-up requests to the same URL with `Mozilla/5.0` and `ListioAudit/1.0` returned JSON 200 and the required headers. This demonstrates client-dependent behavior outside the inspected route response, without establishing its cause or a Nuvio failure.
- `pnpm build` / Astro's writing checks — not rerun because they generate files and this audit permits only the report write. The implementer reports a successful Astro check and production build; that result is reported evidence, distinct from the auditor's independent no-emit TypeScript check.
- Seed CLI, secret upload and deployment — not rerun because they modify local/remote state. Source integration was inspected and the current deployed read behavior was independently checked.
- Nuvio device checks — not performed; no device access or Paul-supplied acceptance evidence.

The unrelated working-tree documentation deletion does not affect the checked source/tests. Live HTTP validation establishes current deployment behavior, not cryptographic identity with the audited commit.

## Residual risks

- Paul must still establish all original device acceptance criteria: installation, rows/posters/order, scrolling beyond 100, both mixed-list Catalogs, and collection-folder addition. The sprint must remain pending until these pass.
- The deployed hostname rejected Python's default User-Agent. The audit's successful explicit-User-Agent requests do not establish Nuvio's accessibility; its actual client remains part of device acceptance.
- As documented in `src/storage/lists.ts:42` and the sprint, KV version checking and list/index writes are not atomic. Concurrent writes and eventual consistency can defeat the observed-version check or leave index/list state temporarily inconsistent. This follows the specified KV design and is not a newly invented stronger concurrency requirement.
- Exact real-Source-to-saved-KV ordering comparison and the original seed/deploy operations rely on implementer-reported evidence. Independent checks confirm response structure, pagination, counts and poster presence, not actual image rendering or every saved value.

## Final verdict

**PASS WITH CONCERNS.** No concrete implementation fixes are identified, and independent code/test/HTTP validation supports the implemented requirements. **Sprint 03 is not complete:** the original Nuvio device acceptance criteria remain outstanding. No implementation follow-up is required by this report; device verification is still required before claiming the end-to-end goal is achieved.
