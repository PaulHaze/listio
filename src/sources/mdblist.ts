import type { SourceTitle, TitleType } from '../domain/types.ts';
import { detectSource, type MdbListDetectedSource } from './detect.ts';
import {
	imdbValue,
	nonEmptyString,
	positiveInt,
	record,
	yearValue,
	type JsonRecord,
} from './parse.ts';

const MDBLIST_API_URL = 'https://api.mdblist.com';
const DEFAULT_PAGE_SIZE = 100;

export class SourceRequestBudgetError extends Error {
	constructor(maxPages: number) {
		super(
			`This Source needs more than ${maxPages} API pages. No Titles were imported.`
		);
		this.name = 'SourceRequestBudgetError';
	}
}
const SERIES_TYPES = [
	'show',
	'series',
	'tv',
	'tvshow',
	'tv_series',
	'tvseries',
];

export type MdbListFetchResult = {
	titles: SourceTitle[];
	skippedNoImdb: number;
	/** Items that had an IMDb id but were otherwise unusable (e.g. no name). */
	skippedInvalid: number;
	pages: number;
	totalItems: number;
	source: MdbListDetectedSource;
};

export type MdbListFetchOptions = {
	apiKey: string;
	fetch?: typeof globalThis.fetch;
	baseUrl?: string;
	pageSize?: number;
	/** Optional cap on accepted Titles. Lists have no size cap by default. */
	maxItems?: number;
	/** Fail instead of silently truncating when a Worker request budget is spent. */
	maxPages?: number;
	signal?: AbortSignal;
};

type Classified = SourceTitle | 'noImdb' | 'invalid';

function rawMediaType(item: JsonRecord): unknown {
	return item.mediatype ?? item.media_type ?? item.type ?? item.kind;
}

function mediaType(value: unknown): TitleType {
	const type = nonEmptyString(value)?.toLowerCase() ?? '';
	return SERIES_TYPES.includes(type) ? 'series' : 'movie';
}

function nestedId(item: JsonRecord, key: string): unknown {
	return record(item.ids)?.[key];
}

function classifyMdbListItem(item: unknown): Classified {
	const raw = record(item);
	if (!raw) return 'invalid';

	const imdbId = imdbValue(
		raw.imdb_id ?? raw.imdbId ?? raw.imdb ?? nestedId(raw, 'imdb')
	);
	if (!imdbId) return 'noImdb';

	const name = nonEmptyString(
		raw.title ?? raw.name ?? raw.original_title ?? raw.original_name
	);
	if (!name) return 'invalid';

	return {
		imdbId,
		type: mediaType(rawMediaType(raw)),
		name,
		year: yearValue(raw.year ?? raw.release_year ?? raw.releaseYear),
		tmdbId: positiveInt(
			raw.tmdb_id ?? raw.tmdbid ?? raw.tmdbId ?? nestedId(raw, 'tmdb')
		),
	};
}

/** Normalize one MDBList item. Items without a usable IMDb id are omitted. */
export function normalizeMdbListItem(item: unknown): SourceTitle | null {
	const result = classifyMdbListItem(item);
	return typeof result === 'string' ? null : result;
}

/** Normalize either known MDBList response shape, counting skipped items. */
export function normalizeMdbListItems(items: unknown): {
	titles: SourceTitle[];
	skippedNoImdb: number;
	skippedInvalid: number;
} {
	const inputItems = Array.isArray(items) ? items : parsePayload(items).items;
	const titles: SourceTitle[] = [];
	let skippedNoImdb = 0;
	let skippedInvalid = 0;
	for (const item of inputItems) {
		const result = classifyMdbListItem(item);
		if (result === 'noImdb') skippedNoImdb += 1;
		else if (result === 'invalid') skippedInvalid += 1;
		else titles.push(result);
	}
	return { titles, skippedNoImdb, skippedInvalid };
}

function endpointFor(source: MdbListDetectedSource): string {
	return `/lists/${encodeURIComponent(source.user)}/${encodeURIComponent(
		source.slug
	)}/items`;
}

