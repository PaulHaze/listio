# Sprint 04 — GUI: Home & Combined List management

**Status:** done

## Goal

A home page to create, rename, open and delete Combined Lists.

## Tasks

- [x] Base layout + plain CSS styling
- [x] `pages/index.astro` — lists from `index` (name, Title count), each links to its editor
- [x] `+ New list` → name → `POST /api/lists` → open editor
- [x] Rename (`PATCH /api/lists/{id}`) — display name only, id never changes
- [x] Delete (`DELETE /api/lists/{id}`) with confirmation
- [x] Notice after create / rename / delete: "Refresh the Listio addon in Nuvio to see this change"
- [x] `GET /api/lists/{id}` for the editor to load
- [x] Stub editor page `pages/lists/[id].astro`

## Done when

- [x] Lists can be created, renamed and deleted from the browser (checked on the deployed `workers.dev` build)
- [x] Creating a duplicate name yields `-2` id (checked on the deployed build)
- [ ] The addon manifest reflects create / rename / delete in Nuvio — **deferred to Sprint 05**

## Deferred

- **Nuvio CRUD acceptance.** Empty lists advertise no Catalog, and the GUI can't add Titles until Sprint 05, so the deployed Nuvio check was not run. Manifest updates on rename and delete are covered by `test/list-routes.test.ts`. All CRUD features (create, rename, delete, and saving Titles) will be checked robustly end to end in Nuvio once they are integrated into the GUI.
