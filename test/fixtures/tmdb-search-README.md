# TMDB title discovery recordings

The `tmdb-search-*.json` files were recorded from TMDB on 2026-10-03:

- `multi`: `/search/multi`, query `Being John Malkovich`, adult results disabled.
- `movie`: `/search/movie`, the same query and year `1999`.
- `same-name`: `/search/movie`, query `Crash`, no year.
- `tv`: `/search/tv`, query `Severance`, no year.
- `lookup`: `/movie/492`, with `append_to_response=external_ids`.

Credentials and request URLs are excluded. Tests use these recordings for real
normalization and confidence cases. Missing IMDb and missing display metadata
cases are explicitly derived in the tests by removing fields from recordings.
