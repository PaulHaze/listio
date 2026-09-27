# Sprint 04 — GUI: Home & Combined List management

**Status:** not started

## Goal

A home page to create, rename, open and delete Combined Lists.

## Tasks

- [ ] Base layout + plain CSS styling
- [ ] `pages/index.astro` — lists from `index` (name, Title count), each links to its editor
- [ ] `+ New list` → name → `POST /api/lists` → open editor
- [ ] Rename (`PATCH /api/lists/{id}`) — display name only, id never changes
- [ ] Delete (`DELETE /api/lists/{id}`) with confirmation
- [ ] Notice after create / rename / delete: "Refresh the Listio addon in Nuvio to see this change"
- [ ] `GET /api/lists/{id}` for the editor to load
- [ ] Stub editor page `pages/lists/[id].astro`

## Done when

- Lists can be created, renamed and deleted from the browser, and the addon manifest reflects it
- Creating a duplicate name yields `-2` id
