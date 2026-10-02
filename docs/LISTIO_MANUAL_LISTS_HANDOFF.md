# Listio: Manual Custom Lists (handoff)

> **Superseded.** This feature is scheduled as [Sprint 07](./sprints/07_GUI_Editor_Search_Add_Titles.md)
> and fitted to the existing design ([ADR 0005](./adr/0005-hand-built-lists-are-combined-lists.md)).
> Where this doc differs, the sprint file wins: hand-built lists are ordinary Combined Lists (the
> `CombinedList` model, `index` key, Draft + Save, Cloudflare Access, `addon/[secret]/…`).
> Drag-to-reorder and the Cinemeta fallback are deferred. Kept for background only.

**Goal:** make custom lists by hand. Think of a theme ("90s Sci-Fi"), search for titles, click Add, and the list shows up in Nuvio as a catalog.

Listio does nothing else in this feature:
- no scrobbling
- no watch tracking
- no social features
- no Trakt or Simkl

**Where it fits:** Listio already treats a list as a set of IMDb IDs stored in KV and served to Nuvio as a Stremio-protocol catalog addon. Manual adding is a second way to put IDs into the same list. List merging (pulling public lists, deduping by IMDb ID) can come later and feed the same lists. Build this first, because it proves the whole pipeline end to end: list → KV → catalog → Nuvio.

**Stack (existing):** Astro + TypeScript on Cloudflare Workers, KV, TMDB API key already available.

> The file paths below are suggestions. Adapt them to whatever the Sprint 01 scaffold already has, including how the Astro Cloudflare adapter exposes `env` (KV binding and secrets).

---

## 1. User flow

1. Open Listio, click **New list**, and type "90s Sci-Fi".
2. Type "event horizon" in the search box. A poster grid of movies and shows appears, each tile showing year and type.
3. Click **Add** on a result, which resolves its IMDb ID and saves it to the list.
4. On the list page, view the poster grid, remove items, drag to reorder, and rename the list.
5. Copy the addon manifest URL once, install it in Nuvio, and point a collection folder at the list's catalogs. After that, lists update live with no reinstall.

---

## 2. Data model (KV)

One key per list, plus KV prefix listing for the index.

```ts
// key: list:<slug>     e.g. list:90s-sci-fi
type ListItem = {
  imdbId: string;          // "tt0119081" (required, the ID Nuvio uses)
  type: "movie" | "series";// Stremio types (TMDB "tv" → "series")
  title: string;
  year?: number;
  poster?: string;         // full TMDB image URL, so pages render with no refetch
  tmdbId?: number;         // handy for later features
  addedAt: string;         // ISO
};

type List = {
  slug: string;            // stable id, used in catalog ids; don't change on rename
  name: string;            // display name, editable
  items: ListItem[];       // array order = display order
  createdAt: string;
  updatedAt: string;
};
```

- **Index:** `env.LISTS.list({ prefix: "list:" })`. There's no separate index key to keep in sync.
- **Dedupe:** adding an `imdbId` that's already in the list is a no-op that returns `{ duplicate: true }`.
- **KV consistency:** KV is eventually consistent, so a write can take a while to show up at other edge locations. That's fine for a single user. Just have the UI update optimistically from the POST response instead of re-reading.

---

## 3. Search: TMDB (IMDb has no public API)

**Search (movies and shows together):**
```
GET https://api.themoviedb.org/3/search/multi?query=<q>&include_adult=false&page=1
Authorization: Bearer <TMDB_READ_TOKEN>   (or ?api_key=<key>)
```
- Keep results where `media_type` is `movie` or `tv`, and drop `person`.
- Title: use `title` for movies and `name` for TV. Year comes from `release_date` or `first_air_date`.
- Poster: `https://image.tmdb.org/t/p/w342${poster_path}`.
- **Search results don't include IMDb IDs.** Resolve the ID only when the user clicks Add, not for every result:
  ```
  GET https://api.themoviedb.org/3/movie/<id>/external_ids   → imdb_id
  GET https://api.themoviedb.org/3/tv/<id>/external_ids      → imdb_id
  ```
- If `imdb_id` is null (this happens with obscure titles), show "No IMDb ID, can't add" and skip it. Nuvio can't resolve those titles anyway.

**Keyless fallback (optional):** Cinemeta search returns `tt…` IDs directly:
```
GET https://v3-cinemeta.strem.io/catalog/movie/top/search=<q>.json
GET https://v3-cinemeta.strem.io/catalog/series/top/search=<q>.json
```
Use TMDB as the primary source (better search quality, one key you already have). Cinemeta is a fallback if TMDB is down or rate-limited.

---

## 4. Routes

### Admin (behind auth: single shared token, same pattern as Nuvio Art's `authorize()`)

