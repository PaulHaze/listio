# Audit Summary: sprint-07 — GUI: Editor — search & add Titles

Combined findings of Astra and Opus audits:

Commit audited by both: `0960526` — feat(editor): search and paste Titles into Combined List drafts.
Sources: [`sprint-07-audit-astra.md`](./sprint-07-audit-astra.md) (verdict **FAIL**) and [`sprint-07-audit-opus.md`](./sprint-07-audit-opus.md).

## Issues

### 1. Pasted names in non-Latin scripts become blank, so a different Title can be added automatically [Critical] · raised by Astra

- **What it is:** To decide whether a pasted line confidently matches a TMDB result, both names are "normalized": lower-cased and stripped of punctuation. The stripping rule (`/[^a-z0-9]+/g`) keeps only the English letters a–z and digits. It deletes every letter in Japanese, Chinese, Cyrillic, Arabic and other scripts, so `東京` (Tokyo) and `大阪` (Osaka) both become an empty string and count as "the same name".
- **Evidence (Astra):** A read-only Node probe called the real `normalizedName` and `matchTitle` functions. `normalizedName('東京')` and `normalizedName('大阪')` both returned `''`. Given a controlled movie-search response containing a single `大阪` (2020) candidate and a valid details response, `matchTitle('東京', 2020, …)` returned `status: 'matched'` with the `大阪` Title. It made a movie search and a details lookup, and skipped the TV fallback. These were controlled responses, not a claim that live TMDB returns that exact result today. A broader search hit with a different non-Latin name takes the same path, and mixed-script names can also collapse when only a shared ASCII suffix is left.
- **Why it matters:** The wrong Title is added to the Draft without appearing in Need a look. If you save, it's published to Nuvio. The task's confidence rule (exactly one result whose normalized name equals the line's name, with the given year) is no longer enforced for these names.
- **Where:** `src/tmdb/match.ts:11-18`, `src/tmdb/match.ts:36-38`, `src/tmdb/match.ts:59-65`. It's auto-added at `src/components/editor/TitleDiscovery.tsx:119-122`.
- **Related:** #7 (Opus raised the same defect at Warning severity). It may be the same problem; kept separate for the owner to judge.
- **Suggested fix:** Keep Unicode letters and numbers while still normalizing punctuation and case, and never treat an empty normalized name as grounds for a confident match. Add test cases for equal and unequal non-Latin names, mixed-script names and punctuation-only input, asserting that a different Title is never looked up and auto-added.
  _Extra (Opus):_ concretely, use `/[^\p{L}\p{N}]+/gu`, and return `ambiguous` when the normalized name is empty.

  **ACTION** This is a tool for me, and I can't imagine a time when I will be searching for a specific non-unicode title (like one that is only in mandarin or japanese). This is a bit of a non-issue for my use so just make sure it works with the usual western alphabet and we can worry about this if we ever make a public version

### 2. Repeating a paste loses the choices you made in Need a look [Critical] · raised by Astra

- **What it is:** When a pasted line is ambiguous (e.g. `Crash` with no year) and you pick one candidate in Need a look, the app only records "this row is done". It doesn't record which Title you picked. Pressing **Find titles** again with the same text clears the review list, re-sends every line, and puts every ambiguous result back into Need a look.
- **Evidence (Astra):** Used the committed `tmdb-search-same-name.json` recording, where the real matcher returns `ambiguous` for `Crash`, including Crash (1996). The component's real state logic ran in an in-memory hook harness: paste `Crash`, choose Crash (1996), and the summary reads `1 added · 0 already in list · 0 need a look`. Paste again and it reads `0 added · 0 already in list · 1 need a look`. The chosen candidate now shows `✓ Added` with `disabled: true` (after Save it would be a disabled **In list**), so its Add button can't even count it as a duplicate. This was controlled API responses in a harness, not a full browser session.
- **Why it matters:** It fails the Done-when criterion "Pasting the same lines again adds nothing new (all 'already in list')". You have to re-review lines you already resolved on every repeat paste, and the summary is wrong. Lines you fixed through the No-match search box lose their decision in the same way. IMDb de-duplication still stops a second copy being stored.
- **Where:** `src/components/editor/TitleDiscovery.tsx:77-89`, `:119-128`, `:149-160`, `:431-432`.
- **Related:** #4 (Opus raised the same defect as its Critical). It may be the same problem; kept separate for the owner to judge.
- **Suggested fix:** Remember each pasted line's explicit resolution and reuse it against the current Draft. Count still-active resolved Titles as duplicates, and send removed ones through `addTitle` to restore them. Reconcile existing candidates without needing a disabled Add button. Add a component-level regression test: resolve an ambiguity, then repeat the paste, including a No-match line resolved through its search box. Ordinary search results that are already in the list should stay disabled.

**ACTION** Do the suggested fix

### 3. Search shows "Add" for Titles already in the list when they have no TMDB ID [Critical] · raised by Astra

- **What it is:** To label a search result **In list** or **Restore**, the code compares its TMDB ID and type with the Draft's Titles, or compares against an IMDb ID it only learns after you click Add. A Source Title can validly have no TMDB ID: the type, `isTitle` and the enrichment fallback all allow `tmdbId: null` when enrichment fails. Those Titles never match.
- **Evidence (Astra):** An in-memory render of the real `Candidates` component, with an existing Crash Title (`imdbId: 'tt0115964', tmdbId: null`) and the recorded Crash (1996) result, produced an enabled **Add** button. Moving that Title to Removed failed the same comparison, so **Restore** wasn't shown either.
- **Why it matters:** It breaks the task requirement "Searching a Title already in the list shows **In list**" and the Restore label for Removed Titles. ADR 0005 makes the IMDb ID the shared identity. You have to do a pointless lookup before the label corrects itself, and if that lookup fails upstream, the wrong label stays. `addTitle` still prevents a duplicate being stored.
- **Where:** `src/components/editor/TitleDiscovery.tsx:352`, `:367-374`, `:395-406`. Background: `src/domain/types.ts`, `src/api/validate.ts` (`isTitle`), `src/tmdb/enrich.ts:202-227`.
- **Related:** #6 (Opus raised the same defect at Warning severity). It may be the same problem; kept separate for the owner to judge.
- **Suggested fix:** Before deciding a result's In list / Restore status, resolve and cache the TMDB → IMDb identity it needs, or fill in the missing IDs of the relevant Draft Titles through a bounded lookup. Keep IMDb as the authoritative identity and never guess by name. Test both active and Removed Titles with missing TMDB IDs, including the first search result before any Add click.
**ACTION** Do the suggested fix

### 4. Repeating a paste puts every resolved ambiguous line back into Need a look [Critical] · raised by Opus

- **What it is:** `find()` clears the review list and re-sends every line. Ambiguous and no-match results go straight back into the unresolved list, because `resolve()` only stores `resolved: true`, not the chosen Title. The chosen candidate's button is now disabled ("✓ Added" / "In list"), so the row can only be skipped.
- **Why it matters:** It fails the Done-when line "Pasting the same lines again adds nothing new (all 'already in list')". With the Modern Head Trips run (49 matched automatically, 15 reviewed), a second paste would report "0 added · 49 already in list · 15 need a look".
- **Where:** `src/components/editor/TitleDiscovery.tsx:77`, `:121`, `:148-161`.
- **Related:** #2 (Astra raised the same defect). It may be the same problem; kept separate for the owner to judge.
- **Suggested fix:** When a line comes back ambiguous, check whether any of its candidates is already in the Draft, by TMDB ID + type, or by IMDb ID once #6 is fixed. If it's active, count it as "already in list"; if it's removed, restore it through `add`; don't queue it either way. Optionally remember `line → imdbId` choices for no-match lines resolved through search.
**ACTION** Do the suggested fix

### 5. Titles added by search or paste get small posters, unlike Source Titles [Warning] · raised by Opus

- **What it is:** When you add a Title by search or paste, the poster URL is built by `normalizeResults`, which hard-codes TMDB's 185px-wide size (`w185`). Commit `ab1d8ef` moved Source enrichment to the 342px size (`w342`) for the 4-column grid. Hand-added Titles are never enriched afterwards, so they keep the small poster for good.
- **Why it matters:** Hand-added Titles look blurry next to Source Titles in the review grid and in Nuvio. The spec's `w185` is right for the small search-result grid, but not for the Title that gets stored.
- **Where:** `src/tmdb/lookup.ts:30`, `src/tmdb/search.ts:46`. Compare `TMDB_IMAGE_URL` in `src/tmdb/enrich.ts:11`.
- **Coverage note:** Astra's task-coverage table marks "w185 poster" as Satisfied for the search normalizer. That's correct for search results; Astra didn't assess the poster size of the stored Title. This isn't a conflict.
- **Suggested fix:** In `lookupTitle`, set `poster` using `posterFromTmdb(details, TMDB_IMAGE_URL)`, exporting both from `enrich.ts`. Make `normalizeResults` use a shared constant instead of a literal URL.
**ACTION** Do the suggested fix. 

### 6. Search shows Add and hides Restore for existing Titles without a TMDB ID [Warning] · raised by Opus

- **What it is:** `same()` matches on TMDB ID + type, or on an IMDb ID learned only after clicking Add. A Source Title whose enrichment failed keeps `tmdbId: null`, so searching for it shows an enabled **Add** instead of **In list**, and a removed one shows **Add** instead of **Restore**.
- **Why it matters:** It's a wrong label, not data loss, because `addTitle` still blocks duplicates. In practice it mostly affects lists where enrichment partly failed.
- **Where:** `src/components/editor/TitleDiscovery.tsx:394-405`.
- **Related:** #3 (Astra raised the same defect at Critical severity). It may be the same problem; kept separate for the owner to judge.
- **Suggested fix:** The simplest option is a one-off lookup that fills in missing TMDB IDs. Alternatively, have `/api/search` return the IMDb ID for results. That costs extra TMDB calls, so restrict it to results whose TMDB ID isn't already known in the Draft.
**ACTION** Do suggested fix

### 7. Non-Latin names normalize to nothing, so different non-Latin titles compare equal [Warning] · raised by Opus

- **What it is:** `/[^a-z0-9]+/g` turns `東京` and `大阪` into an empty string. A pasted non-Latin line whose search returns a single non-Latin-titled result is treated as a confident match and added automatically. TMDB returns the original title when there's no English one.
- **Why it matters:** The wrong Title is auto-added. Opus rated this rare for this user's lists, hence Warning.
- **Where:** `src/tmdb/match.ts:11-18`.
- **Related:** #1 (Astra raised the same defect at Critical severity). It may be the same problem; kept separate for the owner to judge.
- **Suggested fix:** Use `/[^\p{L}\p{N}]+/gu`, and never treat an empty normalized name as a match (return `ambiguous` instead).
**ACTION** I think this has been dealt with above

### 8. One failed TMDB call fails a whole 20-line batch and stops the entire paste [Warning] · raised by Opus

- **What it is:** `fetchJson` throws on any error response, for example TMDB's 429 "too many requests" or a 5xx server error on one search. The match route only catches errors for the batch as a whole, so it returns a 502 for all 20 lines. The browser then abandons every remaining batch.
- **Why it matters:** A 64-line paste can stop at 20/64 because of one temporary error on one line. Re-running is safe, but because of #2/#4 it puts the already-reviewed lines back into Need a look.
- **Where:** `src/pages/api/titles/match.ts:40-52`, `src/components/editor/TitleDiscovery.tsx:130-140`.
- **Related:** #2, #4 (a re-run after this failure runs into that defect).
- **Suggested fix:** Wrap each `matchTitle` call in its own try/catch and return `{ status: 'none', reason: 'TMDB lookup failed — try again' }` for that line. Still rethrow 401/403 (bad API key) so a misconfiguration fails immediately.
**ACTION** the fix sounds good. Does this solution store the lines that failed in the call and batch try them again at the end?

  **Resolved:** The audit's fix on its own didn't retry. It now does: the route marks a failed line `retry: true`, and the editor collects those lines and re-sends them once, in batches, after the full paste has run ("Retrying n / m…"). If a line still fails, it goes to Need a look as "TMDB lookup failed — try again". A bad API key (401/403) still stops the whole paste.

### 9. The exact-year rule sends many correct matches to review [Suggestion] · raised by Opus

- **What it is:** `/search/movie?year=` matches a release in any country in that year, but the confidence check compares against the main (primary) release date. The sprint notes say most of the 15 lines sent to review were "TMDB release-year differences".
- **Why it matters:** More manual review than needed.
- **Where:** `src/tmdb/match.ts:36-44`.
- **Suggested fix:** Accept a ±1 year difference when there's exactly one name match. This relaxes the spec's "year equals" rule, so it's the owner's decision.
**ACTION** Sounds good. Even expand it by 2 years. I think most mismatches by year should come from something like a remake of Oceans 11 from the 60's to the modern time.

### 10. Restored Titles are flagged as "new" [Suggestion] · raised by Opus

- **What it is:** `addTitle` adds a restored Title to `newIds`, so it shows under **Show only new** and its search button reads "✓ Added". The review grid's own Restore (`restoreTitles`) doesn't do this.
- **Why it matters:** The same action behaves differently depending on where you do it.
- **Where:** `src/domain/merge.ts:146`, compared with `src/components/editor/draft.ts:70`.
- **Suggested fix:** Pick one behaviour. Leaving restores out of `newIds` matches the existing grid.
**ACTION** Add title should be treated as added new. Although I am a little unsure of the exact issue that is the problem here. Perhaps you could explain it in a bit more detail?

  **Resolved (no code change):** A Removed Title can be brought back in two ways. (a) The review grid's **Restore** button puts it back without a "new" flag. (b) Searching or pasting it and pressing **Restore** goes through `addTitle`, which also flags it as new, so it appears under **Show only new** and its button reads "✓ Added". The audit only pointed out that these two paths behave differently. Per this ACTION, restores made from search or paste stay flagged as new; the grid's Restore is unchanged.

### 11. Duplicated request helper with a confusing error on non-JSON responses [Suggestion] · raised by Opus

- **What it is:** `TitleDiscovery.tsx` re-implements the `ApiError`/`api` helper from `Editor.tsx`. Both call `response.json()` before checking the status, so an HTML error page shows up as "Unexpected token <". That could be a Cloudflare 502, or later the Cloudflare Access login redirect.
- **Where:** `src/components/editor/TitleDiscovery.tsx:8-43`, `src/components/editor/Editor.tsx:38-60`.
- **Suggested fix:** Move one copy into `src/components/editor/api.ts`, and parse with `.json().catch(() => null)`.
**ACTION** Do suggested fix

### 12. CSS uses an undefined variable and hard-coded grey [Suggestion] · raised by Opus

- **What it is:** `.discovery-panels textarea` uses `var(--color-border, #888)`, but `--color-border` isn't defined anywhere. `.match-review` hard-codes `#888`.
- **Why it matters:** These borders don't follow the theme in dark mode, unlike the rest of the UI.
- **Where:** `src/styles/main.css` (`.discovery-panels textarea`, `.match-review`).
- **Suggested fix:** Use `var(--background-300)`, like the other borders.
**ACTION** Do the suggested fix. WE will tackle all the styling from top to bottom at the end of the build

### 13. Small gaps in name normalization [Suggestion] · raised by Opus

- **What it is:** `&` vs "and" (e.g. *Fear & Loathing…*) and a leading "An" aren't normalized, so those lines go to review.
- **Where:** `src/tmdb/match.ts:11-18`.
- **Related:** #1, #7 (same function).
- **Suggested fix:** Add `.replace(/&/g, ' and ')` before stripping, and change the article rule to `(?:the|an?)`.
**ACTION** Would this cause an issue if the actual title DOES have '&'. Is it worth just removing the ampersand and searching for the key words so 'Fear & Loathing IN LAs Vegas' just becomes 'Fear Loathing IN LAs Vegas' which will get a hit. Just like 'Master & Commander Far side of the world' becomes 'Master Commander...' etc

  **Resolved:** Done roughly as suggested. Normalization is only used to compare the pasted line with TMDB's names, never as the search query, so a real `&` in a title is fine. Both `&` and the word "and" are now dropped on both sides, so `Fear & Loathing…`, `Fear and Loathing…` and `Master & Commander…` all compare equal to TMDB's spelling. A leading "An" is now ignored too, like "The" and "A".
---

**Tally:** 13 issues in total (3 from Astra, 10 from Opus): 4 critical, 4 warnings, 5 suggestions.
**Overlaps to judge:** #1 ↔ #7 (non-Latin normalization), #2 ↔ #4 (repeat paste loses resolutions), #3 ↔ #6 (missing TMDB ID breaks the In list / Restore labels). Each pair is probably the same underlying defect.
**Conflicts to resolve:** none on the facts. The auditors disagree on **severity**: Astra rates #1 and #3 Critical, and Opus rates the same defects (#7, #6) Warning. Astra classes any unmet mandatory requirement as Critical; Opus weighed how rarely each case occurs. Both rate the repeat-paste defect Critical.

## Auditor notes

**Astra: verdict and summary.** **FAIL.** The commit implements TMDB search and lookup, explicit Draft additions and restores, pasted-line parsing and matching, batched matching with lookup continuations, and editor search/review controls. It correctly reuses the existing Save, storage and addon paths for zero-Source lists. Three reproducible defects (#1–#3) leave mandatory behaviour incomplete. Astra notes that calling them Critical reflects unmet requirements, not security issues. The sprint-doc edits keep the original tasks and Done-when criteria. The `lookup` continuation is a documented implementation adjustment with a client consumer and a test, not a weakening of acceptance criteria. Sprint 07 shouldn't be considered complete until these defects are fixed and deployed/Nuvio acceptance is verified.

**Astra: task coverage.** Every requirement is Satisfied except these:
- **Partially satisfied:**
  - the Add / ✓ Added / In list / Restore statuses (#3)
  - conservative confidence matching (#1)
  - Need a look for existing candidates and repeated resolution (#2)
  - repeated paste adds nothing (#2)
- **Unable to verify:**
  - the Modern Head Trips live matching. All 64 lines and the code paths were reviewed, but the implementer's 49/15 result wasn't replayed.
  - the saved list appearing in Nuvio with both Catalogs in one collection folder. The server emits the same list ID and name for both types, but this needs deployed acceptance.
- The excluded work (drag-to-reorder, Cinemeta fallback, multi-list importer) wasn't introduced.

**Astra: validation run.**
- Passed:
  - Vitest: 10 files, 81 tests
  - `tsc --noEmit`
  - standalone ESLint
- Read-only Node probes reproduced #1 (real matcher functions plus committed fixtures) and #2/#3 (component source transpiled in memory, with hooks simulated against controlled API responses). The harness checks state transitions, not browser layout or React scheduling.
- Not run: `pnpm check`/`pnpm build` (they generate files), full `pnpm lint:check`, live TMDB, deployed Workers, Nuvio.
- Git status was clean afterwards.

**Astra: residual risks.**
- Workers runtime behaviour and Nuvio grouping are still acceptance work.
- Modern Head Trips matching depends on current TMDB data.
- There are no committed interaction tests for the new discovery UI. Accessibility, layout, abort timing and concurrent interactions are unverified.

**Opus: coverage note.** Opus read the source and reasoned about it. It didn't run probes, tests or the app, so Astra's executed reproductions carry extra weight for #1–#3.

**Opus: positive observations.**
- The match endpoint's request budget is sound. It reserves two searches per remaining line and caps a batch at 48 outside calls, and the typed `lookup` continuation keeps automatic matching under the subrequest limit. It's tested.
- `addTitle` reuses the merge helpers, keeps `addedSeq` monotonic, restores to the original position and lower-cases IDs consistently. A later Source can't duplicate a searched Title.
- The TMDB key never reaches the browser, and all three routes validate input and sanitise upstream errors.
- `busy(±1)` correctly blocks Save while lookups are in flight, and each component aborts its requests on unmount.
- The recorded fixtures cover person filtering, tv → series, missing poster/date, no IMDb ID, same-name films and the TV fallback.
