import type { Title, TitleType } from '../domain/types.ts';
import { record, nonEmptyString } from '../sources/parse.ts';
import {
	blurbFromTmdb,
	ratingFromTmdb,
	fetchJson,
	type TmdbEnrichOptions,
} from './enrich.ts';
import { normalizeResults } from './search.ts';
export const NO_IMDB = "No IMDb ID, can't add";
export type LookupResult =
	{ status: 'matched'; title: Title } | { status: 'no-imdb'; reason: string };
export async function lookupTitle(
	tmdbId: number,
	type: TitleType,
	options: TmdbEnrichOptions
): Promise<LookupResult> {
	const details = record(
		await fetchJson(
			`/${type === 'movie' ? 'movie' : 'tv'}/${tmdbId}`,
			options,
			{ append_to_response: 'external_ids' }
		)
	);
	const imdbId = nonEmptyString(
		record(details?.external_ids)?.imdb_id ?? details?.imdb_id
	)?.trim();
	if (!imdbId || !/^tt\d+$/.test(imdbId))
		return { status: 'no-imdb', reason: NO_IMDB };
	const candidate = normalizeResults({ results: [details] }, type)[0];
	if (!details || !candidate)
		throw new Error('TMDB returned invalid Title details.');
	return {
		status: 'matched',
		title: {
			...candidate,
			imdbId,
			addedSeq: 0,
			blurb: blurbFromTmdb(details),
			rating: ratingFromTmdb(details),
		},
	};
}
