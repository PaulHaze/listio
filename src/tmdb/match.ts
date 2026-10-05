import type { Title } from '../domain/types.ts';
import { fetchJson, type TmdbEnrichOptions } from './enrich.ts';
import { normalizeResults, type Candidate } from './search.ts';
import { lookupTitle } from './lookup.ts';
export type MatchResult =
	| { status: 'matched'; title: Title }
	| { status: 'ambiguous'; candidates: Candidate[]; reason?: string }
	| { status: 'none'; reason: string; retry?: boolean };
export type BatchMatchResult =
	MatchResult | { status: 'lookup'; candidate: Candidate };
export const normalizedName = (name: string): string =>
	name
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		// '&' and 'and' are dropped so "Fear & Loathing" equals "Fear and Loathing".
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\band\b/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^(?:the|an?)\s+/, '');
/** Release years can differ by country, so a unique name match may be off by this much. */
const YEAR_TOLERANCE = 2;
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
	// Searches are not year-filtered so near-year releases can still be found.
	const fits = (c: Candidate) =>
		normalizedName(c.name) === normalizedName(name) &&
		(year === undefined ||
			(c.year !== null && Math.abs(c.year - year) <= YEAR_TOLERANCE));
	const movie = normalizeResults(
		await fetchJson('/search/movie', options, {
			query: name,
			include_adult: 'false',
		}),
		'movie'
	);
	let candidates = movie;
	if (!movie.some(fits)) {
		const tv = normalizeResults(
			await fetchJson('/search/tv', options, {
				query: name,
				include_adult: 'false',
			}),
			'series'
		);
		candidates = [...tv, ...movie];
	}
	const near = candidates.filter(fits);
	const within = (years: number) =>
		near.filter((c) => year !== undefined && Math.abs(c.year! - year) <= years);
	// A name + year (±1) hit is trusted even when obscure same-name releases
	// share it; TMDB's relevance order puts the well-known one first.
	const best = within(0)[0] ?? within(1)[0];
	const pick = best ?? (near.length === 1 ? near[0] : undefined);
	if (pick) {
		if (!canLookup()) return { status: 'lookup', candidate: pick };
		const lookup = await lookupTitle(pick.tmdbId, pick.type, options);
		return lookup.status === 'matched'
			? lookup
			: { status: 'none', reason: lookup.reason };
	}
	return candidates.length
		? { status: 'ambiguous', candidates: candidates.slice(0, 6) }
		: { status: 'none', reason: 'No match' };
}
