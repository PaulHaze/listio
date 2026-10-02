# Audit Summary: sprint-02 — Domain core & Sources: Trakt, MDBList, TMDB

Findings from both the Sol (Astra) and Opus (Claude) audits:

## Issues

### 1. Live acceptance not done: the probes have not run against real lists [Critical] · raised by Sol

- **What it is:** The sprint requires three things: check the real MDBList response with a key, record real fixtures, and show that both probes turn real list URLs into enriched Titles. None of these has been done. The commit also reworded the MDBList task and ticked it off, and the doc still says `.dev.vars` isn't available, which is no longer true.
- **Why it matters:** The tests use fixtures built from assumed response shapes. Nobody has confirmed that real API responses (auth, field names, pagination) match what the code expects.
- **Where:** `docs/sprints/02_Domain_Sources_Trakt_MDBList_TMDB.md:18-28`, `test/fixtures/mdblist-items.json:1`
- **Related:** #6, where Claude raised the same gap at a lower severity. They may be the same concern, but they are kept separate for the owner to judge.
- **Suggested fix:** Run `pnpm probe:trakt` and `pnpm probe:mdblist` against real lists. Save cleaned-up responses as fixtures. Put back the original "verify with a key first" wording and mark the sprint pending until this passes.

### 2. The IMDb lookup path never fetches TMDB details, so taglines are lost [Critical] · raised by Sol

- **What it is:** When a Title has no TMDB id, `enrichTitle` looks it up by IMDb id with `/find` and stops there. It never calls `/movie/{id}` or `/tv/{id}`. The `/find` result has no tagline, so the blurb always falls back to the first sentence of the overview.
- **Why it matters:** The same film gets a different blurb depending on whether its source supplied a TMDB id. This breaks the rule "use the tagline, else the first sentence". The current test checks for this wrong behaviour.
- **Where:** `src/tmdb/enrich.ts:158-165`, `test/tmdb.test.ts:51-73`
- **Coverage note:** Claude's audit did not catch this. Sol confirmed it by running a reproduction.
- **Suggested fix:** Take the id from the `/find` result, then fetch details with it and apply the same enrichment as the direct-id path. Update the test to expect both requests and the tagline.

### 3. Large lists are silently cut off at 1000 items [Critical] · raised by Claude

- **What it is:** Both fetchers stop at 1000 items by default and return the result as if the list were complete.
- **Why it matters:** The spec says lists of 1000+ Titles must work with no size cap. A user importing a large list loses Titles and gets no warning.
- **Where:** `src/sources/trakt.ts:6`, `src/sources/mdblist.ts:6`
- **Suggested fix:** Remove the default cap and keep `maxItems` as an opt-in option. The alternative is to return a `truncated` flag and show it in the UI. Recommendation: remove the cap, since the spec is explicit.

### 4. MDBList's legacy pagination requests the first page again [Warning] · raised by Sol

- **What it is:** When there is no cursor, the client asks for `page=2`. MDBList's legacy API pages with `offset`, not `page`, so it sends page one again. The duplicate-page guard then stops the loop and the fetch reports success.
- **Why it matters:** Any response that uses the legacy "has more" mode quietly loses every Titles after the first page. The current cursor mode is unaffected.
- **Where:** `src/sources/mdblist.ts:133-137`, `src/sources/mdblist.ts:289-310`
- **Coverage note:** Sol checked this against the official MDBList schema and a reproduction. Claude listed the duplicate-page guard as a strength and did not see the problem.
- **Suggested fix:** Send `offset` in this mode, or throw a clear error for unsupported pagination. Add a test that requires a different second page.

### 5. Every TMDB request for a list is sent at once [Warning] · raised by Claude

- **What it is:** `enrichTitles` uses `Promise.all` over every Title, so a 1000-Title list sends 1000 TMDB requests at the same time.
- **Why it matters:** The plan says enrichment should run in chunks. Sending everything at once risks hitting Worker subrequest limits and TMDB rate limits.
- **Where:** `src/tmdb/enrich.ts:196-204`
- **Suggested fix:** Limit concurrency to about 8–10 requests at a time, or add a `chunkSize` option.

### 6. The "Done when" probe check isn't met [Warning] · raised by Claude

- **What it is:** The live probe acceptance hasn't happened, and the sprint doc says so itself. The current MDBList response shape is inferred, not observed.
- **Why it matters:** The sprint cannot be marked done on its own terms.
- **Where:** `docs/sprints/02_Domain_Sources_Trakt_MDBList_TMDB.md:23`
- **Related:** #1, the same gap, which Sol rated Critical.
- **Suggested fix:** Keep the sprint open until the probes pass with real credentials.

### 7. A wrong TMDB key fails silently [Warning] · raised by Claude

- **What it is:** `enrichTitle` catches every error, including 401 (bad key) and cancellation, and returns the Title without enrichment.
- **Why it matters:** With a bad key, every Title comes back with no poster or blurb and no error, so the cause is hard to find.
- **Where:** `src/tmdb/enrich.ts:190-192`
- **Suggested fix:** Rethrow on 401, 403 and abort. Only fall back quietly on 404, 5xx and network errors.

