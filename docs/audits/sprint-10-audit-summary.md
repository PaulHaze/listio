# Audit Summary: sprint-10 — Open-source release (BYOK)

Combined findings of Astra and Opus audits:

## Issues

### 1. `/robots.txt` crashes because the site address was removed  [Critical] · raised by Opus

- **What it is:** The robots route builds its sitemap link from Astro's `site` setting. This commit deleted `site` from `astro.config.mjs`, so the route calls `new URL('sitemap-index.xml', undefined)`, which throws `TypeError: Invalid URL`. The sitemap it points to is also gone, because the `@astrojs/sitemap` integration was removed in the same commit.
- **Why it matters:** Every request to `/robots.txt` returns a 500 server error.
- **How much:** A definite crash on every call. Opus rated it Critical. Impact is limited to one minor route; the editor and addon are unaffected.
- **Where:** `src/pages/robots.txt.ts:4`; cause in `astro.config.mjs` (`site` and `sitemap()` removed).
- **Related:** #2: the same defect raised by Astra at a different severity. Kept separate for the owner to judge.
- **Suggested fix:** Listio is a private single-user app, so serve `User-agent: *\nDisallow: /\n` with no `Sitemap:` line. Or delete the route.

### 2. Removing the site setting breaks the public robots endpoint  [Warning] · raised by Astra

- **What it is:** The commit removes the configured `site` and the sitemap integration. The unchanged robots handler still runs `new URL('sitemap-index.xml', site)`. Astro's `site` is optional and is now undefined.
- **Why it matters:** ADR 0006 and `src/middleware.ts:7,44` deliberately leave `/robots.txt` public. With the supplied config, a request reaches the handler without authentication and throws, giving a server error. Supplying a base URL alone would not be enough, because the handler would still advertise a sitemap this commit no longer generates.
- **How much:** Astra rated it a Warning: a confirmed regression that does not block the main self-hosting or addon workflow.
- **Evidence (Astra):** Astra called the committed handler directly with `{ site: undefined }` and reproduced `TypeError: Invalid URL`. With a valid `site` it returned 200. The existing Basic Auth test only checks that middleware passes `/robots.txt` through; it never runs the handler.
- **Where:** `astro.config.mjs:25-26,38`; affected consumer `src/pages/robots.txt.ts:3-7`.
- **Related:** #1: the same defect raised by Opus, rated Critical.
- **Suggested fix (Astra):** Update the robots endpoint together with the site/sitemap removal. Either return a valid robots document without the removed sitemap, or deliberately restore a configurable sitemap. Add a focused handler test for the supplied config with no `site` value.

### 3. README tells users to run `pnpm deploy`, which runs pnpm's built-in command  [Warning] · raised by Opus

- **What it is:** pnpm has its own built-in `deploy` command ("Deploy a package from a workspace"). Built-ins take priority over `package.json` scripts, so `pnpm deploy` never runs the project's `"deploy": "astro build && wrangler deploy"` script. Opus confirmed this by running `pnpm deploy --help`.
- **Why it matters:** A self-hoster following the update steps gets a pnpm error or unexpected behaviour instead of a build and deploy. This undercuts the sprint's "README only" goal for updates. The first-time deploy in step 4 is unaffected because it uses `pnpm build` then `pnpm exec wrangler deploy`.
- **How much:** Warning. It breaks a documented workflow, but the fix is one word.
- **Where:** `README.md:201` (Updates) and `README.md:264` (Commands table).
- **Related:** Astra's coverage table says the README "commands match the repository scripts and adapter setup". See Conflicts below.
- **Suggested fix:** Change both to `pnpm run deploy`. Alternatively, rename the script (e.g. `release`) so the bare form works. Recommend `pnpm run deploy` as the smaller change.

### 4. `wrangler.jsonc` is still tracked in Git, yet every deployer must edit it  [Warning] · raised by Opus

