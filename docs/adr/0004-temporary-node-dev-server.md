# Temporary Node dev server while developing on macOS 12

**Status:** temporary. Revert once development moves to a Mac on macOS 13.5+ (expected October 2026).

`workerd`, which `@astrojs/cloudflare` uses for `astro dev`, requires macOS 13.5+, and the development iMac is stuck on macOS 12.7. So `pnpm dev` sets `LISTIO_NODE_DEV=1`, which runs Astro's normal Node dev server without the Cloudflare adapter and aliases `cloudflare:workers` to `src/dev/cloudflare-workers.ts`: a stand-in `env` with a file-backed `LISTIO` KV (`.wrangler/node-dev/LISTIO.json`) and secrets read from `.dev.vars`. `pnpm dev:workerd` keeps the real runtime. Builds, deploys and tests are unaffected.

The cost is that local dev no longer runs the production code path: Cloudflare-specific behaviour (the 50-subrequest limit, real KV semantics such as eventual consistency) is only exercised on the deployed `workers.dev` build, so each sprint's final acceptance check happens there.

To revert: point `dev`/`start` back at plain `astro dev`, delete `dev:workerd`, the `nodeDev` branches in `astro.config.mjs` and `src/dev/`, and mark this ADR superseded.

## Considered Options

- Upgrade to macOS 13+ via OpenCore Legacy Patcher — rejected: not worth it with a new Mac a month away.
- Linux VM or container (UTM, older Docker Desktop) running real `workerd` — rejected: heavier setup and slow file watching on an Intel iMac.
- GitHub Codespaces — rejected: moves editing and agents off the local machine.
- Deploy on every change — rejected: too slow for UI work.
