## Audit: last commit b6506b0 — feat: implement sprint 03 KV storage and Nuvio addon

_Scope: Sprint 03 — Storage & Nuvio addon (from `docs/sprints/03_Storage_Nuvio_Addon.md`; plan §3 and §5 of `docs/implementation-plan.md`)_

Files audited: `src/storage/lists.ts`, `src/addon/{catalog,http,manifest}.ts`, `src/pages/addon/[secret]/manifest.json.ts`, `src/pages/addon/[secret]/catalog/[type]/[...rest].ts`, `src/env.d.ts`, `scripts/seed-list.ts`, `test/addon-storage.test.ts`. I read the supporting code in `src/domain/{sort,merge,slug}.ts`, `src/tmdb/enrich.ts`, `scripts/probe-utils.ts` and `src/dev/cloudflare-workers.ts` for context.

No critical issues found.

### Warning

**W1. A failed index write leaves a list that can't be seen and can't be re-seeded.** `src/storage/lists.ts:63-64`
`putList` writes `list:{id}` first and `index` second. If the second write fails (network blip, Wrangler error during `--remote` seeding), the list exists in KV but isn't in the index. The manifest reads only the index (plan §3), so Nuvio never sees the list. Re-running the seed is blocked by `scripts/seed-list.ts:93-94` ("already exists"), and `putList` with version 0 would also throw `VersionConflictError`. The only recovery is deleting the key by hand. The sprint doc's "Storage limitation" section covers concurrent races but not this partial-failure case.
_Fix:_ Write the index first and the list second. A stray index entry whose list is missing already degrades safely: the catalog returns `{ metas: [] }` and a retry overwrites it. Alternatively, have `putList`/the seed repair a missing index entry when the list already exists. Either way, mention the partial-failure case in the doc's "Storage limitation" section.

### Suggestion

**S1. Remote "key not found" detection depends on Wrangler's error text.** `scripts/seed-list.ts:47-54`
`remoteStore().get` treats a missing key as `null` only if stderr matches `/values\/[^\s]+ - 404: Not Found/` or stdout is `Value not found`. If a Wrangler upgrade rewords either message, every `--remote` seed of a *new* list fails at the existence check. It fails safely (nothing is written), but the error is confusing.
_Fix:_ Make the 404 match looser (e.g. `/404|not found/i`), or pin the expected Wrangler version in a comment. A one-line test with a stubbed `spawnSync` would catch a regression.

**S2. `remoteStore` silently ignores the `type` argument.** `scripts/seed-list.ts:33,55,74`
`get(key)` always `JSON.parse`s, whatever type the caller asks for, and the `as unknown as ListStore` cast hides the mismatch. `putList` only ever asks for `'json'`, so it works today. But the local path (`fileKV`) returns a raw string for `kv.get(\`list:${id}\`)` at line 93, so the two backends return different shapes for the same call. Only the null check saves line 93.
_Fix:_ Accept `(key, type?)` and return raw text unless `type === 'json'`, matching `fileKV` and real KV. Then drop the double cast.

**S3. The two route handlers have no tests.** `src/pages/addon/[secret]/manifest.json.ts`, `src/pages/addon/[secret]/catalog/[type]/[...rest].ts`
The unit tests cover the builders and helpers well, but nothing tests the routing contract: the secret check runs *before* path parsing (so there's no oracle), a malformed path → 404, an unknown type → `{ metas: [] }`, and an unknown list → `{ metas: [] }` (plan §5). These were only checked against the live Worker (sprint doc "Implementation verification").
_Fix:_ Add a small test that calls each `GET` with a stub `env` (the Node dev alias for `cloudflare:workers` can be reused with `vi.mock`). That locks in the ordering and the 404-vs-empty decisions.

**S4. Type and skip are validated in two places.** `src/pages/addon/[secret]/catalog/[type]/[...rest].ts:18-19`, `src/addon/catalog.ts:11-18,40-41`
The route rejects unknown types and then `buildCatalog` checks again. `parseCatalogPath` checks `isSafeInteger` on skip, and `buildCatalog` checks it again. This is harmless, but it puts the "unknown type → empty" rule in two places.
_Fix:_ Leave validation to `buildCatalog` and remove the route's type check, along with the `params.type!` non-null assertion that comes with it.

**S5. Seed relies on `enrichTitles` keeping input order.** `scripts/seed-list.ts:121-130`
Line 129 re-maps `addedSeq` from `merged.newTitles[index]`, which assumes `enrichSourceTitles` returns titles in the same order and number. `enrichTitles` does keep them in place (`src/tmdb/enrich.ts:229`, results stored by index), so this is correct. But it's an unstated coupling, and `enrichSourceTitles` overwrites `addedSeq` itself first.
_Fix:_ Call `enrichTitles(merged.newTitles, key)` directly. The titles already carry the correct `addedSeq`, `poster` and `blurb`, so the re-map step can go.

### Positive observations

- **Spec match is tight.** The manifest shape, one Catalog per type present (types derived from the titles), `extra: [{ name: 'skip' }]`, pages of 100, the `{ id: imdbId, type, name, poster }` metas, unknown list/type → `{ metas: [] }`, and CORS `*` plus `max-age=60` on *every* response, including 404s, all match plan §5 exactly.
- **The secret check is done right.** Both values are hashed to equal-length buffers before `timingSafeEqual`, empty or missing secrets are rejected, and the check runs before any path parsing or KV read (`src/addon/http.ts:4-14`).
- **Pagination filters by type before slicing and sorts a copy.** Removed Titles are excluded because only `list.titles` is used, and the source list isn't mutated (covered by tests).
- **Path parsing is strict.** It accepts only `{id}.json` and `{id}/skip=N.json` with safe non-negative integers, and tests cover the edge cases (`-1`, `1.5`, 2^53).
- **The KV concurrency limitation is documented honestly** in both the code comment (`src/storage/lists.ts:42-45`) and the sprint doc.
- **The seed CLI handles secrets carefully.** Values go through a 0600 temp file outside the repo that is removed on exit, with no secrets in arguments. The secret-bearing install URL is kept out of tracked docs. I confirmed it matches the current `.dev.vars` secret.
- **The sprint doc is honest about status.** On-device acceptance is clearly marked pending rather than ticked.
