import type { SourceTitle, TitleType } from '../domain/types.ts';
import { detectSource, type TraktDetectedSource } from './detect.ts';
import {
	imdbValue,
	nonEmptyString,
	positiveInt,
	record,
	yearValue,
	type JsonRecord,
} from './parse.ts';
import { SourceRequestBudgetError } from './errors.ts';

const TRAKT_API_URL = 'https://api.trakt.tv';
const DEFAULT_PAGE_SIZE = 100;

export type TraktFetchResult = {
	titles: SourceTitle[];
	skippedNoImdb: number;
	/** Movies/shows that had an IMDb id but were otherwise unusable (e.g. no name). */
	skippedInvalid: number;
	pages: number;
	totalItems: number;
	source: TraktDetectedSource;
};

export type TraktFetchOptions = {
	clientId: string;
	fetch?: typeof globalThis.fetch;
	baseUrl?: string;
	pageSize?: number;
	/** Optional cap on accepted Titles. Lists have no size cap by default. */
	maxItems?: number;
	/** Fail instead of silently truncating when a Worker request budget is spent.
	 * Counts every page, including pages whose records are all skipped. */
	maxPages?: number;
	signal?: AbortSignal;
};

type Classified = SourceTitle | 'unsupported' | 'noImdb' | 'invalid';

function mediaType(value: string | null, media: JsonRecord): TitleType | null {
	if (value === 'show') return 'series';
	if (value === 'movie') return 'movie';
	if (media.show !== undefined) return 'series';
	if (media.movie !== undefined) return 'movie';
	return null;
}

function nestedId(media: JsonRecord, key: string): unknown {
	return record(media.ids)?.[key];
}

function classifyTraktItem(item: unknown): Classified {
	const raw = record(item);
	if (!raw) return 'invalid';

	const type = nonEmptyString(raw.type)?.toLowerCase() ?? null;
	if (type && !['movie', 'show'].includes(type)) return 'unsupported';

	const inferredType =
		type ??
		(raw.show !== undefined
			? 'show'
			: raw.movie !== undefined
				? 'movie'
				: null);
	const media = record(
		inferredType === 'show'
			? raw.show
			: inferredType === 'movie'
				? raw.movie
				: (raw.show ?? raw.movie)
	);
	if (!media) return 'invalid';

	const mappedType = mediaType(inferredType, media);
	if (!mappedType) return 'invalid';

	const imdbId = imdbValue(nestedId(media, 'imdb') ?? media.imdb ?? raw.imdb);
	if (!imdbId) return 'noImdb';

	const name = nonEmptyString(
		media.title ?? media.name ?? raw.title ?? raw.name
	);
	if (!name) return 'invalid';

	return {
		imdbId,
		type: mappedType,
		name,
		year: yearValue(media.year ?? raw.year),
		tmdbId: positiveInt(
			nestedId(media, 'tmdb') ?? media.tmdb_id ?? media.tmdbId
		),
	};
}

/** Normalize one Trakt item; unsupported seasons, episodes and people return null. */
export function normalizeTraktItem(item: unknown): SourceTitle | null {
	const result = classifyTraktItem(item);
	return typeof result === 'string' ? null : result;
}

/** Normalize a page of Trakt items, counting movies/shows that were skipped. */
export function normalizeTraktItems(items: unknown): {
	titles: SourceTitle[];
	skippedNoImdb: number;
	skippedInvalid: number;
} {
	const inputItems = Array.isArray(items) ? items : record(items)?.items;
	const titles: SourceTitle[] = [];
	let skippedNoImdb = 0;
	let skippedInvalid = 0;
	if (!Array.isArray(inputItems)) {
		return { titles, skippedNoImdb, skippedInvalid };
	}

	for (const item of inputItems) {
		const result = classifyTraktItem(item);
		if (result === 'noImdb') skippedNoImdb += 1;
		else if (result === 'invalid') skippedInvalid += 1;
		else if (result !== 'unsupported') titles.push(result);
	}
	return { titles, skippedNoImdb, skippedInvalid };
}