### 8. MDBList can read a long TMDB id as a year [Warning] · raised by Claude

- **What it is:** One helper parses both years and TMDB ids. If a TMDB id arrives as a string of 7 or more digits, it falls into the year branch and becomes something like `1234`.
- **Why it matters:** A wrong TMDB id fetches the wrong poster and blurb.
- **Where:** `src/sources/mdblist.ts:37-50`, `:91`
- **Suggested fix:** Split it into separate year and id parsers. Use the "first four digits" rule only for years.

### 9. MDBList series without a media type become movies [Warning] · raised by Claude

- **What it is:** When an item has no media type or an unknown one, it defaults to `'movie'`, even when it comes from the `shows` bucket.
- **Why it matters:** A misclassified series goes to the wrong TMDB endpoint and ends up in the wrong Nuvio catalog.
- **Where:** `src/sources/mdblist.ts:57-64`
- **Suggested fix:** Tag each item with the bucket it came from (`shows` → series) before normalising it.

### 10. Unused alias exports [Warning] · raised by Claude

- **What it is:** About 15 alternative names for the same functions are exported and never used (`mergeSource`, `makeUniqueSlug`, `fetchTraktList`, `getBlurb`, …).
- **Why it matters:** They clutter the API, and later sprints may use different names for the same thing.
- **Where:** `src/domain/*`, `src/sources/*`, `src/tmdb/enrich.ts`
- **Suggested fix:** Delete them and keep one name per function.

### 11. The sequence counter ignores Removed Titles [Suggestion] · raised by Claude

- **What it is:** `deriveNextSeq` works out the next `addedSeq` from active Titles only.
- **Why it matters:** If the stored `nextSeq` is ever stale, a new Title could get the same number as a Removed Title, and the two would tie in "order added" after a restore.
- **Where:** `src/domain/merge.ts:36-45`
- **Suggested fix:** Include `removed` when finding the highest `addedSeq`.

### 12. The stored source URL keeps query strings and fragments [Suggestion] · raised by Claude

- **What it is:** `detectSource` saves the full URL even though its doc comment says the query and fragment are ignored.
- **Why it matters:** `?sort=…` versions of the same list would be recorded as different Sources.
- **Where:** `src/sources/detect.ts:70`
- **Suggested fix:** Remove the query and fragment before storing the URL.

### 13. Items with no name are counted as "no IMDb id" [Suggestion] · raised by Claude

- **What it is:** Items that have an IMDb id but no name are added to `skippedNoImdb`.
- **Why it matters:** The skipped count shown to the user is slightly wrong.
- **Where:** `src/sources/trakt.ts:123-130`, `src/sources/mdblist.ts:107-114`
- **Suggested fix:** Count them separately, or rename the counter.

### 14. Parsing helpers are copied across three files [Suggestion] · raised by Claude

- **What it is:** `record`, `nonEmptyString`, `numberValue` and `imdbValue` are repeated in the Trakt, MDBList and TMDB modules, and the copies have already drifted apart.
- **Why it matters:** Bug fixes have to be made three times, and #8 comes from this drift.
- **Where:** `src/sources/trakt.ts`, `src/sources/mdblist.ts`, `src/tmdb/enrich.ts`
- **Related:** #8
- **Suggested fix:** Move them into one shared module.

### 15. Import extensions are inconsistent [Suggestion] · raised by Claude

- **What it is:** The domain files import without `.ts`, while the source, TMDB and test files import with it.
- **Why it matters:** Style drift, plus a risk for scripts run with `--experimental-strip-types`, which need the `.ts` extension.
- **Where:** `src/domain/*`
- **Suggested fix:** Standardise on `.ts`.

### 16. Test gaps [Suggestion] · raised by Claude

