# Sprint 06 — GUI: Review grid

**Status:** implemented — pending browser and Nuvio acceptance

## Goal

The curation screen: scan a large grid quickly, cut what isn't wanted, save deliberately.

## Tasks

- [x] Card: poster, `Title (Year)`, one-line blurb; nothing else
- [x] Trash icon → removed from view instantly, into the Draft, no confirmation
- [x] Checkbox per card; single floating **Remove selected (N)** fixed bottom-right, shown when any ticked
- [x] **Save** button beside it once the Draft has ≥1 change → confirmation dialog ("Save 7 changes to Spy Thrillers?") → save
- [x] **Show only new** filter
- [x] Sort selector (newest default / oldest / A–Z / order added), saved per list
- [x] **Removed (N)** view with restore (restore goes into the Draft)
- [x] Progressive rendering for 1,000+ Titles; lazy-loaded posters
- [x] `beforeunload` warning with unsaved changes
- [x] 409 conflict → clear message to reload

## Done when

- A 1,000-Title list scrolls smoothly and can be trimmed with trash and bulk remove
- Nothing changes in Nuvio until Save is confirmed; then it does (within ~1 min)
- Removed Titles stay out when another Source is added later; restore brings one back

## Implementation and verification

- `draft.ts` gains `removeTitles`, `restoreTitles` and `countChanges`. The change count is
  now derived from the saved list instead of tallied: each added Source, each Title whose
  active/Removed state differs from saved, and a sort change count once. Removing then
  restoring a Title (or switching sort back) is therefore not a change. The `changes`
  field on `Draft` is gone.
- Removing a Title added in this Draft puts it in Removed. It is saved as Removed, so the
  same Source added later still skips it. Restore keeps `addedSeq`, so the Title goes back
  to its original position. Enrichment that finishes after a Title is removed still
  updates its Removed copy.
- Review grid: view buttons **All / Show only new / Removed (N)**, a sort selector (saved
  with the list, as in Sprint 05), and cards with a checkbox, inline-SVG trash button,
  `Title (Year)` and a one-line blurb. In the Removed view each card shows **Restore**.
  The grid opens automatically when the saved list already has Titles.
- Floating bar, fixed bottom-right: **Remove selected (N)** while any card is ticked,
  and **Save** while the Draft has changes. Save uses the native confirm dialog
  ("Save 7 changes to Spy Thrillers?", singular for 1). Changing views clears the
  selection.
- Progressive rendering: 60 cards per batch, loaded by an IntersectionObserver sentinel
  with a 1,200px margin. The count resets when the view or sort changes. Posters use
  `loading="lazy"` and `decoding="async"`.
- `beforeunload` is unchanged from Sprint 05; it now uses the derived change count.
- A 409 on Save shows a persistent message with a **Reload** button and disables Save.
- Automated verification: `pnpm test` (69 tests), `pnpm lint:check` and `pnpm build`
  pass. The new test covers remove/restore order, net change counting, removed new
  Titles staying out on a later Source, and late enrichment of Removed Titles.

## Pending acceptance

These checks were **not** performed:

- Browser check: a 1,000-Title list scrolls smoothly; trash, bulk remove, restore,
  Show only new, sort, the 409 message and the unsaved-changes warning all work.
- Nuvio shows the result within about a minute of a confirmed Save, and nothing changes
  before that.
