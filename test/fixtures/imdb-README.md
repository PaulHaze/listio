# IMDb fixtures

`imdb-live.json` contains the `data` section of a public GraphQL response captured
on 4 October 2026 (Australia/Sydney) for `https://www.imdb.com/list/ls004285275/`.
The query is `IMDB_QUERY` in `src/sources/imdb.ts`, with `first: 250` and
`after: null`. All 125 Titles fit in this page. Credentials and upstream
extensions are excluded. It verifies the current `edges[].title` shape.

`imdb-page-1.json` and `imdb-page-2.json` are synthetic pagination fixtures with
movie, series, mini series, short, missing-ID, missing-name, and episode cases.
`imdb-export.csv` represents the same ordered records in the IMDb export schema
(`Const`, `Title`, `Year`, `Title Type`, plus extra columns). It includes a UTF-8
BOM, CRLF records, quoted commas, escaped quotes, and an embedded newline. It
was generated for tests, not downloaded while logged in to IMDb.

The GraphQL and CSV normalization must produce identical Titles and skip counts.
The real response was additionally verified through the deployed Cloudflare
Source endpoint; CSV upload, review, enrichment, and persistence were exercised
in a temporary Combined List through the deployed editor.
