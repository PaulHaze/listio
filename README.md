# Listio

Build curated, themed movie and TV lists (e.g. "Spy Thrillers") from public lists on other sites, strip out everything you don't want, and publish the result as a catalog in [Nuvio](https://nuvio.tv).

Other people's lists are full of things you don't want. Listio is a **curate-once** tool: pull in a lot of titles, de-duplicate them, remove the ones you don't want, and keep the result fixed. It does not sync.

> **Status:** early development. The app is scaffolded; the features below are planned and tracked in [`docs/sprints/`](./docs/sprints/README.md).

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

## Self-hosting

Listio is single-user and self-hosted: you deploy your own copy to your own Cloudflare account with your own free API keys. There is no public hosted version ([ADR 0003](./docs/adr/0003-open-source-self-hosted-byok.md)).

You'll need:

- A Cloudflare account (Workers and Workers KV, both on the free tier)
- A Trakt client ID, an MDBList API key and a TMDB API key (all free)

The editing UI and `/api/*` sit behind a username and password (HTTP Basic Auth), set as the
`ADMIN_USER` and `ADMIN_PASSWORD` secrets. If either is missing, every admin page returns 503.
The addon endpoints Nuvio calls are protected by a long secret in the URL instead.
([ADR 0006](./docs/adr/0006-basic-auth-instead-of-cloudflare-access.md))

A step-by-step deployment guide will be added before the open-source release ([Sprint 10](./docs/sprints/10_Open_Source_Release.md)).

## Stack

- [Astro 7](https://astro.build) + TypeScript (strict), with a React island for the list editor
- [Tailwind CSS 4](https://tailwindcss.com), icons via `astro-icon` ([Lucide](https://lucide.dev/icons))
- Cloudflare Workers + Workers KV, HTTP Basic Auth for login ([ADR 0002](./docs/adr/0002-astro-on-cloudflare.md))
- ESLint 10 (flat config) and Prettier

## Development

### Requirements

- Node.js `22.22.3+`, `24.16.0+` (recommended, see `.nvmrc`) or `26.3.0+`
- pnpm 12 (pinned via the `packageManager` field in `package.json`)

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
| `pnpm deploy`      | Build and deploy to Cloudflare Workers                                                                                                |
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
- [Glossary](./CONTEXT.md): Source, Combined List, Title, Removed Title, Draft, Catalog
- [ADRs](./docs/adr/): key decisions
- [Sprints](./docs/sprints/README.md): work plan and progress
