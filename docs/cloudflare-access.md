# Cloudflare Access setup

Listio's editing UI and admin API rely on Cloudflare Access for authentication
([ADR 0002](./adr/0002-astro-on-cloudflare.md)). Nuvio uses the public addon
with `ADDON_SECRET` in its URL. Configure the two applications below in the
Cloudflare dashboard; deploying Listio does not create them.

## Deployment status

Sprint 08 provides this runbook. The live Access applications have **not been
configured or verified by this sprint**. The available Wrangler OAuth scopes
do not include Access application/policy management, and the browser session
has no authenticated Cloudflare dashboard. The deployment hostname and Paul's
exact allow-listed email still need confirmation. All live acceptance checks
below remain pending; local route tests cannot prove Access protection.

## Before configuring Access

1. In the Cloudflare account containing the `listio` Worker, open Zero Trust.
   Complete onboarding, choose the Free plan and set a team name if needed.
   Use an account role permitted to manage Access applications and Workers.
2. Confirm Paul's exact login email. Keep it in the dashboard rather than
   committing it to this repository.
3. In **Workers & Pages → listio → Settings → Domains & Routes**, find the
   deployed production hostname. Below, `HOST` means that hostname without
   `https://` or a trailing slash; for example, `listio.example.workers.dev`.
   Confirm the Worker is deployed with its KV binding and a nonempty, long,
   random `ADDON_SECRET`. Do not paste the secret or full addon URL into reports.
4. Inventory every hostname/route and preview URL that can serve this Worker.
   Disable unused URLs, including previews, or protect them too. For each
   additional production hostname kept active, apply the same two applications
   and run the acceptance checks on that hostname. A protected custom domain
   alone leaves an enabled `workers.dev` hostname exposed.
5. Enable **One-time PIN** as a login method in Zero Trust's identity provider
   settings, or select an existing provider that verifies Paul's email. Email
   authentication and the exact-email Allow policy are separate settings.

Cloudflare supports hostname/path applications on `workers.dev` as well as
custom domains. Use hostname-based applications for this setup; their scope
allows the addon exception. See [Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
and [One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).

## Create the two applications

In **Zero Trust → Access controls → Applications**, select **Create new
application** (or **Add an application**) and choose **Self-hosted and private**
(or **Self-hosted**). Add a public hostname; use custom hostname input if the
`workers.dev` hostname is not in the domain dropdown. Enter the exact `HOST`.

| Setting          | Main application            | Addon application    |
| ---------------- | --------------------------- | -------------------- |
| Name             | `Listio admin`              | `Listio addon`       |
| Hostname         | `HOST`                      | The same `HOST`      |
| Path             | **Empty** (entire hostname) | `/addon/*`           |
| Policy name      | `Paul only`                 | `Nuvio public addon` |
| Policy action    | **Allow**                   | **Bypass**           |
| Include selector | **Emails**                  | **Everyone**         |
| Include value    | Paul's one exact email      | Everyone             |

If the dashboard displays the leading slash separately, enter `addon/*` in
the addon Path field. The saved application domain must be `HOST/addon/*`.
Keep the main application Path field empty; setting it to `/lists/*` would
leave the home page and API uncovered.

Save the main application with only the exact-email Allow policy and the
chosen login method, then save the separate addon application with its Bypass
policy. An Allow policy's additional Include entries are alternatives: adding
Everyone, an email domain, or One-time PIN as an Include rule would broaden
access beyond Paul. Users who do not match Allow are denied by default.
See [self-hosted application setup](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
and [Access policy rules](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/).

The more specific `HOST/addon/*` application overrides the hostname policy
for addon routes. It covers both manifest and nested catalog requests, while
the bare `/addon` path remains under the main policy. `/api/*` has no exception
and inherits the main application, as do `/`, `/lists/*`, and UI assets. Check
that no existing application or Bypass policy overrides `/api/*` or the UI.
See [path precedence](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)
and [Bypass for a public endpoint](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/common-policies/).

Bypass skips Access login, so the Worker still checks `ADDON_SECRET` for every
manifest and catalog request. Both route handlers reject a wrong or missing
configured secret with a JSON 404 before reading KV. The addon Bypass must
remain restricted to `/addon/*`.

## Live acceptance checklist

Run these against each enabled deployment hostname, using a fresh private
browser session with no Access cookies. Close all private windows between
identity tests so a successful Paul session cannot mask a failure.

- [ ] `/` and `/lists/<existing-list-id>` require Access login before the UI loads.
- [ ] `/api/lists` and `/api/search?q=test&type=movie` require Access login
      before an application response, including direct requests to the API.
      Verify a cookie-free `POST /api/lists` with an empty JSON object also
      gets an Access challenge/denial, rather than Listio's validation response.
      The empty object cannot create a Combined List if the policy is missing.
- [ ] Paul's verified email can log in, open a Combined List and use the editor
      through its API. Confirm a saved change reaches Nuvio only after Save.
- [ ] A different verified email cannot reach either the UI or API.
- [ ] Without logging in, `/addon/<correct-secret>/manifest.json` returns
      JSON 200, with no Access redirect or login HTML.
- [ ] A catalog URL from that manifest,
      `/addon/<correct-secret>/catalog/<type>/<catalog-id>.json`, returns JSON
      200, including a nested pagination request with `/skip=100.json` in place
      of `.json` on the catalog ID. Verify `Access-Control-Allow-Origin: *`.
- [ ] `/addon/definitely-wrong-secret/manifest.json` and the corresponding
      catalog URL return JSON **404**, rather than an Access login page.
- [ ] Install the correct manifest URL in Nuvio; its catalogs load without
      interactive login, including scrolling to fetch further pages.
- [ ] Confirm each alternative hostname/preview is disabled or passes these checks.

For cookie-free admin checks, inspect responses without following redirects:

```sh
rtk proxy curl -sS -D - -o /dev/null 'https://HOST/api/lists'
rtk proxy curl -sS -D - -o /dev/null -X POST -H 'Content-Type: application/json' --data '{}' 'https://HOST/api/lists'
```

Replace `HOST` with the actual hostname. An Access login redirect or Access
denial is expected; an application response (including a 400 or 405) shows
missing coverage. Inspect
the wrong-secret response body as well as its status to distinguish the
Worker's 404 from a proxy response. Test correct-secret URLs privately and
record only results, never the secret, cookies or one-time PINs.

Record the date, application names, route coverage and pass/fail outcomes in
the [Sprint 08 record](./sprints/08_Cloudflare_Access.md). Mark the dashboard
tasks complete only after saving and inspecting the applications; mark the
sprint complete only after all live checks pass. Repeat coverage checks after
deployments that change domains, routes or preview availability. Sprints 05–07
retain their separate pending acceptance checks.
