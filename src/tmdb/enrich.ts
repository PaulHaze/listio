import type { Title } from '../domain/types.ts';

const TMDB_API_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p/w185';

export type TmdbAuth = 'v3' | 'v4';

export type TmdbEnrichOptions = {
	apiKey: string;
	fetch?: typeof globalThis.fetch;
	baseUrl?: string;
	imageBaseUrl?: string;
	auth?: TmdbAuth;
	signal?: AbortSignal;
};

type TmdbRecord = Record<string, unknown>;

function record(value: unknown): TmdbRecord | null {
	return typeof value === 'object' && value !== null
		? (value as TmdbRecord)
		: null;
}

function nonEmptyString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
	if (typeof value === 'number' && Number.isInteger(value) && value > 0)
		return value;
	if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
		const parsed = Number(value);
		return parsed > 0 ? parsed : null;
	}
	return null;
}

function firstSentence(overview: string): string {
	const trimmed = overview.trim();
	if (!trimmed) return '';
	const match = /^(.+?[.!?])(?:\s|$)/s.exec(trimmed);
	return (match?.[1] ?? trimmed).trim();
}

/** Choose a TMDB tagline, falling back to the first sentence of its overview. */
export function blurbFromTmdb(details: unknown): string | null {
	const value = record(details);
	if (!value) return null;
	const tagline = nonEmptyString(value.tagline);
	if (tagline) return tagline;
	const overview = nonEmptyString(value.overview);
	if (!overview) return null;
	return firstSentence(overview) || null;
}

export const getBlurb = blurbFromTmdb;

export const firstOverviewSentence = firstSentence;
export const getFirstSentence = firstSentence;

function yearFromTmdb(
	details: TmdbRecord,
	fallback: number | null
): number | null {
	const date = nonEmptyString(
		details.release_date ?? details.first_air_date ?? details.date
	);
	const year = date ? Number(/^\d{4}/.exec(date)?.[0]) : NaN;
	return Number.isInteger(year) && year > 0 ? year : fallback;
}

function posterFromTmdb(
	details: TmdbRecord,
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

async function fetchJson(
	path: string,
	options: TmdbEnrichOptions,
	query: Record<string, string> = {}
): Promise<unknown> {
	const request = options.fetch ?? globalThis.fetch;
	const headers: HeadersInit = { Accept: 'application/json' };
	if (authFor(options) === 'v4') {
		headers.Authorization = `Bearer ${options.apiKey}`;
	}
	const response = await request(requestUrl(path, options, query), {
		headers,
		signal: options.signal,
	});
	if (!response.ok) {
		const body = await response.text();
		throw new Error(
			`TMDB request failed (${response.status} ${response.statusText}): ${body.slice(0, 300)}`
		);
	}
	return response.json() as Promise<unknown>;
}

function firstFindResult(payload: unknown, title: Title): TmdbRecord | null {
	const root = record(payload);
	if (!root) return null;
	const key = title.type === 'series' ? 'tv_results' : 'movie_results';
	const results = root[key];
	if (!Array.isArray(results)) return null;
	const result = results.find((value) => record(value) !== null);
	return record(result);
}

async function detailsForTitle(
	title: Title,
	options: TmdbEnrichOptions
): Promise<TmdbRecord | null> {
	if (title.tmdbId !== null) {
		const path =
			title.type === 'series'
				? `/tv/${title.tmdbId}`
				: `/movie/${title.tmdbId}`;
		return record(await fetchJson(path, options));
	}

	const found = await fetchJson(
		`/find/${encodeURIComponent(title.imdbId)}`,
		options,
		{
			external_source: 'imdb_id',
		}
	);
	return firstFindResult(found, title);
}

/**
 * Enrich one Title. An unavailable TMDB record leaves the Title usable with
 * its existing nullable metadata, as required by the review workflow.
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
			tmdbId: numberValue(details.id) ?? title.tmdbId,
			poster: posterFromTmdb(details, options.imageBaseUrl ?? TMDB_IMAGE_URL),
			year: yearFromTmdb(details, title.year),
			blurb: blurbFromTmdb(details),
		};
	} catch {
		return { ...title };
	}
}

/** Enrich a client-sized batch while allowing one failed request to continue. */
export async function enrichTitles(
	titles: readonly Title[],
	apiKeyOrOptions: string | TmdbEnrichOptions,
	fetcher?: typeof globalThis.fetch
): Promise<Title[]> {
	return Promise.all(
		titles.map((title) => enrichTitle(title, apiKeyOrOptions, fetcher))
	);
}

export const enrich = enrichTitle;
