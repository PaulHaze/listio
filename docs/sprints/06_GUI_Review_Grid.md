# Sprint 06 — GUI: Review grid

**Status:** not started

## Goal

The curation screen: scan a large grid quickly, cut what isn't wanted, save deliberately.

## Tasks

- [ ] Card: poster, `Title (Year)`, one-line blurb; nothing else
- [ ] Trash icon → removed from view instantly, into the Draft, no confirmation
- [ ] Checkbox per card; single floating **Remove selected (N)** fixed bottom-right, shown when any ticked
- [ ] **Save** button beside it once the Draft has ≥1 change → confirmation dialog ("Save 7 changes to Spy Thrillers?") → save
- [ ] **Show only new** filter
- [ ] Sort selector (newest default / oldest / A–Z / order added), saved per list
- [ ] **Removed (N)** view with restore (restore goes into the Draft)
- [ ] Progressive rendering for 1,000+ Titles; lazy-loaded posters
- [ ] `beforeunload` warning with unsaved changes
- [ ] 409 conflict → clear message to reload

## Done when

- A 1,000-Title list scrolls smoothly and can be trimmed with trash and bulk remove
- Nothing changes in Nuvio until Save is confirmed; then it does (within ~1 min)
- Removed Titles stay out when another Source is added later; restore brings one back