- **What it is:** No tests cover the Trakt `/lists/{id}` fetch, `maxItems` truncation, `mergeIntoList`, TMDB v4 bearer auth, the MDBList `shows` bucket without a media type, or `uniqueSlug` with a predicate.
- **Why it matters:** Several of the issues above (#3, #9) would have been caught by these tests.
- **Suggested fix:** Add a targeted test for each one alongside the related fixes.

---

**Tally:** 16 issues total (13 from Claude, 3 from Sol). 3 critical, 7 warnings, 6 suggestions.
**Overlaps to judge:** #1 ↔ #6 (the same live-acceptance gap, rated at different severities). #8 ↔ #14 (the drift causes the bug).
**Conflicts to resolve:** Claude's audit praised MDBList's pagination as defensive, and Sol's #4 shows the legacy path is broken. Sol's evidence is specific, so treat #4 as valid. There are no other conflicts. Both audits agree that tests (15/15) and `tsc` pass.

---

## Remediation note (2026-09-27, Claude)

Every code issue is fixed. The changes are **uncommitted** on `sprint-02` so you can review them first.
Checks after the fixes: `vitest` passes 31/31 (up from 15), `tsc --noEmit` and ESLint are clean, Prettier
passes on the changed files, and both probe scripts load and parse arguments under
`node --experimental-strip-types`.

| #   | Status                     | What changed                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Partly done. Needs you** | The sprint doc no longer overstates completion. The original "verify the real response shape with a key first" wording is back, the MDBList and recorded-fixtures tasks are unticked, the status is "in progress", and the stale "`.dev.vars` not available" note is corrected. The MDBList fixture's `name` now says it is constructed, not recorded. The live probes have **not** been run (see below). |
| 2   | Fixed                      | `enrichTitle` now takes the id from `/find` and then calls `/movie/{id}` or `/tv/{id}`, so taglines are kept. If the details request fails with a recoverable error (such as a 5xx), it falls back to the `/find` result. The test now expects both requests and the tagline.                                                                                                                             |
| 3   | Fixed                      | There is no default item cap. `maxItems` is opt-in on both fetchers. A test fetches a 1200-item list and another checks an explicit cap.                                                                                                                                                                                                                                                                  |
| 4   | Fixed                      | The legacy MDBList mode now pages with `offset`. If the API returns the same page twice, the fetch now **throws** instead of stopping quietly. Both cases have tests.                                                                                                                                                                                                                                     |
| 5   | Fixed                      | `enrichTitles` runs at most 8 requests at a time (`concurrency` option) and keeps the input order. A test checks the peak concurrency.                                                                                                                                                                                                                                                                    |
| 6   | Needs you                  | This is the same gap as #1.                                                                                                                                                                                                                                                                                                                                                                               |
| 7   | Fixed                      | 401 and 403 responses and cancellations are now raised as errors (`TmdbRequestError` carries `status`). Other failures still leave the Title unenriched. Tested.                                                                                                                                                                                                                                          |
| 8   | Fixed                      | Separate `positiveInt` (ids) and `yearValue` (years) parsers. A 7-digit string TMDB id is now kept whole. Tested.                                                                                                                                                                                                                                                                                         |
| 9   | Fixed                      | Items from the `shows` bucket with no media type are tagged as series. Tested.                                                                                                                                                                                                                                                                                                                            |
| 10  | Fixed                      | All unused alias exports are deleted.                                                                                                                                                                                                                                                                                                                                                                     |
| 11  | Fixed                      | `deriveNextSeq` now counts Removed Titles. Tested with a stale `nextSeq`.                                                                                                                                                                                                                                                                                                                                 |
| 12  | Fixed                      | `detectSource` drops the query string and fragment from `url`. Tested.                                                                                                                                                                                                                                                                                                                                    |
| 13  | Fixed                      | A new `skippedInvalid` counter (on the normalizers, the fetch results and the probe output) separates items with an IMDb id but no name from items with no IMDb id. `SourceRecord` is unchanged, so decide in Sprint 03 whether storage should keep it.                                                                                                                                                   |
| 14  | Fixed                      | The shared helpers are in `src/sources/parse.ts`, used by Trakt, MDBList and TMDB.                                                                                                                                                                                                                                                                                                                        |
| 15  | Fixed                      | Domain files now import with `.ts`.                                                                                                                                                                                                                                                                                                                                                                       |
| 16  | Fixed                      | Tests added for every listed gap (Trakt `/lists/{id}`, `maxItems`, `mergeIntoList`, v4 bearer auth, the `shows` bucket, `uniqueSlug` with a predicate), plus the fixes above.                                                                                                                                                                                                                             |

Also changed: the probe output now includes `skippedInvalid` and `enrichedCount`, a quick sign of whether
TMDB enrichment worked.

### What I need from you to close Sprint 02

1. **One or two real, public list URLs:** at least one Trakt list (`trakt.tv/users/{user}/lists/{slug}`)
   and one MDBList list (`mdblist.com/lists/{user}/{slug}`). A list with both movies and shows, and more
   than 100 items, would test pagination and type mapping best. `.dev.vars` already has
   `TRAKT_CLIENT_ID`, `MDBLIST_API_KEY` and `TMDB_API_KEY` (I checked only that the names exist, not the values).
2. **Run the probes, or let me run them.** Either run `pnpm probe:trakt <url>` and
   `pnpm probe:mdblist <url>` yourself, or tell me to and I'll run them with your keys. Check that
   `titleCount` matches the list, `enrichedCount` is close to `titleCount`, and shows come out as `series`.
3. **Record real fixtures.** After a successful run I'll save cleaned-up Trakt, MDBList and TMDB responses
   (no keys) as fixtures, replace the constructed MDBList fixture, and adjust the parser if the real
   response differs from the assumed shape. This closes the "verify the real response shape" and
   "recorded fixtures" tasks.
4. **Review and commit** these changes, or ask me to commit them. Then tick the remaining boxes and
   set Sprint 02 to complete in `docs/sprints/`.
5. **Optional decision:** should `SourceRecord` also store `skippedInvalid` (#13)? It can wait until Sprint 03 storage.