- **What it is:** The README has users copy `wrangler.jsonc.example` over `wrangler.jsonc`, then put their own KV ID and Worker name in it. `wrangler.jsonc` is still tracked; `git check-ignore` reports it as not ignored. The two files are near-duplicates.
- **Why it matters:** Every self-hoster ends up with a permanently modified tracked file. Their documented update step ("pull the latest code") will hit merge conflicts whenever upstream changes `compatibility_date` or flags. The two copies can also drift apart. It affects your own deployment right away. The tracked file now holds the all-zero KV ID and `ADDON_ID: org.listio.addon`, so deploying from this branch fails until you restore your real KV ID locally. Unless you also set `ADDON_ID` back to `com.paulhaze.listio`, your installed Nuvio addon gets a new identity.
- **How much:** Warning. It's an ongoing maintenance and update trap, not a crash.
- **Where:** `wrangler.jsonc`, `wrangler.jsonc.example`, `README.md:86`, `:100`, `:200`; `.gitignore`.
- **Coverage gap:** Astra marked "Remove deployment-specific … KV ID" as satisfied and did not discuss how the tracked config interacts with updates or your own deployment.
- **Suggested fix:** Add `wrangler.jsonc` to `.gitignore` and `git rm --cached wrangler.jsonc`, keeping only the example tracked. Add `cp wrangler.jsonc.example wrangler.jsonc` before `pnpm build` in `.github/workflows/ci.yml`, since the Cloudflare adapter reads it at build time. Locally, set your real KV ID and `"ADDON_ID": "com.paulhaze.listio"`. Trade-off: one extra CI step, in exchange for conflict-free pulls for every self-hoster.

### 5. An empty `ADDON_ID` gives the addon an empty ID  [Warning] · raised by Opus

- **What it is:** The manifest route passes `env.ADDON_ID` straight into `buildManifest(index, addonId = 'org.listio.addon')`. A default parameter value only applies when the argument is `undefined`, not when it is an empty string.
- **Why it matters:** If someone blanks the value (`ADDON_ID=` in `.dev.vars`, or `"ADDON_ID": ""` in Wrangler vars), the manifest is served with `id: ""`. Nuvio is likely to reject that. The `.dev.vars.example` header ("Values here are deliberately empty") makes blanking it plausible.
- **How much:** Warning. It's an edge case with a confusing failure.
- **Where:** `src/pages/addon/[secret]/manifest.json.ts:13`; `src/addon/manifest.ts:3-5`.
- **Related:** #7: the misleading example-file comment that makes this more likely.
- **Suggested fix:** `buildManifest(await getIndex(env.LISTIO), env.ADDON_ID?.trim() || undefined)`.

### 6. `@astrojs/sitemap` dependency is now unused  [Suggestion] · raised by Opus

- **What it is:** The sitemap integration was removed from `astro.config.mjs`, but the package is still installed.
- **Why it matters:** A dead dependency adds install weight and Dependabot noise.
- **Where:** `package.json:31`.
- **Related:** #1 and #2: the same removal.
- **Suggested fix:** `pnpm remove @astrojs/sitemap`.

### 7. `.dev.vars.example` header contradicts its contents  [Suggestion] · raised by Opus

- **What it is:** Line 2 says "Values here are deliberately empty", but `ADDON_ID=org.listio.addon` is prefilled.
- **Why it matters:** It's mildly confusing, and it nudges users toward blanking `ADDON_ID`, which triggers #5.
- **Where:** `.dev.vars.example:2`, `:16`.
- **Related:** #5.
- **Suggested fix:** Reword to "Secrets here are deliberately empty", or comment the line out as `# ADDON_ID=org.listio.addon`.

### 8. TMDB logo image has no height  [Suggestion] · raised by Opus

- **What it is:** The Credits footer `<img>` sets `width="80"` but no `height`.
- **Why it matters:** The browser can't reserve space for the image, so the footer shifts slightly when the SVG loads.
- **Where:** `src/layouts/Layout.astro:82`.
- **Suggested fix:** Add a `height` matching the SVG's aspect ratio.