export type MdbListPageRequest = {
	limit: number;
	/** Current API: opaque cursor from the previous response. */
	cursor?: string;
	/** Legacy API: number of items already read. */
	offset?: number;
	baseUrl?: string;
};

export function buildMdbListItemsUrl(
	source: MdbListDetectedSource,
	apiKey: string,
	{ limit, cursor, offset = 0, baseUrl = MDBLIST_API_URL }: MdbListPageRequest
): string {
	const url = new URL(endpointFor(source), `${baseUrl.replace(/\/$/, '')}/`);
	url.searchParams.set('apikey', apiKey);
	url.searchParams.set('limit', String(limit));
	if (cursor) url.searchParams.set('cursor', cursor);
	else if (offset > 0) url.searchParams.set('offset', String(offset));
	return url.toString();
}

type ParsedPayload = {
	items: unknown[];
	pageCount: number | null;
	nextCursor: string | null;
	hasMore: boolean | null;
};

/**
 * Items in the current `movies`/`shows` buckets may not repeat their media
 * type, so the bucket supplies it when the item does not.
 */
function bucketItems(bucket: unknown, type: 'movie' | 'show'): unknown[] {
	if (!Array.isArray(bucket)) return [];
	return bucket.map((item) => {
		const raw = record(item);
		return raw && rawMediaType(raw) === undefined
			? { ...raw, mediatype: type }
			: item;
	});
}

/**
 * MDBList has returned a top-level array, an object containing an `items`
 * array, and (currently) `movies`/`shows` buckets. Keep the parser tolerant
 * while recording the shape in fixtures so changes can be spotted in tests.
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
	const pageCount = positiveInt(
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

	const buckets = [
		...bucketItems(root.movies, 'movie'),
		...bucketItems(root.shows, 'show'),
	];
	if (buckets.length > 0) {
		return { items: buckets, pageCount, nextCursor, hasMore };
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
			`MDBList request failed (${response.status} ${
				response.statusText
			}): ${body.slice(0, 300)}`
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

/**
 * Fetch and normalize all pages of an MDBList public list.
 *
 * Follows `next_cursor` when the response supplies one (current API) and
 * otherwise advances `offset` (legacy API). A page identical to the previous
 * one means the server ignored the pagination request; that is reported as an
 * error rather than returning a silently truncated list.
 */
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
	const maxItems =
		options.maxItems === undefined ? Infinity : Math.max(options.maxItems, 1);
	const titles: SourceTitle[] = [];
	let skippedNoImdb = 0;
	let skippedInvalid = 0;
	let pages = 0;
	let previousSignature = '';
	let cursor: string | undefined;
	let offset = 0;

	for (let page = 1; titles.length < maxItems; page += 1) {
		if (options.maxPages !== undefined && page > options.maxPages)
			throw new SourceRequestBudgetError(options.maxPages);
		const response = await request(
			buildMdbListItemsUrl(source, options.apiKey, {
				limit,
				cursor,
				offset,
				baseUrl: options.baseUrl,
			}),
			{
				headers: { Accept: 'application/json' },
				signal: options.signal,
			}
		);
		const parsed = parsePayload(await responseJson(response));
		const signature = parsed.items
			.map((item) => JSON.stringify(item))
			.join('|');
		if (page > 1 && signature && signature === previousSignature) {
			throw new Error(
				`MDBList returned the same page twice for ${source.url}; ` +
					'its pagination response is not supported.'
			);
		}
		previousSignature = signature;

		const normalized = normalizeMdbListItems(parsed.items);
		titles.push(...normalized.titles.slice(0, maxItems - titles.length));
		skippedNoImdb += normalized.skippedNoImdb;
		skippedInvalid += normalized.skippedInvalid;
		offset += parsed.items.length;
		pages = page;

		if (parsed.items.length === 0) break;
		if (parsed.pageCount !== null && page >= parsed.pageCount) break;
		if (parsed.hasMore === false) break;
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
		skippedInvalid,
		pages,
		totalItems: titles.length,
		source,
	};
}
