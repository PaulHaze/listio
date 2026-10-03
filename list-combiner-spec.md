# Listio — Product Spec (Personal Tool)

Vocabulary (Source, Combined List, Title, Removed Title, Draft, Catalog) is defined in
[`CONTEXT.md`](./CONTEXT.md). Key decisions are recorded in [`docs/adr/`](./docs/adr/).

## 1. Purpose

Build curated, themed movie/TV lists (e.g. "Spy Thrillers") by pulling in public lists from
other sites, de-duplicating them, and removing everything unwanted — then publish the result
as a Catalog in Nuvio. Lists can also be built by hand: search for Titles and add them one
at a time (e.g. a "Genre Benders" list), with or without any Sources. Free Trakt and MDBList
accounts cap how many lists you can make; Listio has no cap.

Other people's lists are full of things I don't want. Listio is a **curate-once** tool: pull
in a lot of Titles, strip them down, and keep the result fixed. It is not a sync tool.

Single user (me). Not designed for multi-user. Will eventually be open-sourced for others to
self-host with their own keys (BYOK); there will be no public hosted version. (ADR 0003)

## 2. Scope

**v1 Sources**

- **Trakt** public lists — `trakt.tv/users/{user}/lists/{slug}` or `trakt.tv/lists/{id}`
- **MDBList** lists — `mdblist.com/lists/{user}/{slug}`

**Next, in order**

- **IMDb** lists — paste `imdb.com/list/ls…` URL; if fetching fails, prompt for a CSV upload
  (the CSV exported from IMDb while logged in)

**Later (not v1)**

- Simkl — its API needs a PRO/VIP token and its pages block scripts; revisit via a browser
  bookmarklet that reads a list page the user is viewing and sends it to Listio
- Another addon's catalogs as a Source (pick catalogs from a checklist, capped at 500 Titles each)

**Out of scope**

- Reordering by hand (use the "order added" sort instead)
- Syncing/refreshing Sources
- Multiple users

## 3. Core rules

1. **A Combined List is a static snapshot.** A Source is fetched once, when added. It is
   never re-fetched. (ADR 0001)
2. **Titles are keyed by IMDb ID.** A Title appearing in several Sources appears once.
   Source items without an IMDb ID are skipped and reported ("3 skipped — no IMDb ID").
3. **Removed Titles are remembered per Combined List.** Adding another Source later never
   brings them back. They can be restored from a "Removed" view.
4. **Nothing reaches Nuvio until Save.** Added Sources, removals and restores all live in a
   Draft. Leaving the page with an unsaved Draft triggers the browser's "unsaved changes"
   warning; the Draft is otherwise discarded.
5. **Every Combined List has a fixed ID**, derived from its name at creation
   ("Spy Thrillers" → `spy-thrillers`, then `spy-thrillers-2` on collision). Renaming changes
   the display name only. Nuvio collections reference this ID, so it never changes.

## 4. Screens & workflow

### Home — Combined Lists

