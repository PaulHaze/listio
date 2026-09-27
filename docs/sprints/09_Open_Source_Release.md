# Sprint 09 — Open-source release (BYOK)

**Status:** not started

## Goal
Publish the repo so anyone can deploy their own single-user Listio with their own keys (ADR 0003).

## Tasks
- [ ] Audit the repo for anything specific to Paul's deployment (email, KV IDs, hostnames, keys) — all must come from config/secrets
- [ ] Example config files (`.dev.vars.example`, example `wrangler` config) with every required value listed
- [ ] Detailed README: what Listio is for, then a step-by-step self-build guide —
      getting free Trakt / MDBList / TMDB keys, creating the KV namespace, setting secrets,
      deploying, setting up Cloudflare Access (including the `/addon/*` Bypass), and installing the addon in Nuvio
- [ ] Licence (e.g. MIT)
- [ ] TMDB attribution in the UI, as TMDB's API terms require

## Done when
- Someone with a fresh Cloudflare account can go from clone to a working addon in Nuvio using only the README
