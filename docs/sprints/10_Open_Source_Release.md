# Sprint 10 — Open-source release (BYOK)

**Status:** implemented; acceptance pending

## Goal

Publish the repo so anyone can deploy their own single-user Listio with their own keys (ADR 0003).

## Tasks

- [x] Audit the repo for anything specific to Paul's deployment (email, KV IDs, hostnames, keys) — all must come from config/secrets
- [x] Example config files (`.dev.vars.example`, example `wrangler` config) with every required value listed
- [x] Detailed README: what Listio is for, then a step-by-step self-build guide —
      getting free Trakt / MDBList / TMDB keys, creating the KV namespace, setting secrets,
      deploying, setting the `ADMIN_USER` / `ADMIN_PASSWORD` Basic Auth secrets (ADR 0006), and installing the addon in Nuvio
- [x] Licence (e.g. MIT)
- [x] TMDB attribution in the UI, as TMDB's API terms require

## Done when

- Someone with a fresh Cloudflare account can go from clone to a working addon in Nuvio using only the README

## Implementation and verification

- Removed the deployment KV ID and hostname; `wrangler.jsonc` and its example use an
  explicit namespace placeholder, and canonical/social page URLs use the request origin.
- Replaced the personal addon identifier with a generic default and optional `ADDON_ID`
  configuration. README upgrade instructions explain how existing installs keep their identity.
- Audited tracked application/configuration/documentation for deployment identifiers,
  email addresses and credential assignments. No live credentials were found in tracked
  files; test credentials and sample usernames are fixtures, not deployment settings.
  Upstream GitHub attribution and the licence copyright identify the project author.
- Added all runtime configuration to `.dev.vars.example` and the README; documented
  provider registration using official docs, KV provisioning, Worker deployment, six
  interactive secret commands, Basic Auth, Nuvio installation, local development and updates.
- Added the MIT licence and an approved, locally served TMDB logo with the required
  notice in the shared Credits footer. Third-party assets/data retain their own terms.
- `pnpm test`: 132 tests passed; `pnpm build`: passed with 0 errors (one existing
  `beforeunload.returnValue` deprecation hint); `pnpm lint:check`: passed.
- A clean source copy with independently installed locked dependencies and no
  `.dev.vars` also passed `pnpm build`; no local credentials are required to build.
- `pnpm exec wrangler deploy --dry-run`: passed; confirmed the generated Worker config
  uses the placeholder namespace and configured addon ID. No remote resources changed.
  Wrangler reported the existing unsupported macOS 12 host warning.

## Acceptance still required

A fresh-account Cloudflare deployment and on-device Nuvio installation using only the
README have not been performed in this implementation. The repo is ready for that
walkthrough; no release/publication or production deployment was performed. Existing
self-hosters must preserve their own KV ID and addon identity when updating.
