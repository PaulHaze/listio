import type { Title } from '../domain/types.ts';

// Leave headroom below the Worker's 50 external subrequests. /find + details
// costs two calls when the Source did not provide a TMDB ID.
export const MAX_ENRICH_REQUESTS = 40;
export const MAX_ENRICH_TITLES = 40;
export const enrichmentCost = (title: Title): number =>
	title.tmdbId === null ? 2 : 1;
