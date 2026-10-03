import type { Title } from '../domain/types.ts';
import { fetchJson, type TmdbEnrichOptions } from './enrich.ts';
import { normalizeResults, type Candidate } from './search.ts';
import { lookupTitle } from './lookup.ts';
export type MatchResult =
	| { status: 'matched'; title: Title }
	| { status: 'ambiguous'; candidates: Candidate[]; reason?: string }
	| { status: 'none'; reason: string };
export type BatchMatchResult =
	MatchResult | { status: 'lookup'; candidate: Candidate };
export const normalizedName = (name: string): string =>
	name
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/^(?:the|a)\s+/, '');
export function matchTitle(
	name: string,
	year: number | undefined,
	options: TmdbEnrichOptions
): Promise<MatchResult>;
export function matchTitle(
	name: string,
	year: number | undefined,
	options: TmdbEnrichOptions,
	canLookup: () => boolean
): Promise<BatchMatchResult>;
export async function matchTitle(
	name: string,
	year: number | undefined,
	options: TmdbEnrichOptions,
	canLookup: () => boolean = () => true
): Promise<BatchMatchResult> {
	const fits = (c: Candidate) =>
		normalizedName(c.name) === normalizedName(name) &&
		(year === undefined || c.year === year);
	const movie = normalizeResults(
		await fetchJson('/search/movie', options, {
			query: name,
			include_adult: 'false',
			...(year ? { year: String(year) } : {}),
		}),
		'movie'
	);
	let candidates = movie;
	if (!movie.some(fits)) {
		const tv = normalizeResults(
			await fetchJson('/search/tv', options, {
				query: name,
				include_adult: 'false',
				...(year ? { first_air_date_year: String(year) } : {}),
			}),
			'series'
		);
		candidates = [...tv, ...movie];
	}
	const exact = candidates.filter(fits);
	if (exact.length === 1) {
		if (!canLookup()) return { status: 'lookup', candidate: exact[0] };
		const lookup = await lookupTitle(exact[0].tmdbId, exact[0].type, options);
		return lookup.status === 'matched'
			? lookup
			: { status: 'none', reason: lookup.reason };
	}
	return candidates.length
		? { status: 'ambiguous', candidates: candidates.slice(0, 6) }
		: { status: 'none', reason: 'No match' };
}
