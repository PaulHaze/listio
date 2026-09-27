# Sprint 01 — Scaffolding: Astro, Vitest, Cloudflare

**Status:** not started

## Goal
An empty-but-real Listio app that runs locally and is deployed to `workers.dev`, with tests
running. Everything later builds on this without re-plumbing.

## Tasks
- [ ] Astro 6 project, TypeScript strict, minimal template
- [ ] `@astrojs/cloudflare` adapter; `wrangler.jsonc` with `main: "@astrojs/cloudflare/entrypoints/server"`
- [ ] KV namespace binding `LISTIO` (create namespace in Cloudflare; local emulation in dev)
- [ ] `@astrojs/react` integration
- [ ] Vitest configured; one trivial passing test
- [ ] Folder layout from implementation plan §2 (empty modules are fine)
- [ ] `.dev.vars.example` listing `ADDON_SECRET`, `TRAKT_CLIENT_ID`, `MDBLIST_API_KEY`, `TMDB_API_KEY`;
      un-ignore it in `.gitignore` (currently caught by `.dev.vars.*`); remove the obsolete `imports/` rule
- [ ] npm scripts: `dev`, `build`, `preview`, `test`, `deploy`, `typecheck`
- [ ] Hello-world page that reads and writes a KV value (proves the binding locally and deployed)
- [ ] First deploy to `listio.<account>.workers.dev`

## Done when
- `npm run dev` serves the page locally, KV round-trip works
- `npm test` and `npm run typecheck` pass
- Deployed URL serves the same page, KV round-trip works there too

## Needs from Paul
- Cloudflare account logged in via `wrangler login`
