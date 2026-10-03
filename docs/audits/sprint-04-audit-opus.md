## Audit: sprint-04 — 52d0ce5 feat: add Combined List home management and API + 4a62601 Format on commit, ignore audit reports in Prettier, run tests in CI

_Scope: Sprint 04 — GUI: Home & Combined List management (from `docs/sprints/04_GUI_Home_Lists.md`)_

**Range:** `fbe4757..4a62601` (everything on `sprint-04` since the Sprint 03 merge).

**Files audited:**

- `52d0ce5`: `src/api/http.ts`, `src/pages/api/lists/index.ts`, `src/pages/api/lists/[id].ts`, `src/pages/index.astro`, `src/pages/lists/[id].astro`, `src/layouts/Layout.astro`, `src/styles/main.css`, `test/list-routes.test.ts`. I also read the unchanged dependencies `src/storage/lists.ts` and `src/domain/slug.ts`.
- `4a62601`: `pnpm-workspace.yaml`, `package.json`, `.github/workflows/ci.yml`, `.prettierignore`, `test/addon-routes.test.ts`, and the committed `.playwright-mcp/…log`.
- Skipped: `pnpm-lock.yaml` and the docs (`docs/sprints/*`, `docs/audits/sprint-04-audit-astra.md`).

**Verification:** I cloned the repo at `4a62601` into a temp directory and ran `CI=true pnpm install --frozen-lockfile` with pnpm 12.6.0, which **exits 1**. I then set `simple-git-hooks: false` and the install exits 0. With that fix, `pnpm test` passes (7 files, 50 tests), `pnpm lint:check` passes, and the `prepare` script still installs `.git/hooks/pre-commit`.

**Scope match:** every task in the sprint doc is delivered: home page, create, rename, delete with confirmation, refresh notice, `GET /api/lists/{id}`, stub editor page, and the `-2` duplicate id. `4a62601` is tooling outside the sprint scope, which is fine as housekeeping.

### Critical

- **`pnpm-workspace.yaml:7`: an unresolved `allowBuilds` placeholder breaks every clean install, including CI.** The line `simple-git-hooks: set this to true or false` is the placeholder pnpm writes when it skips a dependency's build script. pnpm treats it as unreviewed, so `pnpm install --frozen-lockfile` fails with `ERR_PNPM_IGNORED_BUILDS: Ignored build scripts: simple-git-hooks@2.14.0`. The `ci` job therefore fails at the install step, before it reaches the new `pnpm test` step. This also blocks `dependabot-automerge` (`needs: ci`) and any fresh local clone.
  **Fix:** set it to `false`. The root `prepare: "simple-git-hooks"` script (`package.json:9`) already installs the hook. I confirmed that `false` gives a clean install and that the hook is still created.

### Warning

- **`src/api/http.ts:13-23`, `src/pages/api/lists/index.ts:12-18`: names have no length limit, so a long name can exceed the Workers KV 512-byte key limit and leave an index entry that can't be removed.** `readName` accepts a name of any length. `slugify` keeps every ASCII alphanumeric run, so a name of about 510 or more alphanumeric characters produces a `list:{id}` key longer than 512 bytes. `putList` writes `index` first (`src/storage/lists.ts:66`), then the oversized `list:` key `put` throws (`:67`). The API returns 500, but the index entry is already saved. This is the same orphan state as Astra's Warning 1, except one oversized request triggers it on demand without any infrastructure fault. The row then appears on the home page and its open, rename and delete actions all fail. Local dev and the tests use a Map/Node KV stand-in that has no key limit, so neither catches it.
  **Fix:** cap the name length in `readName`, e.g. reject a trimmed name over 100 characters with 400 `Enter a Combined List name of 100 characters or fewer.`, and add `maxlength="100"` to both name inputs in `src/pages/index.astro:32,67`. Alternatively, cap the slug length in `slugify` too, so the id stays bounded whatever the display-name limit. Add a route test for an over-long name that asserts a 400 and that nothing is written.

- **`src/pages/api/lists/[id].ts:26-28`: I agree with Astra's Warning 1, that DELETE can't clean up an orphaned index row.** I reproduced the reasoning independently. `deleteList` tolerates a missing list key, but the route's `getList` guard returns 404 first. The finding above gives a second, easy way to reach that state. Astra's recommendation covers the fix: if the id is in the index or has a list key, run `deleteList`.

- **`package.json:69-72`: the two lint-staged globs overlap, and both tasks rewrite files concurrently.** Any staged `src/**/*.{js,ts,jsx,tsx,astro}` file matches both `*.{…}` → `prettier --write` and `src/**/*.{…}` → `eslint --fix`. lint-staged runs different globs in parallel, and its README calls out this exact pattern as a race condition. One tool's write can overwrite the other's.
  **Fix:** `"pre-commit": "pnpm exec lint-staged --concurrent false"`. Alternatively, use globs that don't overlap, with ordered arrays: `["eslint --fix", "prettier --write"]` for `src` files.

- **`.playwright-mcp/console-2026-10-03T00-41-03-050Z.log`: a local browser-session log was committed.** `.gitignore` doesn't list `.playwright-mcp/`, so new captures will keep showing up as untracked files and can be committed again.
  **Fix:** `git rm -r --cached .playwright-mcp` and add `.playwright-mcp/` to `.gitignore`.

### Suggestion

- **`src/pages/index.astro:155-160`: a non-JSON error response shows a parser error to the user.** If the response isn't JSON, e.g. a Cloudflare HTML 502/524 page, `response.json()` throws a `SyntaxError`. The catch block then shows its message (`Unexpected token '<'…`) in the alert. The same pattern is in `src/pages/lists/[id].astro:62`.
  **Fix:** check `response.ok` first, or wrap the parse in `.catch(() => null)` and fall back to `Unable to save this change. Please try again.`

- **`src/pages/index.astro:8,20-24`: the `?changed=1` notice stays on reload and in bookmarks.** It's harmless but can confuse.
  **Fix:** after showing the notice, strip the param with `history.replaceState`. The same applies to `?created=1` in `src/pages/lists/[id].astro:10`.

- **`.github/workflows/ci.yml:18`: the job name is out of date.** It's still `Lint, check and build`, but the job now also runs tests. Rename it to e.g. `Lint, test, check and build`.

### Positive observations

- PATCH builds the new list from the stored copy and replaces only `name` (`[id].ts:18`). Extra fields in the body, such as `id`, `titles` or `sort`, are ignored, and `test/list-routes.test.ts:91-103` tests this directly.
- Create avoids ids that are taken only in the index or only by a list key (`index.ts:11-17`), and there's a test for each case (`list-routes.test.ts:68-75`).
- API responses send `Cache-Control: no-store`, and conflicts map to 409 through the shared `apiError`.
- The client code uses plain custom elements with no framework. It sets `aria-busy`, disables controls while a request is in flight, and resets them after an error. Ids are URL-encoded wherever they go into a path.
- Astro escapes list names when it renders them, and the confirm dialog only uses `data-name` as text, so a list name can't inject markup.
- The test for the tooling commit passes on a clean checkout. The `.prettierignore` change is narrow, and Prettier still reads `.gitignore`.
