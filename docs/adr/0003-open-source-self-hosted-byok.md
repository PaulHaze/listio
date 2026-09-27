# Open source, self-hosted, bring-your-own-keys — no public hosted service

Listio will eventually be published as an open-source repo that anyone can deploy to their own Cloudflare account with their own API keys (Trakt, MDBList, TMDB), their own KV namespace, their own Cloudflare Access policy and their own addon secret. There will be no public hosted version (e.g. a `listio.net` with sign-ups). Each deployment stays single-user, so the existing design is unchanged; the only obligations are that nothing user-specific (keys, email, KV IDs, hostnames) is hard-coded — all of it comes from `wrangler` config and secrets — and that the repo ships a detailed README explaining how to build and deploy it yourself.

## Considered Options

- Public hosted service — rejected: needs real user accounts, per-user data (likely D1 instead of KV), per-user addon tokens, a solution for shared API rate limits (MDBList's free tier alone can't serve many users), edge caching, privacy policy and ongoing operations. Too much work for the value of the project.
- Keep it private — rejected: self-hosting costs the author nothing and others may find it useful.
