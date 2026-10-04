# Commit audit

## Audit target

- Auditor: Astra; independent fresh-context review using `$audit-commit`.
- Repository: `/Users/paulhayes/code/AI/nuvio_projects/listio`
- Branch: `sprint-10`
- Task: `Sprint 10 — Open-source release (BYOK)`
- Task directory: `docs/sprints/`
- Specification: the complete `docs/sprints/10_Open_Source_Release.md` at parent `c81a835c97f3f64514ab6fac685afc97851bc0a9`, with the explicitly referenced ADR 0003 and ADR 0006.
- Commit: `e98527eef7acad92d5ac60f357de407651102044` — `Prepare Sprint 10 self-hosted BYOK release` (no body).
- Diff basis: `c81a835c97f3f64514ab6fac685afc97851bc0a9..e98527eef7acad92d5ac60f357de407651102044`; normal single-parent commit.
- Working tree: clean before review and validation; HEAD matched the target. An unrelated untracked `docs/movie_lists/absurd_movies.md` appeared before final handoff and was left untouched; it does not change the tracked target content validated above. The report is the only audit write.
- Report: `/Users/paulhayes/code/AI/nuvio_projects/listio/docs/audits/sprint-10-audit-astra.md`
- Verdict: **PASS WITH CONCERNS**

## Executive summary

The commit replaces the deployment-specific KV ID and hostname with configuration/request-derived values, makes the addon identity configurable, supplies example configuration and a detailed BYOK deployment guide, adds an MIT licence, and puts TMDB attribution in the shared UI. The original task requirements and done-when criterion remain intact; the amended sprint correctly records that acceptance is pending.

One concrete integration regression remains: removing Astro's `site` setting leaves the existing public `/robots.txt` handler throwing when it constructs its sitemap URL. This does not block the primary self-hosting or addon workflow, but should be corrected.

All 132 tests and the formatting/lint checks passed. This review did not build, deploy, create provider accounts, or install the addon on a Nuvio device. Consequently, it establishes substantial implementation coverage, not completion of the fresh-account acceptance walkthrough or public release.

## Findings summary

| Category | Count |
| --- | ---: |
| Critical | 0 |
| Warnings | 1 |
| Suggestions | 0 |

## Critical findings

None.

## Warnings

### [Warning 1] Removing the site setting breaks the public robots endpoint

**Location:** `astro.config.mjs:25-26,38`; affected consumer `src/pages/robots.txt.ts:3-7`.

**Task requirement / established behavior:** Removing a deployment-specific hostname must preserve functioning routes that consume that configuration. ADR 0006 and `src/middleware.ts:7,44` explicitly leave `/robots.txt` publicly accessible.

**Evidence:** This commit removes the configured `site` and the sitemap integration, but the unchanged robots handler still executes `new URL('sitemap-index.xml', site)`. Astro's `site` is optional and is now undefined. Directly invoking the committed handler with `{ site: undefined }` reproduced `TypeError: Invalid URL`; invoking the same handler with a valid configured site returned 200. The existing Basic Auth test only verifies that middleware passes `/robots.txt` through; it does not exercise the handler.

**Trigger and impact:** A request to `/robots.txt` on a deployment using the supplied configuration reaches the handler without authentication and throws instead of returning a robots document, producing a server error. Even replacing the missing base alone would leave a reference to a sitemap that this commit no longer generates. The regression affects the public robots endpoint rather than the primary list editor or addon installation flow.

**Recommendation:** Update the robots endpoint together with the site/sitemap removal: return a valid robots document without advertising the removed sitemap, or deliberately restore a configurable sitemap implementation. Add a focused handler check covering the supplied configuration with no `site` value.

## Suggestions

None.

## Task coverage

