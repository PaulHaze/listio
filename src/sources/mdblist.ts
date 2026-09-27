import type { SourceTitle, TitleType } from '../domain/types.ts';
import { detectSource, type MdbListDetectedSource } from './detect.ts';

const MDBLIST_API_URL = 'https://api.mdblist.com';
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_ITEMS = 1000;

export type MdbListFetchResult = {
	titles: SourceTitle[];
	skippedNoImdb: number;
	pages: number;
	totalItems: number;
	source: MdbListDetectedSource;
};

export type MdbListFetchOptions = {
	apiKey: string;
	fetch?: typeof globalThis.fetch;
	baseUrl?: string;
	pageSize?: number;
	maxItems?: number;
	signal?: AbortSignal;
};

type MdbItem = Record<string, unknown>;

function record(value: unknown): MdbItem | null {
	return typeof value === 'object' && value !== null
		? (value as MdbItem)
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
	if (typeof value === 'string') {
		const year = Number(/^\d{4}/.exec(value.trim())?.[0]);
		return Number.isInteger(year) && year > 0 ? year : null;
	}
	return null;
}

function imdbValue(value: unknown): string | null {
	const id = nonEmptyString(value)?.toLowerCase();
	return id && /^tt\d+$/.test(id) ? id : null;
}

function mediaType(value: unknown): TitleType {
	const type = nonEmptyString(value)?.toLowerCase();
	return ['show', 'series', 'tv', 'tvshow', 'tv_series', 'tvseries'].includes(
		type ?? ''
	)
		? 'series'
		: 'movie';
}

function nestedId(item: MdbItem, key: string): unknown {
	const ids = record(item.ids);
	return ids?.[key];
}

/** Normalize one MDBList item. Items without a usable IMDb id are omitted. */
export function normalizeMdbListItem(item: unknown): SourceTitle | null {
	const raw = record(item);
	if (!raw) return null;

	const imdbId = imdbValue(
		raw.imdb_id ?? raw.imdbId ?? raw.imdb ?? nestedId(raw, 'imdb')
	);
	if (!imdbId) return null;

	const name = nonEmptyString(
		raw.title ?? raw.name ?? raw.original_title ?? raw.original_name
	);
	if (!name) return null;

	return {
		imdbId,
		type: mediaType(raw.mediatype ?? raw.media_type ?? raw.type ?? raw.kind),
		name,
		year: numberValue(raw.year ?? raw.release_year ?? raw.releaseYear),
		tmdbId: numberValue(
			raw.tmdb_id ?? raw.tmdbid ?? raw.tmdbId ?? nestedId(raw, 'tmdb')
		),
	};
}

/** Normalize either known MDBList response shape and count missing IMDb ids. */
export function normalizeMdbListItems(items: unknown): {
	titles: SourceTitle[];
	skippedNoImdb: number;
} {
	const inputItems = Array.isArray(items) ? items : parsePayload(items).items;
	if (!Array.isArray(inputItems)) return { titles: [], skippedNoImdb: 0 };

	const titles: SourceTitle[] = [];
	let skippedNoImdb = 0;
	for (const item of inputItems) {
		const normalized = normalizeMdbListItem(item);
		if (normalized) {
			titles.push(normalized);
		} else {
			skippedNoImdb += 1;
		}
	}
	return { titles, skippedNoImdb };
}

export const normaliseMdbListItems = normalizeMdbListItems;
export const normalizeMdbListResponse = normalizeMdbListItems;

function endpointFor(source: MdbListDetectedSource): string {
	return `/lists/${encodeURIComponent(source.user)}/${encodeURIComponent(source.slug)}/items`;
}

export function buildMdbListItemsUrl(
	source: MdbListDetectedSource,
	apiKey: string,
	page: number,
	limit: number,
	baseUrl = MDBLIST_API_URL,
	cursor?: string
): string {
	const url = new URL(endpointFor(source), `${baseUrl.replace(/\/$/, '')}/`);
	url.searchParams.set('apikey', apiKey);
	url.searchParams.set('limit', String(limit));
	if (cursor) url.searchParams.set('cursor', cursor);
	else url.searchParams.set('page', String(page));
	return url.toString();
}

type ParsedPayload = {
	items: unknown[];
	pageCount: number | null;
	nextCursor: string | null;
	hasMore: boolean | null;
};

function positiveNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
		return Math.floor(value);
	}
	if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
	return null;
}

/**
 * MDBList has returned both a top-level array and an object containing an
 * `items` array over time. Keep the parser tolerant while recording the shape
 * in fixtures so changes can be spotted in tests.
 */
