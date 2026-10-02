# Hand-built lists are ordinary Combined Lists

Listio lets the user build a list by hand: search TMDB for a Title and add it. A hand-built list is not a separate kind of list. It is a Combined List that may have no Sources, and a searched Title goes into the Draft exactly like a Title from a Source, keyed by IMDb ID and published only on Save. One data model, one editor, one save path and one addon mean Sources and searched Titles can be mixed in the same list, and Nuvio sees no difference. An explicit add of a Removed Title restores it, because the user is overriding their own removal. Adding a Source still never brings a Removed Title back.

## Considered Options

- Separate "manual list" model with immediate per-item writes (from an earlier handoff doc: its own `List`/`ListItem` KV shape, `POST …/items` saving straight to KV, a `KV.list()` index, and token auth). Rejected: it duplicates storage, addon and editor code, skips the Draft/Save rule, and spends a KV write per click against the 1,000 writes/day limit.
- Drag-to-reorder for hand-built lists. Deferred: the "order added" sort covers the main need, and a manual order would add a fifth sort mode and reorder state to the review grid.
