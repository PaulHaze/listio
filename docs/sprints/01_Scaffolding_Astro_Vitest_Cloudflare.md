# Sprint 01 — Scaffolding: Astro, Vitest, Cloudflare

**Status:** complete

## Goal

An empty-but-real Listio app that runs locally and is deployed to `workers.dev`, with tests
running. Everything later builds on this without re-plumbing.

## Tasks

- [x] Astro 7 project, TypeScript strict, minimal template
- [x] `@astrojs/cloudflare` adapter; `wrangler.jsonc` with `main: "@astrojs/cloudflare/entrypoints/server"`
- [x] KV namespace binding `LISTIO` (create namespace in Cloudflare; local emulation in dev)
- [x] `@astrojs/react` integration
- [x] Vitest configured; one trivial passing test
- [x] Folder layout from implementation plan §2 (empty modules are fine)
- [x] `.dev.vars.example` listing `ADDON_SECRET`, `TRAKT_CLIENT_ID`, `MDBLIST_API_KEY`, `TMDB_API_KEY`;
      un-ignore it in `.gitignore` (currently caught by `.dev.vars.*`); remove the obsolete `imports/` rule
- [x] npm scripts: `dev`, `build`, `preview`, `test`, `deploy`, `typecheck`
- [x] Hello-world page that reads and writes a KV value (proves the binding locally and deployed)
- [x] First deploy to `listio.<account>.workers.dev`

## Done when

- `npm run dev` serves the page locally, KV round-trip works
- `npm test` and `npm run typecheck` pass
- Deployed URL serves the same page, KV round-trip works there too

## Needs from Paul

- Cloudflare account logged in via `wrangler login`