function parsePayload(payload: unknown): ParsedPayload {
	if (Array.isArray(payload)) {
		return { items: payload, pageCount: null, nextCursor: null, hasMore: null };
	}
	const root = record(payload);
	if (!root) {
		return { items: [], pageCount: null, nextCursor: null, hasMore: null };
	}

	const pagination = record(root.pagination) ?? record(root.meta);
	const pageCount = positiveNumber(
		root.page_count ??
			root.pageCount ??
			pagination?.page_count ??
			pagination?.pageCount ??
			pagination?.total_pages ??
			pagination?.totalPages
	);
	const nextCursor = nonEmptyString(
		pagination?.next_cursor ??
			pagination?.nextCursor ??
			root.next_cursor ??
			root.nextCursor
	);
	const hasMoreValue =
		pagination?.has_more ??
		pagination?.hasMore ??
		root.has_more ??
		root.hasMore;
	const hasMore = typeof hasMoreValue === 'boolean' ? hasMoreValue : null;

	const buckets = [root.movies, root.shows];
	const bucketItems = buckets
		.filter((bucket): bucket is unknown[] => Array.isArray(bucket))
		.flatMap((bucket) => bucket);
	if (bucketItems.length > 0) {
		return { items: bucketItems, pageCount, nextCursor, hasMore };
	}

	for (const candidate of [root.items, root.results, root.data]) {
		if (Array.isArray(candidate)) {
			return { items: candidate, pageCount, nextCursor, hasMore };
		}
		const nested = record(candidate);
		if (nested) {
			for (const nestedItems of [nested.items, nested.results]) {
				if (Array.isArray(nestedItems)) {
					return { items: nestedItems, pageCount, nextCursor, hasMore };
				}
			}
		}
	}

	return { items: [], pageCount, nextCursor, hasMore };
}

async function responseJson(response: Response): Promise<unknown> {
	if (!response.ok) {
		const body = await response.text();
		throw new Error(
			`MDBList request failed (${response.status} ${response.statusText}): ${body.slice(0, 300)}`
		);
	}
	return response.json() as Promise<unknown>;
}

function hasMoreHeader(response: Response): boolean | null {
	const value = response.headers.get('x-has-more')?.toLowerCase();
	if (!value) return null;
	if (value === 'true' || value === '1' || value === 'yes') return true;
	if (value === 'false' || value === '0' || value === 'no') return false;
	return null;
}

function optionsFor(
	apiKeyOrOptions: string | MdbListFetchOptions,
	fetcher?: typeof globalThis.fetch
): MdbListFetchOptions {
	if (typeof apiKeyOrOptions === 'string') {
		return { apiKey: apiKeyOrOptions, fetch: fetcher };
	}
	return { ...apiKeyOrOptions, fetch: apiKeyOrOptions.fetch ?? fetcher };
}

/** Fetch and normalize all pages of an MDBList public list. */
export async function fetchMdbList(
	sourceInput: string | MdbListDetectedSource,
	apiKeyOrOptions: string | MdbListFetchOptions,
	fetcher?: typeof globalThis.fetch
): Promise<MdbListFetchResult> {
	const source =
		typeof sourceInput === 'string' ? detectSource(sourceInput) : sourceInput;
	if (source.site !== 'mdblist') {
		throw new Error('fetchMdbList expects an MDBList list URL.');
	}

	const options = optionsFor(apiKeyOrOptions, fetcher);
	if (!options.apiKey.trim()) throw new Error('MDBLIST_API_KEY is required.');

	const request = options.fetch ?? globalThis.fetch;
	const limit = Math.min(
		Math.max(options.pageSize ?? DEFAULT_PAGE_SIZE, 1),
		1000
	);
	const maxItems = Math.max(options.maxItems ?? DEFAULT_MAX_ITEMS, 1);
	const titles: SourceTitle[] = [];
	let skippedNoImdb = 0;
	let pages = 0;
	let previousSignature = '';
	let cursor: string | undefined;

	for (let page = 1; titles.length + skippedNoImdb < maxItems; page += 1) {
		const response = await request(
			buildMdbListItemsUrl(
				source,
				options.apiKey,
				page,
				limit,
				options.baseUrl,
				cursor
			),
			{
				headers: { Accept: 'application/json' },
				signal: options.signal,
			}
		);
		const parsed = parsePayload(await responseJson(response));
		const normalized = normalizeMdbListItems(parsed.items);
		const signature = parsed.items
			.map((item) => JSON.stringify(item))
			.join('|');
		if (page > 1 && signature && signature === previousSignature) break;
		previousSignature = signature;

		const remaining = maxItems - (titles.length + skippedNoImdb);
		titles.push(...normalized.titles.slice(0, remaining));
		skippedNoImdb += Math.min(
			normalized.skippedNoImdb,
			Math.max(remaining - normalized.titles.length, 0)
		);
		pages = page;

		if (parsed.pageCount !== null && page >= parsed.pageCount) break;
		if (parsed.nextCursor) {
			cursor = parsed.nextCursor;
			continue;
		}
		const more = parsed.hasMore ?? hasMoreHeader(response);
		if (more === true || (more === null && parsed.items.length >= limit)) {
			continue;
		}
		break;
	}

	return {
		titles,
		skippedNoImdb,
		pages,
		totalItems: titles.length,
		source,
	};
}

export const fetchMdbListItems = fetchMdbList;
export const fetchMdbListSource = fetchMdbList;
