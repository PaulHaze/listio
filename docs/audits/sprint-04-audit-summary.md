# Audit Summary: sprint-04 — GUI: Home & Combined List management

Combined findings of Astra and Opus audits:

**What each audit covered:** Astra audited only the feature commit `52d0ce5` and gave the verdict **PASS WITH CONCERNS**. Opus audited the whole branch range `fbe4757..4a62601`, which is the feature commit plus the tooling commit `4a62601`. Opus's findings #1, #4, #5 and #8 cover `4a62601`, which Astra never looked at.

## Issues

### 1. CI and every fresh install fail because of a placeholder line in pnpm settings [Critical] · raised by Opus

- **What it is:** `pnpm-workspace.yaml` contains `simple-git-hooks: set this to true or false`. pnpm wrote this placeholder for someone to fill in, and nobody did. Until it's filled in, pnpm treats the package as unapproved and refuses to finish installing (`ERR_PNPM_IGNORED_BUILDS: Ignored build scripts: simple-git-hooks@2.14.0`).
- **Why it matters:** the CI job fails at its first step (`pnpm install --frozen-lockfile`), so the new `pnpm test` step never runs. Dependabot auto-merge waits on that job (`needs: ci`), so it's blocked too, and so is any fresh clone. Opus reproduced this on a clean clone with pnpm 12.6.0: the install exits 1 with the placeholder and exits 0 with `false`. After the fix, tests (7 files, 50 tests) and `lint:check` passed, and the git hook was still installed.
- **Where:** `pnpm-workspace.yaml:7`. Related: `package.json:9` (the `prepare` script).
- **Suggested fix:** change the line to `simple-git-hooks: false`. The root `prepare: "simple-git-hooks"` script already installs the hook, so the package's own install script isn't needed. Opus confirmed this works.

### 2. DELETE can't clean up a list that's in the index but has no saved data [Warning] · raised by Astra

- **What it is:** the storage keeps two records: an `index` (the list of lists shown on the home page) and a separate `list:{id}` record holding each list's contents. The DELETE endpoint returns 404 whenever the `list:{id}` record is missing, before it ever calls `deleteList`. The storage helper itself is written to handle that case and would clean up both records.
- **Why it matters:** Astra found two concrete ways a failed write leaves an index row with no list record:
  1. Create: the `index` write succeeds and the `list:{id}` write fails. The API returns 500. Retrying the POST skips the indexed id and creates a suffixed list, so the original row stays behind, and DELETE of that row returns 404 forever.
  2. Delete: `list:{id}` is removed and then the index write fails. The API returns 500. Retrying the DELETE returns 404 before it can finish the index cleanup.

  The orphaned row stays on the home page, but opening, renaming and deleting it all fail. After a partial delete of a populated list, the addon manifest also keeps advertising stale catalogs for it. Nothing in the UI can repair this, so the fix needs direct storage access. Astra reproduced both paths with an in-memory test setup that ran the real route and storage modules and simulated KV write failures. This is a recovery problem after a storage failure; normal deletes work. Astra notes that the non-atomic storage design isn't itself the finding. The problem is that the new route guard blocks the cleanup the storage already supports.
- **Where:** `src/pages/api/lists/[id].ts:26-28`. Related paths: `src/pages/api/lists/index.ts:11-12`, `src/storage/lists.ts:66-67`, `src/storage/lists.ts:71-74`, `src/pages/index.astro:7`.
- **Related:** #3 (Opus agrees with this finding). #4 (a second, easy way to reach the same broken state). Kept separate so you can judge them.
- **Suggested fix (Astra):** let DELETE clean up an id that's in the index even when its list record is missing, or make delete always clean both places so that retrying it is safe. If you want to keep a 404 for ids that are completely unknown, return it only when the id is in neither the index nor the list records. Add route-level tests that simulate an interrupted create and an interrupted delete, and check that a later DELETE removes the orphaned index row and its manifest catalogs.

### 3. Opus agrees with Astra's DELETE finding [Warning] · raised by Opus

- **What it is:** Opus checked the same code independently and agrees: `deleteList` handles a missing list record, but the route's `getList` check returns 404 first.
- **Why it matters:** this is the same impact as #2. Opus also points out that #4 gives a second, easy way to reach that state.
- **Where:** `src/pages/api/lists/[id].ts:26-28`
- **Related:** #2 — probably the same underlying problem, kept separate for the owner to judge.
- **Suggested fix (Opus):** if the id is in the index or has a list record, run `deleteList`. This is the same approach as Astra's recommendation.

### 4. A very long list name can break storage and leave an orphan row [Warning] · raised by Opus

- **What it is:** nothing limits the length of a list name. The id is built from the name, so a name of about 510 or more letters and numbers produces a storage key (`list:{id}`) longer than Workers KV's 512-byte key limit. Cloudflare's KV database then rejects the write.
- **Why it matters:** `putList` writes `index` first, then the oversized `list:` write fails. The API returns 500, but the index row is already saved. That's the same broken row as #2, but a single long-name request causes it on purpose, with no infrastructure fault needed. Local dev and the tests use an in-memory stand-in that has no key limit, so neither catches it. Opus based the 512-byte limit on Cloudflare's documentation and couldn't confirm it from the local packages.
- **Where:** `src/api/http.ts:13-23`, `src/pages/api/lists/index.ts:12-18`, `src/storage/lists.ts:66-67`
- **Related:** #2 and #3 — a different cause that ends in the same orphan state.
- **Suggested fix (Opus):** limit names in `readName`, for example by rejecting names longer than 100 characters with a 400 error. Add `maxlength="100"` to both name inputs (`src/pages/index.astro:32,67`). Optionally, also limit the slug length in `slugify`. Add a test that sends an over-long name and checks for a 400 and that nothing was written.