| Route | Purpose |
|---|---|
| `GET /api/search?q=` | Proxies TMDB multi-search. Returns `[{ tmdbId, mediaType, title, year, poster }]` |
| `GET /api/lists` | All lists: `[{ slug, name, count, updatedAt }]` |
| `POST /api/lists` | `{ name }` → creates a list and generates a slug. 409 if the slug already exists |
| `GET /api/lists/:slug` | The full list |
| `PATCH /api/lists/:slug` | `{ name?, order?: string[] }`. Rename, or reorder by an array of `imdbId`s |
| `POST /api/lists/:slug/items` | `{ tmdbId, mediaType }`. The server resolves the IMDb ID, builds the `ListItem`, and appends it. Returns the item plus `duplicate` |
| `DELETE /api/lists/:slug/items/:imdbId` | Removes one item |
| `DELETE /api/lists/:slug` | Deletes the list (with a confirm in the UI) |

Resolve the IMDb ID on the server in `POST …/items` so the TMDB key never reaches the browser.

### Public (Stremio addon protocol, read by Nuvio)

All public routes need the header `Access-Control-Allow-Origin: *`.

**`GET /addon/manifest.json`**
```json
{
  "id": "com.paulhaze.listio",
  "version": "0.1.0",
  "name": "Listio",
  "description": "My custom lists",
  "resources": ["catalog"],
  "types": ["movie", "series"],
  "catalogs": [
    { "type": "movie",  "id": "listio.90s-sci-fi", "name": "90s Sci-Fi" },
    { "type": "series", "id": "listio.90s-sci-fi", "name": "90s Sci-Fi" }
  ],
  "idPrefixes": ["tt"]
}
```
- Generate the manifest dynamically from KV.
- **Mixed lists:** Stremio catalogs are typed, so each list gets up to two catalogs, one per type. Emit a type's catalog only if the list contains at least one item of that type.
- In Nuvio, point one folder at both catalogs and it reads as a single list.
- Keep the catalog `id` tied to the `slug`, not the name, so renames don't break Nuvio folders.

**`GET /addon/catalog/:type/:id.json`** (also accept `/:type/:id/skip=N.json`)
```json
{ "metas": [ { "id": "tt0119081", "type": "movie", "name": "Event Horizon", "poster": "https://image.tmdb.org/t/p/w342/…", "releaseInfo": "1997" } ] }
```
- Filter `items` by type, keep list order, and page 100 at a time if `skip` is present.
- Return only the catalog resource. Detail pages and streams come from the user's other addons (Cinemeta, AIOMetadata and so on), which is why `tt` IDs matter.
- Cache headers: `Cache-Control: public, max-age=60` so edits show up in Nuvio quickly.

**Public URL privacy (optional):** mount the addon under an unguessable path segment, for example `/addon/<ADDON_KEY>/manifest.json`, so the lists aren't public by accident. Store `ADDON_KEY` as a secret.

---

## 5. UI (Astro pages)

- **`/`**: list of lists (name, count, updated), plus a **New list** button and the addon manifest URL with a copy button.
- **`/lists/[slug]`**:
  - Top: editable name and item count.
  - **Search panel:** debounced input (about 300 ms) and a poster grid of results. Each result has an **Add** button that switches to ✓ when added, is greyed out if the title is already in the list, and shows a type badge (Movie or Series).
  - **List panel:** poster grid of items with drag to reorder (saved via `PATCH order`) and an × to remove.
- Desktop-first is fine. Use islands only where interactivity is needed; plain `fetch` is enough, no framework required.

---

## 6. Build order

1. KV binding plus the `List` types and helpers (`getList`, `putList`, `slugify`)
2. Auth guard for `/api/*`
3. `/api/search` (TMDB proxy)
4. List CRUD routes plus `POST …/items` with IMDb resolution and dedupe
5. `/addon/manifest.json` and `/addon/catalog/...` with CORS
6. The two UI pages
7. **End-to-end check:** create "90s Sci-Fi", add about 3 movies and 1 show, install the manifest in Nuvio, add both catalogs to a folder, and confirm the posters show and detail pages open

## 7. Secrets and bindings

- `TMDB_READ_TOKEN` (or `TMDB_API_KEY`): secret
- `APP_TOKEN`: admin auth, secret
- `ADDON_KEY`: optional, secret
- `LISTS`: KV namespace binding

## 8. Later (out of scope for this feature)

- **List merging:** import public lists (IMDb, Trakt, MDBList, or other addon manifests), dedupe by IMDb ID, and prune results into these same `List` objects.
- **Prose extraction:** use an LLM to extract titles from Reddit threads and blog posts, then drop them into the same add flow as a review queue.
- **Covers:** cover art per list, via Nuvio Art.
- **Publishing:** read-only public versions of selected lists.
