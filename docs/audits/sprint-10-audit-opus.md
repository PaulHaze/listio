## Audit: last commit e98527e — Prepare Sprint 10 self-hosted BYOK release

_Scope: Sprint 10 — Open-source release (BYOK) (from docs/sprints/10_Open_Source_Release.md)_

**Effort:** medium. **Files examined:** `src/addon/manifest.ts`, `src/env.d.ts`, `src/layouts/Layout.astro`, `src/pages/addon/[secret]/manifest.json.ts`, `src/styles/main.css`, `astro.config.mjs`, `.dev.vars.example`, `wrangler.jsonc` / `wrangler.jsonc.example`, `README.md`, plus `src/pages/robots.txt.ts` (not in the commit, but the commit breaks it). Skipped: tests, LICENSE, sprint docs, `package.json` (apart from a quick check), the SVG.

**Scope match:** every Sprint 10 task is delivered: identifiers removed, example configs, README guide, MIT licence and TMDB credits. No scope creep. The fresh-account walkthrough ("Done when") is still pending, as the sprint doc says.

### Critical

1. **`/robots.txt` now throws on every request.** `src/pages/robots.txt.ts:4` builds `new URL('sitemap-index.xml', site)`. This commit removed `site` from `astro.config.mjs`, so `site` is `undefined` and `new URL()` throws `TypeError: Invalid URL`, which returns a 500. It also advertises a sitemap that no longer exists, because the `@astrojs/sitemap` integration was removed too.
   **Fix:** Listio is a private single-user app, so serve `User-agent: *\nDisallow: /\n` with no `Sitemap:` line. Or delete the route.

### Warning

2. **`pnpm deploy` runs pnpm's built-in command, not the `deploy` script.** `README.md:201` (update steps) and `README.md:264` (commands table) tell users to run `pnpm deploy`. pnpm reserves `deploy` as a built-in ("Deploy a package from a workspace"), and built-ins win over `package.json` scripts. Users get a pnpm error or unexpected behaviour, not a build and Wrangler deploy. That breaks the "README only" goal for updates.
   **Fix:** change both to `pnpm run deploy`. Or rename the script, e.g. `"release": "astro build && wrangler deploy"`.

3. **`wrangler.jsonc` is still tracked, yet each deployer must edit it.** The README (`README.md:86`, `:100`, `:200`) has users copy the example over `wrangler.jsonc` and put their own KV ID and Worker name in it. Since the file is tracked (`git check-ignore` returns nothing), every self-hoster ends up with a permanently dirty file. "Pull the latest code" will conflict as soon as upstream changes `compatibility_date` or flags. The two files are also near-duplicates that can drift. This hits your own deployment right away: the tracked file now holds the all-zero KV ID and `org.listio.addon`, so deploying from this branch fails until you restore your KV ID locally. Unless you also set `ADDON_ID` back to `com.paulhaze.listio`, your installed Nuvio addon changes identity.
   **Fix:** add `wrangler.jsonc` to `.gitignore` and `git rm --cached` it, keeping only `wrangler.jsonc.example` tracked. Add `cp wrangler.jsonc.example wrangler.jsonc` before `pnpm build` in `.github/workflows/ci.yml`, since the Cloudflare adapter reads it at build time. Locally, set your real KV ID and `"ADDON_ID": "com.paulhaze.listio"`.

4. **An empty `ADDON_ID` produces a manifest with `id: ""`.** `src/pages/addon/[secret]/manifest.json.ts:13` passes `env.ADDON_ID` straight to `buildManifest(index, addonId = 'org.listio.addon')` (`src/addon/manifest.ts:3-5`). A default parameter only applies for `undefined`. A user who blanks it (`ADDON_ID=` in `.dev.vars`, or `"ADDON_ID": ""` in vars), or follows the "deliberately empty" comment in `.dev.vars.example`, gets an empty addon ID. Nuvio is likely to reject it.
   **Fix:** `buildManifest(await getIndex(env.LISTIO), env.ADDON_ID?.trim() || undefined)`.

### Suggestion

5. **`@astrojs/sitemap` is now unused.** It is still listed at `package.json:31` after being removed from `astro.config.mjs`. Remove it with `pnpm remove @astrojs/sitemap`.

6. **`.dev.vars.example` header contradicts its contents.** Line 2 says "Values here are deliberately empty", but `ADDON_ID=org.listio.addon` is prefilled. Reword it to "Secrets here are deliberately empty", or leave `ADDON_ID` commented out (`# ADDON_ID=org.listio.addon`), which also avoids finding 4.

7. **The TMDB logo `<img>` has no `height`.** `src/layouts/Layout.astro:82` sets only `width="80"`, so the browser can't reserve space and the footer shifts when the SVG loads. Add a `height` matching the SVG's aspect ratio.

8. **Old identifiers are still in git history.** The previous KV ID (`08f9a2e7…`), `com.paulhaze.listio` and `listio.listio.workers.dev` stay in history once the repo is public. A KV namespace ID is not a credential (using it requires your Cloudflare auth), so this is acceptable. Rewrite history before publishing only if you want a clean public record.

### Positive observations

- Replacing `Astro.site` with `Astro.url.origin` in `Layout.astro:20-21` is correct here. `output: 'server'` means every Layout page (`index`, `lists/[id]`, `404`) renders per request, so canonical and OG URLs use the real host and never a build-time localhost.
- `ADDON_ID` is optional, typed in `src/env.d.ts`, defaulted in one place, and covered by a test (`test/addon-storage.test.ts:126`).
- Secrets are set only through interactive `wrangler secret put`. The README keeps secrets (Worker secrets) clearly separate from public config (`vars`, the KV binding) in its table at `README.md:145-154`.
- The README covers everything the sprint asked for: provider key signup, KV, secrets, Basic Auth (ADR 0006) and Nuvio install. It also adds a useful troubleshooting table and an upgrade note for pre-Sprint-10 installs (`README.md:206-208`).
- The TMDB credits footer uses the locally served approved logo plus the required notice, as TMDB's terms require.
