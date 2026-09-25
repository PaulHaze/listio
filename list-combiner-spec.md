# List Combiner — Technical Spec (Personal Tool)

## 1. Purpose

Combine multiple existing public lists (Trakt, Simkl, MDBList, IMDb, or another addon's
manifest) on a theme (e.g. "Spy Thrillers"), dedupe them, curate the merged result via a
web GUI, then serve the final list as my own Stremio/Nuvio catalog addon — deployed on
Cloudflare so Nuvio can reach it from anywhere, locked down so only I can use it.

Not building: public/multi-user support — single-user tool, just needs to not be wide open.

## 2. Stack

**Astro + TypeScript, deployed to Cloudflare Pages/Workers.** Astro was picked over Next.js
because this app is mostly a static review grid with a thin slice of interactivity (remove
buttons) — Astro's island architecture ships near-zero JS by default and only hydrates what
needs it. It has a first-class Cloudflare adapter, so local dev (`astro dev`) and the
deployed version are the same codebase throughout — no separate "local version" to migrate
later.

One codebase covers all three pieces:
- **Fetch/merge/dedupe logic** — plain TypeScript modules, no framework needed
- **Curation UI** — Astro pages/components, using an island (e.g. a small React or Preact
  component, or Astro's own client directives) for the interactive review grid
- **Addon endpoints** — Astro API routes (`src/pages/.../manifest.json.ts`,
  `src/pages/.../catalog/[type]/[id].json.ts`) — same code path locally and deployed

## 3. High-level flow

```
[Add source list URLs] → [Fetch + normalize] → [Merge + dedupe by imdb_id]
    → [Review grid: delete unwanted items] → [Save curated list to storage]
    → [Astro API routes serve manifest.json + catalog from that storage]
    → [Nuvio installs the manifest URL directly, from anywhere]
```

## 4. Sources & fetching

All sources normalize down to:

```json
{
  "imdb_id": "tt0120815",
  "title": "Saving Private Ryan",
  "year": 1998,
  "type": "movie" | "show",
  "poster_url": null
}
```

Posters aren't provided consistently by every source — backfill via TMDB's `find` endpoint
(`GET /find/{imdb_id}?external_source=imdb_id`), one call per item, free API key.

### Trakt
- Public list endpoint: `GET /users/{user}/lists/{list_id}/items`
- Needs only a Trakt Client ID (no OAuth for public list reads)
- Each item has `ids.imdb` directly — no extra lookup needed

### Simkl
- Public list endpoint via Simkl API, needs a client ID
- Items include `imdb_id` in the `ids` block, same pattern as Trakt

### MDBList
- `GET /lists/{list_id}/items` (or by list slug/URL) — needs API key
- Items include `imdbid` directly
- Read-only usage here — not writing anything back to MDBList, so no list-limit exposure

### IMDb
- No official API. Use the list's **Export** button (on the list page) → downloads a CSV
- CSV columns include `Const` (this is the imdb_id, e.g. `tt0120815`), `Title`, `Year`
- Tool accepts either a pasted IMDb list URL (if fetching the CSV export link
  automatically) or a manually-downloaded CSV dropped into an `imports/` folder — CSV import
  is the reliable fallback if IMDb changes their page structure

### Another addon's manifest (bonus source — cheap to add, same pipeline)
- Paste any Stremio/Nuvio-compatible manifest URL (including your own, once it's live —
  lets you remix your own published lists into a new combined one)
- Fetch `manifest.json`, list its `catalogs`, fetch each `catalog/{type}/{id}.json`, feed
  the returned `metas` into the same normalizer (metas already carry `id` as imdb_id in
  the common case, `type`, `name`, `poster`)

## 5. Merge & dedupe

- Key everything by `imdb_id`
- If duplicate imdb_id appears from multiple sources, keep first occurrence, ignore rest
- Known edge case: an old imdb_id occasionally redirects to a newer one on IMDb's side, and
  not all APIs follow the redirect — acceptable to ignore for a personal tool, note as a
  known limitation rather than solving it

## 6. Access control

Two different surfaces, two different protections:

### Manifest & catalog endpoints (Nuvio-facing)
Nuvio just installs a URL — no login flow it can complete. Protection is an unguessable
secret baked into the URL path itself, same pattern as AIOMetadata's per-user UUID:

```
/api/{secret-slug}/manifest.json
/api/{secret-slug}/catalog/{type}/{id}.json
```

`secret-slug` is a long random string (generate once, store as an env var/binding, not in
source control). Anyone without the exact URL gets nothing. If it ever leaks, rotate the
slug and reinstall in Nuvio — same "treat it like a password" posture as your ElfHosted
manifest URL.

### Curation UI (browser-facing, only me)
This route has a real user behind it, so it can have a real login — **Cloudflare Access**
(Zero Trust, free tier) in front of the deployment, restricted to a single allow-listed
email. No app code needed: Access intercepts requests before they hit the Worker and only
lets authenticated requests through. Simplest option here since it's a Cloudflare-native
feature and this is already a Cloudflare deployment.

Keep the manifest/catalog routes **outside** the Access policy (only gate `/admin` or
wherever the curation UI lives) — Access requires an interactive login, which Nuvio can't do.

## 7. Storage

**Cloudflare KV** — one entry per project, holding the same shape as local JSON would:

```
key: project:spy-thrillers
value: {
  sources: [...],   # source URLs/paths added
  merged: [...],    # last fetched+merged raw set
  removed: [...]    # imdb_ids explicitly removed (persists across re-fetches)
}
```

`removed` is the important one — re-running fetch shouldn't resurrect items already thrown
out. On merge, filter out anything in `removed` before showing the review grid.

KV is a fine fit for local dev too (Wrangler's local KV emulation), so no separate storage
layer needed between dev and deployed.

## 8. Addon endpoints

Standard Stremio-protocol catalog addon — two JSON endpoints, generated from KV.

**`GET /api/{secret-slug}/manifest.json`**
```json
{
  "id": "com.paulhaze.listcombiner",
  "version": "1.0.0",
  "name": "My Curated Lists",
  "description": "Personal merged lists from Trakt/Simkl/MDBList/IMDb",
  "resources": ["catalog"],
  "types": ["movie", "series"],
  "catalogs": [
    { "type": "movie", "id": "spy-thrillers", "name": "Spy Thrillers" },
    { "type": "movie", "id": "mind-benders", "name": "Mind Benders" }
  ]
}
```
`catalogs` array is generated dynamically by listing project keys in KV — new themed list
shows up here automatically, no manual wiring per project.

**`GET /api/{secret-slug}/catalog/{type}/{id}.json`**
```json
{
  "metas": [
    { "id": "tt0120815", "type": "movie", "name": "Saving Private Ryan", "poster": "https://..." }
  ]
}
```
`id` must be the imdb_id (Stremio/Nuvio resolve full metadata from it automatically via
Cinemeta/AIOMetadata — no need to serve full metadata yourself, just id/type/name/poster).

## 9. Installing in Nuvio

Install `https://your-app.pages.dev/api/{secret-slug}/manifest.json` directly in Nuvio as a
standalone addon, or paste it into Xperience via "Import from another add-on" to drop
catalogs into a folder inside a collection, same as the AIOMetadata catalogs. Updates are
live the moment a removal is saved — no separate publish/redeploy step.

## 10. Suggested build order

1. `npm create astro@latest` — TypeScript, minimal template; add the Cloudflare adapter
   and Wrangler config early so local dev and deploy target are aligned from day one
2. Fetch functions for each source (Trakt, Simkl, MDBList, IMDb CSV, manifest import) →
   normalized list, as plain `.ts` modules first (test outside any UI)
3. Merge/dedupe logic + `removed` filtering
4. TMDB poster backfill
5. `manifest.json.ts` and `catalog/[type]/[id].json.ts` routes under the secret-slug path,
   reading from KV — get this working with one hand-built test project before building any UI
6. Generate the secret slug, confirm Nuvio can install and read from the deployed URL
7. Curation page: static render of the merged grid first (no interactivity)
8. Add the remove-item island component, wired to update KV
9. Set up Cloudflare Access on the curation route only
10. Project creation/source-adding UI (a hand-edited KV entry via Wrangler CLI is a fine
    stopgap while the above is being built, if that's faster to iterate on)

## 11. Open questions / decide later

- Rate limiting: TMDB poster lookups will be the slowest part for large source lists — worth
  caching poster URLs in the KV entry so re-fetches don't re-hit TMDB for items already seen
- Show vs movie type mismatches between sources (rare, but Trakt/Simkl distinguish, IMDb CSV
  sometimes doesn't cleanly) — decide whether to trust source-declared type or verify via TMDB
- Any future public/multi-user version is a separate project, not this one
