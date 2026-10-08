# Import a Listio collection into Nuvio

1. Save the Titles in each Combined List. Empty lists cannot be exported.
2. On Listio's home page, choose **Export collection**, tick the lists, enter a
   collection name, and use **Up** / **Down** to choose the folder order. The
   **Export these as a Nuvio collection** link on text import results starts with
   the successfully saved lists ticked in file order. For new lists, choose
   **+ New collection** on Home, enter a title and paste a sectioned file on
   `/import`. Once the queue finishes, download directly from the modal; its
   folders follow file order and exclude skipped lists. The export link carries
   the collection title and lets you reorder folders or export partial results.
3. Download the JSON. It contains addon IDs and Catalog IDs, without the private
   addon URL. Install the Listio addon in Nuvio if necessary. For new lists or new
   movie/series Catalog types, refresh or reinstall it so the manifest is current.
4. In Nuvio TV, open **Settings → Content Discovery → Collections**, choose
   **Import**, and select the file import option. Load the downloaded JSON and
   confirm the preview. The remote management Collections screen also exposes
   import; use the screen linked from your own Nuvio installation. Labels and
   file transfer options can vary by client/version. If file transfer is awkward,
   the TV importer also supports pasting the JSON.
5. Check that there is one folder per chosen list, in order, and open each folder
   to confirm its movie and/or series Catalogs. Saved Title changes may take a
   minute to appear because addon responses are cached and KV propagates.

Listio leaves `genre` out of collection sources so Nuvio does not append the
redundant `All` label. Re-export and re-import an existing Listio collection to
update its sources; use the same collection name to replace the existing one.

Listio uses stable collection IDs derived from the configured addon ID and the
trimmed collection name (ignoring case). The verified TV importer replaces an existing
collection with the same ID and appends a different ID; it does not match by
name. Re-exporting the same name therefore updates that Listio collection,
including its folder choices/order. A different name or addon ID creates a
different collection. Back up collections before importing when using another
client whose import behavior has not been checked. Folder IDs follow the
collection ID and Combined List IDs, so renaming a list does not change its
folder identity.

## Format evidence and acceptance

Checked on 5 October 2026 against NuvioMedia/NuvioTV commit
`4a91028b3e7ef44187ec25d598930da92b07c017`:

- [CollectionsDataStore](https://github.com/NuvioMedia/NuvioTV/blob/4a91028b3e7ef44187ec25d598930da92b07c017/app/src/main/java/com/nuvio/tv/data/local/CollectionsDataStore.kt):
  `exportToJson` emits an array; `validateCollectionsJson` requires IDs, titles,
  folders and source arrays. `toDomain` supports `catalogSources` when `sources`
  is absent and preserves folder order. This legacy form matches the API brief.
- [CollectionManagementViewModel](https://github.com/NuvioMedia/NuvioTV/blob/4a91028b3e7ef44187ec25d598930da92b07c017/app/src/main/java/com/nuvio/tv/ui/screens/collection/CollectionManagementViewModel.kt):
  `confirmImport` replaces by ID and appends new IDs; import supports file, paste
  and URL modes.
- [Collections feature](https://github.com/NuvioMedia/NuvioTV/issues/1000):
  the documented entry point is Settings → Content Discovery → Collections.

Exports explicitly use `TABBED_GRID`, `showAllTab: true`, `pinToTop: false`,
`POSTER` tiles, `hideTitle: false`, and no artwork. The importer supports these
values. The tile choice follows the sprint's proposed default; Nuvio's own model
defaults to square tiles.

[collection-reference.json](./collection-reference.json) is a hand-authored
reference fixture derived from that schema. It is **not** a Nuvio-exported owner
sample. No owner sample was supplied and no live Nuvio device import was performed.
To finish acceptance, export a sanitized two-folder movie/series collection from
the target Nuvio client as `docs/nuvio/collection-sample.json`, compare its shape,
then exercise steps 1–5 and repeat import after reordering/renaming. Record the
client/version and whether existing-ID replacement and folder order match.