| Requirement | Status | Evidence |
| --- | --- | --- |
| Remove deployment-specific email, KV ID, hostname and credentials from the application/configuration; obtain user-specific values from configuration/secrets | Satisfied | `wrangler.jsonc:7-14` and its example use a placeholder KV ID and configurable addon ID; `src/layouts/Layout.astro:20-21` uses the request origin; `src/env.d.ts:7-15`, API consumers and middleware obtain secrets from the environment. Committed-tree searches found no remaining old KV ID, deployment hostname or deployment email. The upstream clone URL, copyright and test fixtures are not operational deployment settings. The related robots regression is recorded separately above. |
| Supply example local and Wrangler configuration listing required values | Satisfied | `.dev.vars.example:1-16` lists all six secrets plus optional addon identity; `wrangler.jsonc.example:1-16` supplies the Worker entrypoint, compatibility settings, public addon identity and `LISTIO` binding. README `145-154` distinguishes secrets from configuration/bindings. |
| Explain what Listio does and its single-user BYOK model | Satisfied | `README.md:1-25` explains static curated catalogs, supported sources, saving, self-hosting, and the need for separate playback addons; consistent with ADR 0003. |
| Explain how to obtain Trakt, MDBList and TMDB keys | Satisfied | `README.md:52-81` supplies account/settings links, key types, relevant signup details and provider references. Trakt Client ID, MDBList API key, and TMDB v3/v4 handling match the inspected source clients. Official documentation cross-checks are recorded below. |
| Explain Cloudflare account setup, KV creation, configuration, build and deployment | Satisfied | `README.md:27-50,83-124` covers prerequisites, clone/install, login, namespace creation/replacement, optional account selection, Worker name, build/deploy and the first workers.dev subdomain prompt. Commands match the repository scripts and adapter setup. |
| Explain provider/addon secrets and ADMIN_USER / ADMIN_PASSWORD Basic Auth | Satisfied | `README.md:126-162` supplies random-value generation, all six interactive secret commands and login steps. `src/middleware.ts:43-63` fails closed before both login secrets exist and exempts addon requests; addon handlers separately check `ADDON_SECRET`. |
| Explain creation of a saved list and installation in Nuvio | Satisfied | `README.md:164-196` gives editor/save steps, manifest URL construction, an unauthenticated manifest check, addon installation, movie/series catalogs and refresh guidance. Inspected manifest/catalog routes and the passing addon tests support the protocol behavior. On-device execution remains unverified. |
| Supply an open-source licence | Satisfied | `LICENSE:1-21` contains MIT terms; `package.json:5` declares MIT; `README.md:284-291` distinguishes source licensing from third-party assets/data. |
| Put required TMDB attribution in the UI | Satisfied | `src/layouts/Layout.astro:80-89` supplies a Credits section, linked local logo and required notice on the shared layout; `public/tmdb-logo.svg:1` supplies the asset and `src/styles/main.css:187-200` styles it. The home and editor pages use that layout. Cross-checked the attribution elements against TMDB's official FAQ. |
| Someone with a fresh Cloudflare account can go from clone to a working Nuvio addon using only README | Unable to verify end to end | The README covers the inspected configuration and application flow, but no fresh-account deployment or on-device walkthrough was executed during this audit. `docs/sprints/10_Open_Source_Release.md:48-50` explicitly records this outstanding acceptance work. No confirmed primary-workflow blocker was identified from the reviewed code and documentation. |
| Publish the repository for self-hosters (goal) | Unable to verify | Licence and release documentation are committed, but public repository visibility/publication is outside the committed-tree evidence; `docs/sprints/10_Open_Source_Release.md:50` says publication was not performed. This audit does not claim a public release occurred. |

## Validation performed

- Read the complete unfiltered parent-to-target diff, splitting it into file groups after the combined tool response truncated. Reviewed all 19 changed files and relevant unchanged middleware, source/TMDB clients, storage/addon callers, shared pages, development environment loader, scripts, tests, CI and package configuration.
- Confirmed the unique Sprint 10 specification, existing/readable task paths, writable declared report directory, matching HEAD, clean working tree, and normal single-parent commit.
- `rtk proxy git diff --check c81a835c97f3f64514ab6fac685afc97851bc0a9 e98527eef7acad92d5ac60f357de407651102044 --` — passed.
- `rtk proxy pnpm exec vitest run --no-cache --configLoader native` — passed: 12 test files, 132 tests. Cache was disabled and the native configuration loader used to avoid generated repository files. Tests ran against the clean target checkout and the already-installed dependencies.
- `rtk proxy pnpm lint:check` — passed: Prettier check and ESLint, without fix flags.
- Direct Node invocation of the committed `src/pages/robots.txt.ts` handler with `{ site: undefined }` — failed with `TypeError: Invalid URL`, confirming Warning 1. The same invocation with `{ site: new URL('https://example.invalid') }` returned HTTP 200 and a robots document. This is a handler reproduction, not a live HTTP deployment test.
- Committed-tree searches for the old deployment hostname/KV ID, personal email/domain, credential consumers and hard-coded endpoints — completed; no remaining operational dependency on Paul's deployment identified in the target tree. This was not a forensic scan of all Git history.
- Cross-checked README instructions against official [Trakt app creation](https://developer.trakt.tv/docs/create-an-app), [MDBList API/key and free-tier documentation](https://docs.mdblist.com/docs/api), [TMDB key/attribution FAQ](https://developer.themoviedb.org/docs/faq), [Cloudflare KV setup](https://developers.cloudflare.com/kv/get-started/) and [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/). These support the documented setup; they do not prove successful signup or deployment for a new account.
- `pnpm build`, `pnpm check`, and Wrangler dry-run — not run: these can generate build output, Astro types, deployment configuration or runtime files, which the audit's report-only write restriction prohibits. The implementation's recorded successful build/clean-copy/dry-run results at `docs/sprints/10_Open_Source_Release.md:38-44` are author evidence, not independently rerun audit results.
- Dependency installation, Cloudflare resource creation/deployment, provider signup/API-key issuance, browser UI preview and on-device Nuvio installation — not run; these exceed the read-only audit scope or require external-account/device actions.

## Residual risks

- Fresh-account registration, provider key issuance, deployed Worker behavior, KV persistence/propagation and actual Nuvio installation have not been exercised together using the README. Retain the sprint's acceptance-pending status until that walkthrough is recorded.
- The production build and visual rendering of the Credits footer were inspected through source and implementation evidence, not regenerated or browser-tested in this audit.
- External provider policies and Nuvio menu labels can change; the README supplies official references but live account/device behavior remains outside this review.
- Public release/visibility has not been verified or performed.

## Final verdict

**PASS WITH CONCERNS.** The inspected release implementation substantially satisfies the original requirements, with one confirmed non-blocking regression in `/robots.txt` and no critical findings. Correct the robots handler and retain **implemented; acceptance pending** until the fresh-account README-to-Nuvio walkthrough and intended publication are completed. Passing automated checks alone does not establish that final acceptance outcome.
