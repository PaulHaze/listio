# Listio

Build curated, themed movie and TV lists (e.g. "Spy Thrillers") from public lists on other sites, strip out everything you don't want, and publish the result as a catalog in [Nuvio](https://nuvio.tv).

Other people's lists are full of things you don't want. Listio is a **curate-once** tool: pull in a lot of titles, de-duplicate them, remove the ones you don't want, and keep the result fixed. It does not sync.

## How it works

1. **Create a Combined List** and give it a name.
2. **Add Sources** by pasting list URLs:
   - [Trakt](https://trakt.tv) public lists
   - [MDBList](https://mdblist.com) lists
   - [IMDb](https://www.imdb.com) lists, with CSV upload as a fallback
3. **Review** the merged result in a poster grid (artwork and descriptions from [TMDB](https://www.themoviedb.org)). Titles are de-duplicated by IMDb ID. Trash anything you don't want, one at a time or in bulk.
4. **Save.** Nothing reaches Nuvio until you save. Removed titles are remembered, so adding more Sources later never brings them back.
5. **Watch in Nuvio.** Listio is a Stremio-protocol catalog addon: each Combined List appears as a movie and/or series catalog.

Sources are fetched once, when added, and never re-fetched. A Combined List is a static snapshot ([ADR 0001](./docs/adr/0001-combined-lists-are-static-snapshots.md)).

To replace a list’s contents, open the existing list and choose **Clear all titles**.
This clears Movies, Series, Removed Titles and source history in your Draft while
preserving the list name and ID, so existing Nuvio collections keep their links.
Paste replacement titles (or add Sources again), review them, then **Save** to publish.
Reload before saving to discard the clear. Saving an empty list leaves its existing
collection sources empty until you add and save replacement titles.

## Deploy your own Listio

Listio is a single-user, self-hosted app: each person deploys a separate copy with their
own storage, API keys and login ([ADR 0003](./docs/adr/0003-open-source-self-hosted-byok.md)).
There is no shared hosted service. Listio provides **catalogs**, not video streams;
keep your usual metadata and playback addons installed in Nuvio.

### 1. Accounts and tools

- Create a [Cloudflare account](https://dash.cloudflare.com/sign-up). You deploy to
  **Workers**, not Pages. No domain purchase is needed: Cloudflare provides an HTTPS
  `workers.dev` address. Workers and KV offer free plans with usage limits; consult
  [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and
  [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/) for current quotas.
- Install [Git](https://git-scm.com/downloads) and [Node.js](https://nodejs.org/en/download).
  Use Node 24.16.0 or newer in the 24.x line (see `.nvmrc`), or another version accepted
  by `package.json`. Cloudflare's local runtime needs a supported OS; on macOS use 13.5+.
- Install the pinned pnpm version: `npm install --global pnpm@12.6.0`.
- Install [Nuvio](https://nuvio.tv) on your viewing device.

Commands below assume a macOS/Linux terminal (or WSL on Windows). `cd` into the
repository before running pnpm commands.

```sh
git clone https://github.com/PaulHaze/listio.git
cd listio
pnpm install --frozen-lockfile
```

The GitHub owner in the clone URL identifies the upstream repository; your deployment
uses your own Cloudflare account.

### 2. Get your own API keys

Save these in a password manager. Providers may change signup requirements, access
policies and quotas; their linked documentation is authoritative.

**Trakt — `TRAKT_CLIENT_ID`:** Create a [Trakt account](https://trakt.tv), then open
[My API apps](https://app.trakt.tv/oauth/applications) and create an app for your
personal Listio deployment. Connect a verified GitHub account if requested. Give it a
name and description; if a redirect URI is required, use `http://localhost:4321`.
Copy its **Client ID**, not Client Secret. Listio reads public lists and does not
perform OAuth or require a user access token. Start with the free account; app access
is subject to Trakt's developer policy. See [Create an App](https://developer.trakt.tv/docs/create-an-app)
and [authentication](https://developer.trakt.tv/docs/authentication-oauth).

**MDBList — `MDBLIST_API_KEY`:** Sign up at [MDBList](https://mdblist.com), open
[Preferences](https://mdblist.com/preferences/), and copy your API key. The free tier
currently allows 1,000 requests per day, shared with your other apps. See the
[official API guide](https://docs.mdblist.com/docs/api).

**TMDB — `TMDB_API_KEY`:** Create a [TMDB account](https://www.themoviedb.org/signup),
then open [Settings → API](https://www.themoviedb.org/settings/api). Request a developer
key, complete the requested application/contact information, and accept TMDB's terms.
Describe this as a personal, non-commercial movie/TV catalog tool; use your own
application URL (your Worker URL once known, or your development URL while setting up).
Copy the **API Key (v3 auth)**. Listio also accepts the **API Read Access Token** if you
prefer it. Non-commercial API use is free with attribution; the app includes a Credits
footer with TMDB's approved logo and notice. See [TMDB's FAQ](https://developer.themoviedb.org/docs/faq).

There is no IMDb API key. Public IMDb lists can be imported by URL; if IMDb blocks the
request, export the list as CSV on IMDb and upload that CSV in the Listio editor.

### 3. Configure Cloudflare and create storage

```sh
cp wrangler.jsonc.example wrangler.jsonc
pnpm exec wrangler login
```

Complete the browser login with **your** Cloudflare account. In `wrangler.jsonc`, choose
an available Worker `name` (for example `my-listio`). Keep the entrypoint,
`compatibility_date`, `nodejs_compat` flag and `workers_dev: true` as supplied.
If you have multiple Cloudflare accounts, add an `account_id` for the intended account
or choose the correct account when prompted.

```sh
pnpm exec wrangler kv namespace create LISTIO
```

Wrangler creates a namespace and prints its ID. Replace the all-zero placeholder in
`kv_namespaces[0].id` with **that ID**; retain the binding name `LISTIO`. If Wrangler
offers to update the configuration, accept and verify the result. Do not create a
second binding. This namespace holds all saved Combined Lists. See Cloudflare's
[KV setup guide](https://developers.cloudflare.com/kv/get-started/).

`vars.ADDON_ID` is a public, stable addon identifier, defaulting to `org.listio.addon`.
If installing multiple Listio deployments in the same Nuvio profile, give each a
unique identifier (for example `org.listio.my-catalogs`). Keep it stable across deploys.
The site uses the request's origin for page URLs, so no hostname is configured in code.

### 4. Build, deploy and set secrets

First deploy the Worker:

```sh
pnpm build
pnpm exec wrangler deploy
```

The build downloads self-hosted fonts, so it needs internet access. On your first
Workers deployment, follow any prompt to register your account's `workers.dev`
subdomain. Save the HTTPS URL Wrangler prints (for example
`https://my-listio.your-subdomain.workers.dev`). The initial app returns **503** until
login secrets are configured; addon requests return **404** until their secret is set.

Generate two **different** random values, once for the addon secret and once for the
admin password. Save both in your password manager:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Run these commands one at a time, entering each value at Wrangler's prompt. They store
secrets on your Worker; values never belong in `wrangler.jsonc` or a Git commit.

```sh
pnpm exec wrangler secret put ADDON_SECRET
pnpm exec wrangler secret put TRAKT_CLIENT_ID
pnpm exec wrangler secret put MDBLIST_API_KEY
pnpm exec wrangler secret put TMDB_API_KEY
pnpm exec wrangler secret put ADMIN_USER
pnpm exec wrangler secret put ADMIN_PASSWORD
```

| Value             | What to enter                                         |
| ----------------- | ----------------------------------------------------- |
| `ADDON_SECRET`    | First random hex value; becomes part of the Nuvio URL |
| `TRAKT_CLIENT_ID` | Trakt app Client ID                                   |
| `MDBLIST_API_KEY` | MDBList Preferences key                               |
| `TMDB_API_KEY`    | TMDB v3 API key or API Read Access Token              |
| `ADMIN_USER`      | Your chosen ASCII username, without `:`               |
| `ADMIN_PASSWORD`  | Second random value, distinct from the addon secret   |
| `LISTIO`          | KV binding in Wrangler config, not a secret           |
| `ADDON_ID`        | Optional public Wrangler `vars` value; not a secret   |

Each `wrangler secret put` updates the live Worker immediately. Local `.dev.vars` values
are **not** automatically uploaded. See [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

Open your Worker URL. Enter `ADMIN_USER` and `ADMIN_PASSWORD` at the browser's login
prompt. This is HTTP Basic Auth; no Cloudflare Access/Zero Trust setup is required
([ADR 0006](./docs/adr/0006-basic-auth-instead-of-cloudflare-access.md)). Keep this URL
HTTPS. Browsers remember Basic Auth credentials and there is no in-app logout.

### 5. Create and save a Combined List

1. Choose **New list**, enter a name, and create it.
2. Add a public Trakt/MDBList/IMDb Source URL, or search for individual Titles.
3. Review the posters, remove unwanted Titles, and choose **Save**.
4. To create several lists together, choose **+ New collection** on Home, enter a title,
   and paste text with a `## ` header per list. Finish the import, then choose
   **Download collection** in the results modal and import the JSON in Nuvio.
5. Reload the page to confirm the saved list persists. Local development storage
   and deployed Cloudflare storage are separate; local lists are not deployed.

### 6. Install in Nuvio

Construct your private manifest URL by replacing both placeholders:

```text
https://YOUR-WORKER-HOST/addon/YOUR-ADDON-SECRET/manifest.json
```

Use the Worker hostname from step 4 and the exact `ADDON_SECRET` saved in your password
manager. Open the URL in a private browser window: it should return JSON without
asking for Basic Auth, with your saved list under `catalogs`.

In Nuvio, open **Addons** (depending on the device, under **Settings → Content &
Discovery → Addons**, or the TV sidebar). Choose the option to add/install an addon
from a URL, paste the full HTTPS manifest URL, and install. Your Combined List appears
as a Catalog. A list containing movies and shows creates separate movie and series
Catalogs. Open one and confirm its saved Titles appear. Menu labels vary by platform;
[Nuvio's repositories](https://github.com/NuvioMedia) cover the supported clients.

Anyone with this URL can read your catalogs. Keep it private; it contains neither your
Basic Auth password nor your provider API keys. Do not put an interactive Cloudflare
Access challenge in front of `/addon/*`, because Nuvio cannot log in. Refresh/reinstall
the addon when creating, renaming or deleting Combined Lists so Nuvio reloads the
manifest. Saved Title changes may take a minute to appear because addon responses
are cached and KV updates propagate across Cloudflare locations.

### Updates, backups and troubleshooting

To update, pull the latest code, preserve your Worker name, KV ID and addon identifier,
run `pnpm install --frozen-lockfile`, and run `pnpm run deploy`. Cloudflare retains the
Worker secrets and KV data. Do not replace your populated namespace with a new one.
Back up the namespace through Cloudflare's dashboard or
[KV API](https://developers.cloudflare.com/api/resources/kv/); Git contains no saved lists.

Existing deployments from before Sprint 10 must restore their KV ID into the new
placeholder config. To preserve the installed addon's identity, set `ADDON_ID` to the
`id` in its existing manifest; otherwise remove the old addon and install the new one.

| Symptom                                  | Check                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Deploy rejects namespace / empty storage | Replace the all-zero KV ID with your own namespace ID; confirm account and `LISTIO` binding  |
| Admin page returns 503                   | Both `ADMIN_USER` and `ADMIN_PASSWORD` must be set on the deployed Worker                    |
| Login repeats / returns 401              | Check credentials; clear the browser's remembered Basic Auth login or use a private window   |
| Addon returns 404                        | Check the path and exact `ADDON_SECRET`; a wrong or missing secret intentionally returns 404 |
| Manifest has no catalogs                 | Create a list, add at least one Title, and save it                                           |
| API says missing/invalid key             | Set the relevant Worker secret; confirm Client ID vs Client Secret and provider quota        |
| IMDb Source fails                        | Export CSV from the public list's IMDb page and upload it in the editor                      |
| Nuvio shows stale catalogs               | Refresh or reinstall the addon; allow time for KV propagation/cache expiry                   |
| Titles appear but will not play          | Listio supplies catalogs only; configure your other metadata/playback addons                 |

Rotate a leaked provider key at its provider and update the corresponding Worker
secret. Rotate a leaked addon URL by setting a new `ADDON_SECRET` and reinstalling
the new URL in Nuvio; the old URL stops working.

## Stack

- [Astro 7](https://astro.build) + TypeScript (strict), with a React island for the list editor
- [Tailwind CSS 4](https://tailwindcss.com), icons via `astro-icon` ([Lucide](https://lucide.dev/icons))
- Cloudflare Workers + Workers KV, HTTP Basic Auth for login ([ADR 0002](./docs/adr/0002-astro-on-cloudflare.md))
- ESLint 10 (flat config) and Prettier

## Development

### Requirements

- Node.js `22.22.3+`, `24.16.0+` (recommended, see `.nvmrc`) or `26.3.0+`
- pnpm 12 (pinned via the `packageManager` field in `package.json`)

### Local configuration

```sh
cp .dev.vars.example .dev.vars
```

Fill the six secrets using the same meanings as the deployment table above, then run
`pnpm dev` and open `http://localhost:4321`. `.dev.vars` and `.wrangler/` are ignored by
Git. Use ASCII values without embedded quotes or newlines for the simple Node dev
parser. Restart the dev server after changing secrets. The Node fallback stores lists
in `.wrangler/node-dev/LISTIO.json`; `pnpm dev:workerd` uses its own local KV store.
Neither writes production KV. Keep `.dev.vars.example` empty of actual credentials.

### Commands

| Command            | Action                                                                                                                                |
| :----------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install`     | Install dependencies                                                                                                                  |
| `pnpm dev`         | Start a Node dev server at `localhost:4321` with a file-backed KV stand-in ([ADR 0004](./docs/adr/0004-temporary-node-dev-server.md)) |
| `pnpm dev:workerd` | Start the dev server on Cloudflare's `workerd` runtime (needs macOS 13.5+)                                                            |
| `pnpm check`       | Type-check `.astro` and TypeScript files                                                                                              |
| `pnpm build`       | Type-check, then build the production site to `dist/`                                                                                 |
| `pnpm preview`     | Preview the production build locally                                                                                                  |
| `pnpm test`        | Run the Vitest suite                                                                                                                  |
| `pnpm run deploy`  | Build and deploy to Cloudflare Workers (using your configured namespace)                                                              |
| `pnpm lint`        | Format with Prettier and fix ESLint issues                                                                                            |
| `pnpm lint:check`  | Check formatting and lint without changing files (used in CI)                                                                         |

### Notes

- Dark mode is driven by the `data-theme` attribute on `<html>`. Theme colours live in `src/styles/main.css` as CSS variables and are exposed as Tailwind colours (`background`, `foreground`, `primary`, `secondary`, `accent`, `caution`, `alert`, `success`, plus muted variants).
- Fonts are configured under `fonts` in `astro.config.mjs`, downloaded from Fontsource at build time and self-hosted.
- pnpm only runs install scripts for packages listed under `allowBuilds` in `pnpm-workspace.yaml`. Add new entries there if `pnpm install` reports ignored builds.
- `pmOnFail: ignore` in `pnpm-workspace.yaml` keeps `pnpm-lock.yaml` as a single YAML document, because GitHub's dependency graph can't yet read pnpm 12's two-document format ([dependabot-core#15904](https://github.com/dependabot/dependabot-core/issues/15904)).
- CI (`.github/workflows/ci.yml`) runs `lint:check` and `build` on every push to `main` and every PR. Dependabot opens weekly grouped update PRs; minor/patch updates auto-merge once CI passes.

## Documentation

- [Product spec](./list-combiner-spec.md): what Listio does and its core rules
- [Implementation plan](./docs/implementation-plan.md): architecture, data model, addon endpoints
- [Glossary](./CONTEXT.md): Source, Combined List, Title, Removed Title, Draft, Catalog, Collection
- [ADRs](./docs/adr/): key decisions
- [Sprints](./docs/sprints/README.md): work plan and progress
- [Import a Nuvio collection](./docs/nuvio/import-collection.md): export selected Combined Lists as ordered folders and import the JSON

## Licence and data credits

Listio's source is [MIT licensed](./LICENSE). The bundled approved TMDB logo
(`public/tmdb-logo.svg`) comes from [TMDB's logos and attribution page](https://www.themoviedb.org/about/logos-attribution)
and remains TMDB's trademark; the MIT licence does not grant rights to third-party
logos, movie artwork or provider data. Follow each provider's terms when using your keys.

This product uses the TMDB API but is not endorsed or certified by TMDB.