### 9. Old deployment identifiers remain in Git history  [Suggestion] · raised by Opus

- **What it is:** The previous KV ID (`08f9a2e7…`), `com.paulhaze.listio` and `listio.listio.workers.dev` are gone from the current files but still in commit history, which becomes public on release.
- **Why it matters:** Low risk. A KV namespace ID is not a credential, because using it requires your Cloudflare login. It only matters if you want a clean public history.
- **Where:** Git history before `e98527e`.
- **Coverage note:** Astra explicitly says its identifier search covered the committed tree only, "not a forensic scan of all Git history". The two audits agree on this.
- **Suggested fix:** Optional. Leave it as is, or rewrite history before publishing if you want a clean record.

---

**Tally:** 9 issues total (8 from Opus, 1 from Astra). 1 critical, 4 warnings, 4 suggestions.

**Overlaps to judge:** #1 ↔ #2 (very likely the same `/robots.txt` defect, raised by each auditor).

**Conflicts to resolve:**

- **Severity of the robots bug:** Opus rated it Critical (a deterministic 500 on every request). Astra rated it a Warning (it doesn't block the primary workflow). Both agree on the cause and the fix.
- **README commands:** Astra's coverage table says the README "commands match the repository scripts". Opus found that `pnpm deploy` (`README.md:201`, `:264`) invokes pnpm's built-in, not the script (#3). Astra's statement holds for the step-4 first deploy (`pnpm exec wrangler deploy`), but not for the update and commands-table instructions.

## Auditor notes

**Astra:**

- **Verdict:** PASS WITH CONCERNS. Retain "implemented; acceptance pending" until the fresh-account README-to-Nuvio walkthrough and intended publication are completed.
- **Task coverage:** Every Sprint 10 requirement was marked Satisfied: identifiers removed, example configs, README explanation, provider keys, Cloudflare/KV/deploy, secrets and Basic Auth, saved list and Nuvio install, MIT licence, TMDB attribution in the UI. The "fresh account → working addon via README only" criterion and public publication were marked "Unable to verify".
- **Validation run:**
  - Full parent-to-target diff of all 19 files plus relevant unchanged middleware, clients, storage, pages, tests and CI.
  - `git diff --check` passed.
  - `vitest run` passed: 12 files, 132 tests.
  - `pnpm lint:check` passed.
  - Direct handler invocation reproduced the robots `TypeError`.
  - Committed-tree identifier searches were clean.
  - README cross-checked against the official Trakt, MDBList, TMDB and Cloudflare KV/secrets docs.
- **Not run:** `pnpm build`, `pnpm check` and Wrangler dry-run (they write generated files, which Astra's report-only restriction forbids). Also not run: dependency install, Cloudflare deploy, provider signup, browser preview and on-device Nuvio install.
- **Residual risks:**
  - Fresh-account signup, deployed Worker, KV propagation and actual Nuvio install are untested together.
  - The Credits footer was inspected from source only and not rendered.
  - Provider policies and Nuvio menu labels may change.
  - Public release has not been performed.

**Opus:**

- Medium-effort review of HEAD `e98527e`.
- **Examined:** the changed source files (`manifest.ts`, `env.d.ts`, `Layout.astro`, `manifest.json.ts`, `main.css`), `astro.config.mjs`, `.dev.vars.example`, `wrangler.jsonc` and its example, `README.md`, plus the unchanged `src/pages/robots.txt.ts`.
- **Skipped:** tests, LICENSE, sprint docs and the SVG.
- **Commands run:** `pnpm deploy --help` (to confirm #3) and `git check-ignore wrangler.jsonc` (for #4). Tests, build and lint were not run.
- **Positives:**
  - Switching to `Astro.url.origin` is correct, because `output: 'server'` renders every Layout page per request.
  - `ADDON_ID` is optional, typed and tested.
  - Secrets are set only through `wrangler secret put`.
  - The README covers every sprint requirement and adds troubleshooting and pre-Sprint-10 upgrade notes.
  - The TMDB footer meets the attribution terms.
