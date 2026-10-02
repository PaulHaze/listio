# Listio — Implementation Plan

Implements [`list-combiner-spec.md`](../list-combiner-spec.md). Vocabulary per
[`CONTEXT.md`](../CONTEXT.md).

## 1. Platform constraints that shape the design

| Constraint (Cloudflare free tier)                 | Consequence                                                                                                                                                                             |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **50 external subrequests per Worker invocation** | TMDB enrichment can't happen in one request for a 300-Title Source. The browser drives enrichment in chunks of ≤40 Titles per request.                                                  |
| **KV: 1,000 writes/day, 1 write/sec per key**     | No per-Title KV caching of TMDB data. A Save is ~2 writes (list + index). TMDB data is stored inside the list record, so Titles already in the list (or Removed) are never re-enriched. |
| **KV: eventually consistent (~60s)**              | After Save, Nuvio may see the old Catalog for up to a minute. Acceptable. The editor reads back its own saved state from the Save response, not from KV.                                |
| **KV value max 25 MiB**                           | One record per Combined List is fine (~300 bytes/Title → 3,000 Titles ≈ 1 MB).                                                                                                          |

Stack versions: Astro 7, `@astrojs/cloudflare` v14 (Workers, not Pages), Wrangler,
TypeScript strict, Vitest. Bindings are read via `import { env } from 'cloudflare:workers'`.
`astro dev` runs on workerd with local KV emulation, so dev == prod code path. Temporarily,
`pnpm dev` runs a Node dev server with a file-backed KV stand-in instead, because workerd
needs macOS 13.5+ ([ADR 0004](./adr/0004-temporary-node-dev-server.md)).

## 2. Project layout

```
src/
  domain/            # pure TS, no Cloudflare imports — fully unit-tested
    types.ts         # Title, CombinedList, SourceRecord, SortOrder
    slug.ts          # name → unique list id
    merge.ts         # add Source Titles into a list: dedupe, skip Removed, flag new;
                     # addTitle for a single searched Title (restores if Removed)
    sort.ts
  sources/           # one module per Source site
    detect.ts        # URL → { site, params } | error
    trakt.ts
    mdblist.ts
    imdb.ts          # (Sprint 09) GraphQL fetch + CSV parse
  tmdb/enrich.ts     # imdb/tmdb id → poster, year, blurb
  tmdb/search.ts     # (Sprint 07) query → movie/series results (no IMDb IDs yet)
  tmdb/lookup.ts     # (Sprint 07) tmdbId + type → full Title incl. IMDb ID
  storage/lists.ts   # KV repository: get/put list, index, delete
  addon/             # Stremio protocol: manifest + catalog builders (pure)
  pages/
    index.astro                    # Home: Combined Lists
    lists/[id].astro               # Editor (hosts the review-grid island)
    api/lists/index.ts             # POST create
    api/lists/[id].ts              # GET, PATCH rename, PUT save, DELETE
    api/sources/fetch.ts           # POST {url} → normalized Titles (not enriched)
    api/titles/enrich.ts           # POST {titles ≤40} → enriched Titles
    api/titles/lookup.ts           # POST {tmdbId, type} → Title, 422 if no IMDb ID
    api/search.ts                  # GET ?q= → TMDB multi-search results
    addon/[secret]/manifest.json.ts
    addon/[secret]/catalog/[type]/[...rest].ts   # {id}.json and {id}/skip=N.json
  components/editor/  # island (see §6)
test/fixtures/        # recorded Trakt / MDBList / TMDB responses
```

## 3. Data model

```ts
type TitleType = 'movie' | 'series';

interface Title {
	imdbId: string; // "tt0120815" — identity
	type: TitleType;
	name: string;
	year: number | null;
	poster: string | null; // full TMDB image URL
	blurb: string | null; // tagline, else first sentence of overview
	tmdbId: number | null;
	addedSeq: number; // monotonically increasing → "order added" sort
}

interface SourceRecord {
	url: string;
	site: 'trakt' | 'mdblist' | 'imdb' | 'imdb-csv';
	addedAt: string; // ISO
	titleCount: number;
	skippedNoImdb: number;
}

interface CombinedList {
	id: string; // "spy-thrillers" — immutable
	name: string;
	sort: 'newest' | 'oldest' | 'az' | 'added'; // default 'newest'
	sources: SourceRecord[];
	titles: Title[];
	removed: Title[]; // full Title kept so the Removed view can render + restore
	nextSeq: number;
	version: number; // incremented on every save (optimistic concurrency)
	updatedAt: string;
}
```

**KV keys**

- `list:{id}` → `CombinedList`
- `index` → `{ id, name, count, types: TitleType[] }[]` — read by Home and the manifest
  (avoids KV `list()` and its eventual consistency on new keys)

Type mapping from Sources: Trakt `show` / MDBList `show` / IMDb `tvSeries|tvMiniSeries` →
`series`; everything else movie-like → `movie`; seasons, episodes, people ignored.

## 4. Flows

### Adding a Source (all client-driven, nothing saved)

1. Editor POSTs `{url}` to `/api/sources/fetch` → server detects site, pages through the
   Source API (Trakt: `limit=100` pages; ≤1,000 items max), returns normalized
   `{ imdbId, type, name, year, tmdbId }[]` + skipped count.
