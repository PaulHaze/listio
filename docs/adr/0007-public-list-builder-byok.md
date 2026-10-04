# Public hosted list builder, bring-your-own TMDB key (proposed, after Sprint 14)

**Status:** proposed — a nice-to-have, not a commitment. Not scheduled. Partly reopens ADR 0003.

The owner wants the hand-built side of Listio to be public at some point: build a list by searching, paste a long list of titles, or paste a sectioned file (like `docs/movie_lists/midnight_movies.md`) and get one list per section plus a Nuvio collection JSON. No existing tool turns a plain text list into a Nuvio collection, so this has real value beyond the owner. The public version leaves out Trakt, MDBList and IMDb Sources entirely, which removes the shared rate-limit problem that made ADR 0003 reject a hosted service.

To stop one TMDB key being hammered, users bring their own TMDB key, as other Nuvio tools already do (e.g. xperience asks for Trakt, MDBList, TVDB and TMDB keys). The key is the only one needed for the list builder.

Design must not block this while finishing the private version: keep paste parsing, matching, the collection builder and the addon catalog code free of single-user assumptions where it costs nothing, and keep Sources optional (ADR 0005).

## Open decisions (for when this is scheduled)

- Identity: accountless secret links (each set of lists has an unguessable edit link and addon URL) vs. real accounts. Leaning secret links first.
- Where a user's TMDB key lives: browser only (sent per request) vs. stored server-side against their link.
- Per-user storage (KV per link vs. D1) and limits on list count, list size and writes.
- TMDB terms for a public app (attribution, API tier), privacy policy, Cloudflare cost.
- Whether the public and private versions are one deployment with a mode switch or two.

## Considered Options

- Public with Sources (Trakt/MDBList) — rejected for now: shared rate limits and more keys for users, for a feature others already cover.
- Public using the owner's TMDB key with caching and per-user limits — possible fallback, but rejected as the default: the owner carries the load and the risk.
