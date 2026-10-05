/** The two media types that Listio publishes to Nuvio. */
export type TitleType = 'movie' | 'series';

/** The sort modes supported by a Combined List and its addon catalogs. */
export type SortOrder = 'newest' | 'oldest' | 'az' | 'added';

/** The source sites supported by the first release of Listio. */
export type SourceSite = 'trakt' | 'mdblist' | 'imdb' | 'imdb-csv';

/**
 * The normalized identity and display data for one movie or series.
 *
 * `addedSeq` is assigned by the merge step. It is deliberately kept on the
 * Title so a Combined List can reproduce its order without another table.
 */
export type Title = {
	imdbId: string;
	type: TitleType;
	name: string;
	year: number | null;
	poster: string | null;
	blurb: string | null;
	tmdbId: number | null;
	/** TMDB vote average (0–10). Absent on Titles saved before ratings existed. */
	rating?: number | null;
	addedSeq: number;
};

/** The fields a Source supplies before TMDB enrichment and merge bookkeeping. */
export type SourceTitle = Pick<
	Title,
	'imdbId' | 'type' | 'name' | 'year' | 'tmdbId'
>;

/** A Source snapshot recorded on a Combined List. */
export type SourceRecord = {
	url: string;
	site: SourceSite;
	addedAt: string;
	titleCount: number;
	skippedNoImdb: number;
};

/** A saved, static collection of Titles assembled from Source snapshots. */
export type CombinedList = {
	/** Identifies an idempotent import creation; preserved across edits. */
	creationId?: string;
	id: string;
	name: string;
	/** Shows the list's Catalogs on Nuvio's home screen. Absent means hidden. */
	showOnHome?: boolean;
	sort: SortOrder;
	sources: SourceRecord[];
	titles: Title[];
	removed: Title[];
	nextSeq: number;
	version: number;
	updatedAt: string;
};
