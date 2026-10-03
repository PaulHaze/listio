# Astro on Cloudflare Workers, KV and Access

Listio is an Astro + TypeScript app on Cloudflare Workers, storing Combined Lists in Workers KV. The editing UI sits behind Cloudflare Access (single allow-listed email), and the Nuvio addon endpoints sit outside Access, protected only by a secret slug in the URL, because Nuvio cannot complete an interactive login. Chosen over a self-hosted Node/Docker app because Nuvio must reach the addon from anywhere, and Cloudflare gives public hosting and real login for free with no auth code of our own.

> **Update:** ADR 0006 replaced Cloudflare Access with HTTP Basic Auth in the app (`ADMIN_USER` / `ADMIN_PASSWORD`). The addon endpoints are still outside the login, protected by the secret slug.
