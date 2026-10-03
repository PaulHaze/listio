# HTTP Basic Auth instead of Cloudflare Access

The editing UI and `/api/*` are protected by HTTP Basic Auth in `src/middleware.ts`, checked against the `ADMIN_USER` and `ADMIN_PASSWORD` secrets. `/addon/*` and `/robots.txt` are left open: the addon keeps its secret-in-URL protection because Nuvio can't log in. If either credential is unset, the middleware returns 503 for everything it guards rather than letting anyone in.

Listio has one user, editing from their own Mac a few times a month. Basic Auth lives in the repo, so it is tested, ships with every deploy, and can't drift from the routes the way dashboard settings can when the Worker is renamed or gets a custom domain. The browser saves the password, so logging in is one click. Self-hosters (ADR 0003) only have to set two more secrets, with no Zero Trust setup.

The costs: there's no logout (closing the browser usually clears it), no lockout after repeated guesses, and the password is sent with every request. Workers only serve HTTPS, and a long random password makes guessing impractical for what is at stake (one person's movie lists and API quota).

## Considered Options

- Cloudflare Access (the original plan): an email-allow-list application on the hostname plus a Bypass application on `/addon/*`. Rejected: setup and checks only happen in the dashboard, it can quietly stop matching after a hostname change, and an emailed one-time code on each infrequent visit is more friction than a saved password.
- A custom login form with a session cookie. Rejected: more code (form, cookie signing, CSRF) for no benefit with a single user.