function endpointFor(source: TraktDetectedSource): string {
	if (source.user && source.slug) {
		return `/users/${encodeURIComponent(
			source.user
		)}/lists/${encodeURIComponent(source.slug)}/items`;
	}
	if (source.listId) return `/lists/${encodeURIComponent(source.listId)}/items`;
	throw new Error('The Trakt URL did not include a user list or list id.');
}

export function buildTraktItemsUrl(
	source: TraktDetectedSource,
	page: number,
	limit: number,
	baseUrl = TRAKT_API_URL
): string {
	const url = new URL(endpointFor(source), `${baseUrl.replace(/\/$/, '')}/`);
	url.searchParams.set('page', String(page));
	url.searchParams.set('limit', String(limit));
	return url.toString();
}

function pageCount(response: Response): number | null {
	const value = response.headers.get('x-pagination-page-count');
	if (!value || !/^\d+$/.test(value)) return null;
	const count = Number(value);
	return count > 0 ? count : null;
}

async function responseJson(response: Response): Promise<unknown> {
	if (!response.ok) {
		const body = await response.text();
		throw new Error(
			`Trakt request failed (${response.status} ${
				response.statusText
			}): ${body.slice(0, 300)}`
		);
	}
	return response.json() as Promise<unknown>;
}

function optionsFor(
	clientIdOrOptions: string | TraktFetchOptions,
	fetcher?: typeof globalThis.fetch
): TraktFetchOptions {
	if (typeof clientIdOrOptions === 'string') {
		return { clientId: clientIdOrOptions, fetch: fetcher };
	}
	return { ...clientIdOrOptions, fetch: clientIdOrOptions.fetch ?? fetcher };
}

/** Fetch and normalize all pages of a Trakt public list. */
export async function fetchTrakt(
	sourceInput: string | TraktDetectedSource,
	clientIdOrOptions: string | TraktFetchOptions,
	fetcher?: typeof globalThis.fetch
): Promise<TraktFetchResult> {
	const source =
		typeof sourceInput === 'string' ? detectSource(sourceInput) : sourceInput;
	if (source.site !== 'trakt') {
		throw new Error('fetchTrakt expects a Trakt list URL.');
	}

	const options = optionsFor(clientIdOrOptions, fetcher);
	if (!options.clientId.trim()) throw new Error('TRAKT_CLIENT_ID is required.');

	const request = options.fetch ?? globalThis.fetch;
	const limit = Math.min(
		Math.max(options.pageSize ?? DEFAULT_PAGE_SIZE, 1),
		100
	);
	const maxItems =
		options.maxItems === undefined ? Infinity : Math.max(options.maxItems, 1);
	const titles: SourceTitle[] = [];
	let skippedNoImdb = 0;
	let skippedInvalid = 0;
	let pages = 0;

	for (let page = 1; titles.length < maxItems; page += 1) {
		if (options.maxPages !== undefined && page > options.maxPages)
			throw new SourceRequestBudgetError(options.maxPages);
		const response = await request(
			buildTraktItemsUrl(source, page, limit, options.baseUrl),
			{
				headers: {
					Accept: 'application/json',
					'trakt-api-key': options.clientId,
					'trakt-api-version': '2',
					// Trakt's Cloudflare front returns 403 to requests without a User-Agent.
					'User-Agent': 'Listio/0.1',
				},
				signal: options.signal,
			}
		);
		const payload = await responseJson(response);
		const items = Array.isArray(payload) ? payload : record(payload)?.items;
		const normalized = normalizeTraktItems(items);
		titles.push(...normalized.titles.slice(0, maxItems - titles.length));
		skippedNoImdb += normalized.skippedNoImdb;
		skippedInvalid += normalized.skippedInvalid;
		pages = page;

		const totalPages = pageCount(response);
		if (
			totalPages !== null
				? page >= totalPages
				: !Array.isArray(items) || items.length < limit
		) {
			break;
		}
	}

	return {
		titles,
		skippedNoImdb,
		skippedInvalid,
		pages,
		totalItems: titles.length,
		source,
	};
}