2. Client merges into the Draft via `domain/merge.ts`: drop IMDb IDs already in `titles`
   or `removed`; the rest are **new**.
3. Client enriches new Titles in chunks of 40 via `/api/titles/enrich` (≈3 parallel
   chunks), filling posters/blurbs progressively in the grid.
   TMDB: `GET /movie/{tmdbId}` or `/tv/{tmdbId}` (poster_path, tagline, overview, date);
   if no tmdbId, `GET /find/{imdbId}?external_source=imdb_id` first.
   Enrichment failure leaves poster/blurb null — the Title is still usable.

### Adding a Title by search (client-driven, nothing saved)

A hand-built list is an ordinary Combined List, possibly with no Sources (ADR 0005).

1. Editor calls `GET /api/search?q=` (debounced ~300 ms) → server calls TMDB
   `/search/multi`, keeps `movie`/`tv` (`tv` → `series`), and returns
   `{ tmdbId, type, name, year, poster }[]`. Search results have no IMDb IDs.
2. On **Add**, editor POSTs `{ tmdbId, type }` to `/api/titles/lookup` → one TMDB call
   (`/movie|tv/{id}?append_to_response=external_ids`) returns a fully enriched `Title`.
   A null `imdb_id` → 422 "No IMDb ID, can't add".
3. Client applies `addTitle` to the Draft: already in `titles` → no-op; in `removed` →
   restored (an explicit add overrides a removal); otherwise appended as **new** with the
   next `addedSeq`. Saved with the normal Save.

Both calls are one TMDB subrequest each, well inside Worker limits.

### Save

`PUT /api/lists/{id}` with `{ version, name?, sort, sources, titles, removed }` (the full
next state). Server rejects with 409 if `version` is stale (e.g. edited in two tabs),
validates shape, writes `list:{id}` then updates `index`. Response returns the saved list.

### Create / rename / delete

- Create: slugify name, suffix `-2`, `-3`… if `list:{id}` or index entry exists; write empty list + index.
- Rename: updates `name` only.
- Delete: removes `list:{id}` and its index entry.

## 5. Addon endpoints

- `GET /addon/{secret}/manifest.json`
  - `id: "com.paulhaze.listio"`, `name: "Listio"`, `resources: ["catalog"]`, `types: ["movie","series"]`
  - `catalogs`: for each index entry, one per type present:
    `{ type, id: listId, name: listName, extra: [{ name: "skip" }] }`
- `GET /addon/{secret}/catalog/{type}/{id}.json` and `…/{id}/skip={n}.json`
  - Titles of that type, in the list's sort order, pages of 100:
    `{ metas: [{ id: imdbId, type, name, poster }] }`
- Secret: compared (constant-time) to `ADDON_SECRET` env secret; mismatch → 404.
- All addon responses: `Access-Control-Allow-Origin: *`, `Cache-Control: max-age=60`.
- Unknown list/type → `{ metas: [] }` (not an error), so a stale Nuvio collection degrades quietly.

## 6. Editor UI (the island)

One interactive island for the whole editor; the rest of each page is static Astro.

**Island framework: React** (`@astrojs/react`, `client:load`). Bundle size is irrelevant
for a single-user tool; familiarity wins.

State held in the island:

```
saved: CombinedList            // last saved
draft: { titles, removed, sources, sort, newIds:Set, changes:number }
selection: Set<imdbId>
view: 'all' | 'new' | 'removed'
```

- Trash → move Title from `draft.titles` to `draft.removed`, `changes++`, no confirm
- Checkbox → `selection`; floating **Remove selected (N)** fixed bottom-right when `selection.size > 0`
- **Save** appears beside it when `changes > 0` → confirm dialog → PUT → reset draft from response
- Restore (Removed view) → back into `draft.titles`
- `beforeunload` warning while `changes > 0`
- Grid renders progressively (IntersectionObserver, ~60 cards per batch); posters `loading="lazy"`
  from TMDB `w185`
- Card: poster, `Title (Year)`, blurb clamped to 1 line

## 7. Access & secrets

- Cloudflare Access application on the Worker hostname, allow policy = my email.
  A second Access application on path `/addon/*` with a **Bypass** policy so Nuvio can reach it.
- Secrets (`wrangler secret put`, `.dev.vars` locally, gitignored):
  `ADDON_SECRET`, `TRAKT_CLIENT_ID`, `MDBLIST_API_KEY`, `TMDB_API_KEY` (v4 read token or v3 key).
- Dev: Access isn't present locally; admin routes are open on localhost only.
- Nothing deployment-specific (keys, email, KV IDs, hostnames) is hard-coded: the repo will be
  open-sourced for others to self-host with their own keys (ADR 0003, Sprint 10).

## 8. Testing

- Vitest unit tests for everything in `domain/`, `sources/detect.ts`, source normalizers
  (against recorded fixtures), `addon/` builders.
- No live-API tests in CI; a `scripts/probe-*.ts` per Source for manual checks with real keys.
- Manual acceptance per phase, including a real Nuvio install at phase 4.

## 9. Build order

Broken into numbered sprints in [`docs/sprints/`](./sprints/README.md).

## 10. Open items

- MDBList exact response shape (verify in Sprint 02).
- Whether IMDb's GraphQL endpoint accepts requests from Cloudflare IPs (Sprint 09).
- Styling approach — plain CSS / scoped Astro styles assumed; no UI kit.