- List of Combined Lists (name, Title count), each opens its editor
- **+ New list** → enter a name → opens the editor
- Rename and delete per list (delete asks for confirmation)
- After create / rename / delete: notice "Refresh the Listio addon in Nuvio to see this change"
  (Nuvio caches the addon's list of Catalogs)

### Editor — adding Sources

- A URL box; a small **+** adds another URL box; repeat for as many Sources as needed
- Each URL is recognised by site and fetched in the background, showing status
  (fetching / N Titles / error)
- **Review List** opens the review grid with the merged result

### Editor — search & add Titles

- A search box (movies and shows together, via TMDB) shows a poster grid of results, each
  with title, year and a Movie/Series badge
- **Add** puts the Title into the Draft, the same as a Title from a Source. A result already
  in the list shows **In list**. A Removed Title shows **Restore**
- Titles with no IMDb ID can't be added ("No IMDb ID, can't add"), since Nuvio can't resolve them
- **Paste titles**: paste many titles, one per line (`Title (Year)`, year optional). Each line is
  matched on TMDB. Confident matches are added. Unclear lines go into a **Need a look** queue
  to choose a candidate or skip
- A list needs no Sources: a hand-built list is an ordinary Combined List, saved and published
  the same way (ADR 0005)

### Editor — review grid

- Large grid; each Title shows **poster, title, year, and a one-line description**
  (TMDB tagline, falling back to the first sentence of the TMDB overview). Nothing else.
- Each Title has a **trash icon** (removes it from view instantly, into the Draft — no
  confirmation) and a **checkbox**
- A single floating **Remove selected (N)** button, fixed bottom-right, appears when any
  checkbox is ticked
- Once the Draft has at least one change, a **Save** button appears beside it. Save opens a
  confirmation ("Save 7 changes to Spy Thrillers?"); confirming saves the whole Draft at once
- **Show only new** filter — only Titles added by Sources in the current Draft
- **Sort** per Combined List: newest (default), oldest, A–Z, order added. The same order is
  used in Nuvio
- **Removed (N)** view — lists Removed Titles with a restore action (restores go into the Draft)
- Large lists (1000+ Titles) load progressively while scrolling; no size cap

## 5. Nuvio addon

One Stremio-protocol catalog addon, named **Listio**, installed once in Nuvio.

- Each Combined List appears as **one Catalog per type**: a list with movies and shows
  appears as two Catalogs (movie + series), both named after the list. A list with one type
  appears as one Catalog.
- Catalog ID = Combined List ID; stable for the life of the list.
- Each Catalog item carries IMDb ID, type, name and poster; Nuvio fills in full metadata itself.
- Content changes appear in Nuvio without reinstalling. New / renamed / deleted lists need an
  addon refresh or reinstall in Nuvio.
- In Nuvio, Catalogs can be installed as rows or added to collection folders (a folder can
  hold both the movie and series Catalog of one list).

## 6. Access

- **Editing UI** — behind Cloudflare Access, allow-listed to my email only.
- **Addon endpoints** — outside Access (Nuvio can't log in); protected by a long secret slug
  in the URL. If it leaks, rotate it and reinstall in Nuvio.

## 7. Stack & hosting

Astro + TypeScript on Cloudflare Workers, Workers KV for storage, Cloudflare Access for login.
Default `*.workers.dev` address; custom domain optional later. (ADR 0002)

External services (all free keys): Trakt client ID, MDBList API key, TMDB API key.

## 8. Source notes

- **Trakt** — `GET https://api.trakt.tv/users/{user}/lists/{slug}/items` (or `/lists/{id}/items`),
  headers `trakt-api-key: {client_id}`, `trakt-api-version: 2`. No OAuth. Paginated via
  `X-Pagination-*` headers. Items carry `movie.ids` / `show.ids` incl. `imdb` (occasionally
  null) and `tmdb`. Ignore season/episode/person items. ~500 GET / 5 min.
- **MDBList** — `GET https://api.mdblist.com/lists/{user}/{slug}/items?apikey=…`. Items carry
  `imdb_id` and `mediatype`. Free tier 1,000 requests/day. Exact response shape to be
  verified with a real key.
- **IMDb** — CSV export and list pages are blocked for anonymous requests. Try IMDb's
  undocumented web GraphQL endpoint (`caching.graphql.imdb.com`, list items by `ls…` ID,
  cursor-paginated); on failure, prompt for CSV upload (`Const` column = IMDb ID).
- **TMDB** — poster, year, tagline and overview per Title; cached with the Title so it is
  fetched once.

## 9. Known limitations

- IMDb IDs that IMDb has since merged/redirected may appear as separate Titles. Ignored.
- IMDb URL import relies on an undocumented endpoint and may break (CSV upload remains).
- Nuvio may show a stale list of Catalogs until the addon is refreshed.
