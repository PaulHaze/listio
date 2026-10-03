import type { TitleType } from '../domain/types.ts';
import {
	record,
	positiveInt,
	nonEmptyString,
	yearValue,
} from '../sources/parse.ts';
import {
	fetchJson,
	posterFromTmdb,
	TMDB_SEARCH_IMAGE_URL,
	type TmdbEnrichOptions,
} from './enrich.ts';
export type Candidate = {
	tmdbId: number;
	type: TitleType;
	name: string;
	year: number | null;
	poster: string | null;
};
export function normalizeResults(
	payload: unknown,
	type?: TitleType
): Candidate[] {
	const results = record(payload)?.results;
	if (!Array.isArray(results)) return [];
	return results.flatMap((item) => {
		const value = record(item);
		const media =
			type ??
			(value?.media_type === 'movie'
				? 'movie'
				: value?.media_type === 'tv'
					? 'series'
					: null);
		const tmdbId = positiveInt(value?.id);
		const name = nonEmptyString(
			media === 'movie' ? value?.title : value?.name
		)?.trim();
		if (!value || !media || !tmdbId || !name) return [];
		return [
			{
				tmdbId,
				type: media,
				name,
				year: yearValue(
					media === 'movie' ? value.release_date : value.first_air_date
				),
				poster: posterFromTmdb(value, TMDB_SEARCH_IMAGE_URL),
			},
		];
	});
}
export async function searchTitles(
	query: string,
	options: TmdbEnrichOptions
): Promise<Candidate[]> {
	if (query.trim().length < 2) return [];
	return normalizeResults(
		await fetchJson('/search/multi', options, {
			query: query.trim(),
			include_adult: 'false',
		})
	);
}
