import type { Title } from '../domain/types.ts';
import {
	nonEmptyString,
	positiveInt,
	record,
	yearValue,
	type JsonRecord,
} from '../sources/parse.ts';

const TMDB_API_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p/w342';
const DEFAULT_CONCURRENCY = 8;

export type TmdbAuth = 'v3' | 'v4';

export type TmdbEnrichOptions = {
	apiKey: string;
	fetch?: typeof globalThis.fetch;
	baseUrl?: string;
	imageBaseUrl?: string;
	auth?: TmdbAuth;
	signal?: AbortSignal;
	/** Maximum TMDB requests in flight during `enrichTitles`. */
	concurrency?: number;
};

export class TmdbRequestError extends Error {
	readonly status: number;

	constructor(status: number, statusText: string, body: string) {
		super(
			`TMDB request failed (${status} ${statusText}): ${body.slice(0, 300)}`
		);
		this.name = 'TmdbRequestError';
		this.status = status;
	}
}

/**
 * Errors that would fail every Title the same way (a bad key) or that the
 * caller asked for (cancellation) are raised instead of being swallowed.
 */
function isFatal(error: unknown, options: TmdbEnrichOptions): boolean {
	if (options.signal?.aborted) return true;
	if (error instanceof Error && error.name === 'AbortError') return true;
	return (
		error instanceof TmdbRequestError &&
		(error.status === 401 || error.status === 403)
	);
}

/** Choose the TMDB overview, falling back to its tagline. */
export function blurbFromTmdb(details: unknown): string | null {
	const value = record(details);
	if (!value) return null;
	return (
		nonEmptyString(value.overview)?.trim() ??
		nonEmptyString(value.tagline)?.trim() ??
		null
	);
}

/** TMDB's 0–10 vote average to one decimal, or null when nobody has voted. */
export function ratingFromTmdb(details: JsonRecord): number | null {
	const average = details.vote_average;
	const count = details.vote_count;
	if (typeof average !== 'number' || !Number.isFinite(average)) return null;
	if (typeof count === 'number' && count <= 0) return null;
	if (average <= 0 || average > 10) return null;
	return Math.round(average * 10) / 10;
}

function posterFromTmdb(
	details: JsonRecord,
	imageBaseUrl: string
): string | null {
	const path = nonEmptyString(details.poster_path);
	if (!path) return null;
	return `${imageBaseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function optionsFor(
	apiKeyOrOptions: string | TmdbEnrichOptions,
	fetcher?: typeof globalThis.fetch
): TmdbEnrichOptions {
	if (typeof apiKeyOrOptions === 'string') {
		return { apiKey: apiKeyOrOptions, fetch: fetcher };
	}
	return { ...apiKeyOrOptions, fetch: apiKeyOrOptions.fetch ?? fetcher };
}

function authFor(options: TmdbEnrichOptions): TmdbAuth {
	if (options.auth) return options.auth;
	return options.apiKey.trim().startsWith('eyJ') ? 'v4' : 'v3';
}

function requestUrl(
	path: string,
	options: TmdbEnrichOptions,
	query: Record<string, string> = {}
): string {
	const url = new URL(
		path.replace(/^\//, ''),
		`${(options.baseUrl ?? TMDB_API_URL).replace(/\/$/, '')}/`
	);
	for (const [key, value] of Object.entries(query))
		url.searchParams.set(key, value);
	if (authFor(options) === 'v3')
		url.searchParams.set('api_key', options.apiKey);
	return url.toString();
}

export async function fetchJson(
	path: string,
	options: TmdbEnrichOptions,
	query: Record<string, string> = {}
): Promise<unknown> {
	const request = options.fetch ?? globalThis.fetch;
	const headers: Record<string, string> = { Accept: 'application/json' };
	if (authFor(options) === 'v4') {
		headers.Authorization = `Bearer ${options.apiKey}`;
	}
	const response = await request(requestUrl(path, options, query), {
		headers,
		signal: options.signal,
	});
	if (!response.ok) {
		throw new TmdbRequestError(
			response.status,
			response.statusText,
			await response.text()
		);
	}
	return response.json() as Promise<unknown>;
}

function detailsPath(type: Title['type'], tmdbId: number): string {
	return type === 'series' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
}

function firstFindResult(payload: unknown, title: Title): JsonRecord | null {
	const root = record(payload);
	if (!root) return null;
	const key = title.type === 'series' ? 'tv_results' : 'movie_results';
	const results = root[key];
	if (!Array.isArray(results)) return null;
	const result = results.find((value) => record(value) !== null);
	return record(result);
}

/**
 * Details by TMDB id; without one, `/find` resolves the IMDb id and the
 * details endpoint is then read so taglines are available on both paths.
 * If that second request fails non-fatally, the `/find` result is used.
 */
async function detailsForTitle(
	title: Title,
	options: TmdbEnrichOptions
): Promise<JsonRecord | null> {
	if (title.tmdbId !== null) {
		return record(
			await fetchJson(detailsPath(title.type, title.tmdbId), options)
		);
	}

	const found = firstFindResult(
		await fetchJson(`/find/${encodeURIComponent(title.imdbId)}`, options, {
			external_source: 'imdb_id',
		}),
		title
	);
	const foundId = positiveInt(found?.id);
	if (!found || foundId === null) return found;

	try {
		return (
			record(await fetchJson(detailsPath(title.type, foundId), options)) ??
			found
		);
	} catch (error) {
		if (isFatal(error, options)) throw error;
		return found;
	}
}

/**
 * Enrich one Title. An unavailable TMDB record leaves the Title usable with
 * its existing nullable metadata, as required by the review workflow. An
 * invalid key (401/403) or an aborted request is raised to the caller.
 */
export async function enrichTitle(
	title: Title,
	apiKeyOrOptions: string | TmdbEnrichOptions,
	fetcher?: typeof globalThis.fetch
): Promise<Title> {
	const options = optionsFor(apiKeyOrOptions, fetcher);
	if (!options.apiKey.trim()) throw new Error('TMDB_API_KEY is required.');

	try {
		const details = await detailsForTitle(title, options);
		if (!details) return { ...title };
		return {
			...title,
			tmdbId: positiveInt(details.id) ?? title.tmdbId,
			poster: posterFromTmdb(details, options.imageBaseUrl ?? TMDB_IMAGE_URL),
			year:
				yearValue(
					details.release_date ?? details.first_air_date ?? details.date
				) ?? title.year,
			blurb: blurbFromTmdb(details),
			rating: ratingFromTmdb(details),
		};
	} catch (error) {
		if (isFatal(error, options)) throw error;
		return { ...title };
	}
}

/**
 * Enrich a batch with at most `concurrency` requests in flight, returning
 * Titles in their input order. One unavailable Title does not stop the rest.
 */
export async function enrichTitles(
	titles: readonly Title[],
	apiKeyOrOptions: string | TmdbEnrichOptions,
	fetcher?: typeof globalThis.fetch
): Promise<Title[]> {
	const options = optionsFor(apiKeyOrOptions, fetcher);
	const concurrency = Math.max(
		Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY),
		1
	);
	const results = new Array<Title>(titles.length);
	let next = 0;

	async function worker(): Promise<void> {
		while (next < titles.length) {
			const index = next;
			next += 1;
			results[index] = await enrichTitle(titles[index], options);
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(concurrency, titles.length) }, worker)
	);
	return results;
}
