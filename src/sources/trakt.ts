import type { SourceTitle, TitleType } from '../domain/types.ts';
import { detectSource, type TraktDetectedSource } from './detect.ts';

const TRAKT_API_URL = 'https://api.trakt.tv';
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_ITEMS = 1000;

export type TraktFetchResult = {
	titles: SourceTitle[];
	skippedNoImdb: number;
	pages: number;
	totalItems: number;
	source: TraktDetectedSource;
};

export type TraktFetchOptions = {
	clientId: string;
	fetch?: typeof globalThis.fetch;
	baseUrl?: string;
	pageSize?: number;
	maxItems?: number;
	signal?: AbortSignal;
};

type TraktItem = Record<string, unknown>;

function record(value: unknown): TraktItem | null {
	return typeof value === 'object' && value !== null
		? (value as TraktItem)
		: null;
}

function nonEmptyString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
	if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
		return value;
	}
	if (typeof value === 'string' && /^\d{1,6}$/.test(value.trim())) {
		const parsed = Number(value);
		return parsed > 0 ? parsed : null;
	}
	return null;
}

function imdbValue(value: unknown): string | null {
	const id = nonEmptyString(value)?.toLowerCase();
	return id && /^tt\d+$/.test(id) ? id : null;
}

function mediaType(value: unknown, media: TraktItem): TitleType | null {
	const type = nonEmptyString(value)?.toLowerCase();
	if (type === 'show') return 'series';
	if (type === 'movie') return 'movie';
	if (media.show !== undefined) return 'series';
	if (media.movie !== undefined) return 'movie';
	return null;
}

function nestedId(media: TraktItem, key: string): unknown {
	const ids = record(media.ids);
	return ids?.[key];
}

/** Normalize one Trakt item; unsupported seasons, episodes and people return null. */
export function normalizeTraktItem(item: unknown): SourceTitle | null {
	const raw = record(item);
	if (!raw) return null;

	const type = nonEmptyString(raw.type)?.toLowerCase();
	if (type && !['movie', 'show'].includes(type)) return null;

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
	if (!media) return null;

	const mappedType = mediaType(inferredType, media);
	if (!mappedType) return null;

	const imdbId = imdbValue(nestedId(media, 'imdb') ?? media.imdb ?? raw.imdb);
	if (!imdbId) return null;

	const name = nonEmptyString(
		media.title ?? media.name ?? raw.title ?? raw.name
	);
	if (!name) return null;

	return {
		imdbId,
		type: mappedType,
		name,
		year: numberValue(media.year ?? raw.year),
		tmdbId: numberValue(
			nestedId(media, 'tmdb') ?? media.tmdb_id ?? media.tmdbId
		),
	};
}

/** Normalize a page of Trakt items and count items with no usable IMDb id. */
export function normalizeTraktItems(items: unknown): {
	titles: SourceTitle[];
	skippedNoImdb: number;
} {
	const inputItems = Array.isArray(items) ? items : record(items)?.items;
	if (!Array.isArray(inputItems)) return { titles: [], skippedNoImdb: 0 };

	const titles: SourceTitle[] = [];
	let skippedNoImdb = 0;
	for (const item of inputItems) {
		const raw = record(item);
		const type = nonEmptyString(raw?.type)?.toLowerCase();
		const shouldCount = !type || type === 'movie' || type === 'show';
		const title = normalizeTraktItem(item);
		if (title) titles.push(title);
		else if (shouldCount) skippedNoImdb += 1;
	}
	return { titles, skippedNoImdb };
}

export const normaliseTraktItems = normalizeTraktItems;
export const normalizeTraktResponse = normalizeTraktItems;

function endpointFor(source: TraktDetectedSource): string {
	if (source.user && source.slug) {
		return `/users/${encodeURIComponent(source.user)}/lists/${encodeURIComponent(source.slug)}/items`;
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
			`Trakt request failed (${response.status} ${response.statusText}): ${body.slice(0, 300)}`
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
	const maxItems = Math.max(options.maxItems ?? DEFAULT_MAX_ITEMS, 1);
	const titles: SourceTitle[] = [];
	let skippedNoImdb = 0;
	let pages = 0;

	for (let page = 1; titles.length + skippedNoImdb < maxItems; page += 1) {
		const response = await request(
			buildTraktItemsUrl(source, page, limit, options.baseUrl),
			{
				headers: {
					Accept: 'application/json',
					'trakt-api-key': options.clientId,
					'trakt-api-version': '2',
				},
				signal: options.signal,
			}
		);
		const payload = await responseJson(response);
		const items = Array.isArray(payload) ? payload : record(payload)?.items;
		const normalized = normalizeTraktItems(items);
		const remaining = maxItems - (titles.length + skippedNoImdb);
		titles.push(...normalized.titles.slice(0, remaining));
		skippedNoImdb += Math.min(
			normalized.skippedNoImdb,
			Math.max(remaining - normalized.titles.length, 0)
		);
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
		pages,
		totalItems: titles.length,
		source,
	};
}

export const fetchTraktList = fetchTrakt;
export const fetchTraktSource = fetchTrakt;
