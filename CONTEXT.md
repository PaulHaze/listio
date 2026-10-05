# Listio

A personal tool for building curated movie/TV lists, by merging public lists and by adding Titles by hand, published as catalogs for Nuvio.

## Language

**Source**:
A public list of movies/shows on another site (Trakt, MDBList or IMDb), identified by its URL. A Source is read once, when it is added to a Combined List; it is never re-fetched.
_Avoid_: input list, list, feed

**Combined List**:
A named, curated, static set of Titles, built by adding Sources, adding individual Titles found by search, and removing unwanted Titles. It may have no Sources at all (a hand-built list). It does not stay in sync with its Sources.
_Avoid_: project, merged list, collection, manual list, custom list

**Collection**:
A Nuvio collection with one folder per Combined List, downloaded as JSON. Listio stores the lists individually and does not store the collection.

**Title**:
A single movie or show, identified by its IMDb ID.
_Avoid_: item, entry, film

**Removed Title**:
A Title the user has excluded from a Combined List; it is skipped when further Sources are added, until the user restores it. Adding it again by search restores it.
_Avoid_: deleted item, blocked title

**Draft**:
Unsaved changes to a Combined List (added Sources, Titles added by search, removals, restores). Nothing in a Draft reaches Nuvio until it is saved.
_Avoid_: pending changes, working copy

**Catalog**:
How a Combined List appears inside Nuvio. A Catalog holds a single type (movie or series), so a Combined List containing both appears as two Catalogs.
_Avoid_: feed, list