### 5. Prettier and ESLint can overwrite each other's fixes at commit time [Warning] · raised by Opus

- **What it is:** the pre-commit setup (lint-staged) has two file patterns, and both match source files in `src/`. lint-staged runs the patterns at the same time, so `prettier --write` and `eslint --fix` can rewrite the same file simultaneously. lint-staged's own README warns about this as a "race condition".
- **Why it matters:** one tool's changes can overwrite the other's, so a commit may end up with only some of the fixes applied.
- **Where:** `package.json:69-72`
- **Suggested fix (Opus):** use `"pre-commit": "pnpm exec lint-staged --concurrent false"`, which is the simplest change. The alternative is patterns that don't overlap, with `src` files running `["eslint --fix", "prettier --write"]` in order.

### 6. A local browser log file was committed [Warning] · raised by Opus

- **What it is:** `.playwright-mcp/console-2026-10-03T00-41-03-050Z.log` is a console log captured by the Playwright browser tool during a local dev session, and it got committed. `.gitignore` doesn't exclude that folder.
- **Why it matters:** it's clutter in the repo, and new logs will keep showing up as untracked files and can get committed again.
- **Where:** `.playwright-mcp/console-2026-10-03T00-41-03-050Z.log`, `.gitignore`
- **Suggested fix (Opus):** run `git rm -r --cached .playwright-mcp` and add `.playwright-mcp/` to `.gitignore`.

### 7. Server error pages show a confusing technical message [Suggestion] · raised by Opus

- **What it is:** if the server returns something other than JSON, such as a Cloudflare HTML error page, the page's code fails to parse it. The user then sees a parser error like `Unexpected token '<'…`.
- **Why it matters:** it's a confusing message, but nothing breaks.
- **Where:** `src/pages/index.astro:155-160`, `src/pages/lists/[id].astro:62`
- **Suggested fix (Opus):** if parsing fails, fall back to `null`, and show the friendly "Unable to save this change. Please try again." message instead.

### 8. The "refresh the addon" notice comes back on reload [Suggestion] · raised by Opus

- **What it is:** the notice is driven by `?changed=1` (or `?created=1` on the editor page) in the URL. It reappears whenever the page is reloaded or opened from a bookmark.
- **Why it matters:** it's harmless but could confuse the user.
- **Where:** `src/pages/index.astro:8,20-24`, `src/pages/lists/[id].astro:10`
- **Suggested fix (Opus):** after showing the notice, remove the parameter from the URL with `history.replaceState`.

### 9. The CI job name doesn't mention tests [Suggestion] · raised by Opus

- **What it is:** the job is still called "Lint, check and build", but it now runs tests too.
- **Why it matters:** the name in the checks list is misleading, which is cosmetic.
- **Where:** `.github/workflows/ci.yml:18`
- **Suggested fix (Opus):** rename it to "Lint, test, check and build". If branch protection ever requires this check by name, update it at the same time.

## Auditor notes

**Astra:**

- Validation:
  - All 50 tests and ESLint on the changed files passed.
  - `git diff --check` passed.
  - The simulated-failure harness reproduced Warning #2.
  - Read-only local HTTP checks passed: the home page returned 200, and a missing list returned 404 with `no-store` from both the API and the editor page.
- Not verified:
  - Browser automation was blocked ("Browser is already in use").
  - `pnpm check` / `pnpm build` weren't rerun, to avoid generating files.
  - No deployed or live Nuvio acceptance check was done, so the deployed acceptance in ADR 0004 is still unverified.
- Residual risks:
  - The local Node KV stand-in doesn't model Workers KV propagation or limits. Opus's #4 is one example of a limit it misses.
  - The browser flows were reviewed in source but not run.
  - Simultaneous KV writes still aren't serialized, as documented.
- Task coverage: every Sprint 04 requirement is satisfied. Delete, and browser management with the manifest reflecting changes, are marked "partially satisfied" because of #2.

**Opus:**

- Validation: Opus ran a CI-style clean-clone install, which reproduced #1. After fixing it, tests (50) and `lint:check` passed and the git hook was installed.
- Every Sprint 04 task is delivered.
- Positive observations:
  - PATCH ignores everything except `name`, and a test covers this.
  - Create avoids ids that are taken in only the index or only the list records.
  - API responses send `no-store`, and conflicts return 409.
  - The pages use accessible busy and disabled states and URL-encode ids.
  - Astro escapes list names when rendering them.
  - The `.prettierignore` change is narrow.

---

**Tally:** 9 issues in total: 1 from Astra and 8 from Opus. That's 1 critical, 5 warnings and 3 suggestions.
**Overlaps to judge:** #2 ↔ #3 are probably the same. #4 is a different cause that leads to #2/#3's broken state.
**Conflicts to resolve:** none. Coverage gap: Astra didn't review the tooling commit `4a62601`, so #1, #5, #6 and #9 each have only one auditor.
