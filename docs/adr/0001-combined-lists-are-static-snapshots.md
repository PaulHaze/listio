# Combined Lists are static snapshots, not synced to their Sources

A Source is fetched once when it is added to a Combined List; there is no re-fetch or scheduled sync. The point of the tool is to strip other people's lists down to what the user actually wants, so a curated list silently changing when a Source owner edits theirs is undesirable. Removed Titles are still remembered per Combined List so that adding a further Source later cannot bring them back.

## Considered Options

- Manual "refresh sources" (original spec) — rejected: adds re-merge logic for no benefit to a curate-once workflow.
- Scheduled daily sync — rejected: new, uncurated Titles would reach Nuvio without review.
