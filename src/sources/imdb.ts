import type { SourceTitle, TitleType } from '../domain/types.ts';
import { detectSource, type ImdbDetectedSource } from './detect.ts';
import { SourceRequestBudgetError } from './errors.ts';
import { imdbValue, nonEmptyString, record, yearValue } from './parse.ts';

export const IMDB_QUERY = `query ListioList($id: ID!, $first: Int!, $after: String) {
  list(id: $id) {
    titleListItemSearch(first: $first, after: $after, sort: {by: LIST_ORDER, order: ASC}) {
      edges { title { id titleText { text } releaseYear { year } titleType { id } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

export type ImdbTitles = {
	titles: SourceTitle[];
	skippedNoImdb: number;
	skippedInvalid: number;
};

/** Both IMDb's GraphQL ids and CSV labels describe the same Title types. */
export function imdbTitleType(value: unknown): TitleType | null {
	const type = nonEmptyString(value)
		?.toLowerCase()
		.replace(/[\s_-]/g, '');
	if (type === 'tvseries' || type === 'tvminiseries') return 'series';
	if (
		[
			'movie',
			'tvmovie',
			'short',
			'tvshort',
			'tvspecial',
			'video',
			'musicvideo',
		].includes(type ?? '')
	)
		return 'movie';
	// Episodes and video games cannot be published as whole movies or series.
	return null;
}

function normalize(
	rows: { id: unknown; name: unknown; year: unknown; type: unknown }[]
): ImdbTitles {
	const result: ImdbTitles = {
		titles: [],
		skippedNoImdb: 0,
		skippedInvalid: 0,
	};
	for (const row of rows) {
		const imdbId = imdbValue(row.id);
		const name = nonEmptyString(row.name);
		const type = imdbTitleType(row.type);
		if (!imdbId) result.skippedNoImdb += 1;
		else if (!name || !type) result.skippedInvalid += 1;
		else
			result.titles.push({
				imdbId,
				name,
				type,
				year: yearValue(row.year),
				tmdbId: null,
			});
	}
	return result;
}

/** Read the complete list or fail; never expose a partial import on page failure. */
export async function fetchImdb(
	sourceInput: string | ImdbDetectedSource,
	options: {
		fetch?: typeof globalThis.fetch;
		pageSize?: number;
		maxPages?: number;
		signal?: AbortSignal;
	} = {}
): Promise<ImdbTitles & { source: ImdbDetectedSource; pages: number }> {
	const source =
		typeof sourceInput === 'string' ? detectSource(sourceInput) : sourceInput;
	if (source.site !== 'imdb')
		throw new Error('fetchImdb expects an IMDb list URL.');
	const result: ImdbTitles = {
		titles: [],
		skippedNoImdb: 0,
		skippedInvalid: 0,
	};
	const cursors = new Set<string>();
	let after: string | null = null;
	const maxPages = options.maxPages ?? 40;
	const first = Math.max(1, Math.min(250, Math.floor(options.pageSize ?? 100)));
	for (let pages = 1; ; pages += 1) {
		if (pages > maxPages) throw new SourceRequestBudgetError(maxPages);
		const response = await (options.fetch ?? globalThis.fetch)(
			'https://caching.graphql.imdb.com/',
			{
				method: 'POST',
				headers: {
					Accept: 'application/graphql+json, application/json',
					'Content-Type': 'application/json',
					Origin: 'https://www.imdb.com',
					Referer: 'https://www.imdb.com/',
					'x-imdb-client-name': 'imdb-web-next',
					'x-imdb-user-language': 'en-US',
					'x-imdb-user-country': 'US',
				},
				body: JSON.stringify({
					query: IMDB_QUERY,
					variables: { id: source.listId, first, after },
				}),
				signal: options.signal ?? AbortSignal.timeout(15000),
			}
		);
		if (!response.ok)
			throw new Error(`IMDb request failed (${response.status}).`);
		const payload = record(await response.json());
		if (
			!payload ||
			(payload.errors !== undefined &&
				(!Array.isArray(payload.errors) || payload.errors.length > 0))
		)
			throw new Error('IMDb returned GraphQL errors.');
		const connection = record(
			record(record(payload.data)?.list)?.titleListItemSearch
		);
		const pageInfo = record(connection?.pageInfo);
		if (
			!Array.isArray(connection?.edges) ||
			typeof pageInfo?.hasNextPage !== 'boolean'
		)
			throw new Error('IMDb returned an unsupported list response.');
		const normalized = normalize(
			connection.edges.map((edge) => {
				const title = record(record(edge)?.title);
				return {
					id: title?.id,
					name: record(title?.titleText)?.text,
					year: record(title?.releaseYear)?.year,
					type: record(title?.titleType)?.id,
				};
			})
		);
		result.titles.push(...normalized.titles);
		result.skippedNoImdb += normalized.skippedNoImdb;
		result.skippedInvalid += normalized.skippedInvalid;
		// People/image lists share `ls…` ids but have no Titles; offer CSV instead.
		if (pages === 1 && !pageInfo.hasNextPage && connection.edges.length === 0)
			throw new Error('IMDb returned no Titles for this list.');
		if (!pageInfo.hasNextPage) return { ...result, source, pages };
		const cursor = nonEmptyString(pageInfo.endCursor);
		if (!cursor || cursors.has(cursor) || connection.edges.length === 0)
			throw new Error('IMDb returned invalid pagination.');
		cursors.add(cursor);
		after = cursor;
	}
}

/** RFC 4180 fields: commas, escaped quotes, CRLF, and embedded newlines. */
function csvRows(input: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [],
		field = '',
		quoted = false,
		closed = false;
	for (let i = 0; i < input.length; i += 1) {
		const ch = input[i];
		if (quoted) {
			if (ch === '"' && input[i + 1] === '"') {
				field += '"';
				i += 1;
			} else if (ch === '"') {
				quoted = false;
				closed = true;
			} else field += ch;
		} else if (ch === ',' || ch === '\n' || ch === '\r') {
			row.push(field);
			field = '';
			closed = false;
			if (ch !== ',') {
				if (row.some((cell) => cell.trim())) rows.push(row);
				row = [];
				if (ch === '\r' && input[i + 1] === '\n') i += 1;
			}
		} else if (ch === '"' && field === '' && !closed) quoted = true;
		else {
			if (closed || ch === '"')
				throw new Error(
					'Invalid CSV quoting. Export the list again from IMDb.'
				);
			field += ch;
		}
	}
	if (quoted)
		throw new Error(
			'Incomplete CSV quoted field. Export the list again from IMDb.'
		);
	row.push(field);
	if (row.some((cell) => cell.trim())) rows.push(row);
	return rows;
}

export function parseImdbCsv(input: string): ImdbTitles {
	const [header, ...rows] = csvRows(input.replace(/^\uFEFF/, ''));
	const required = ['Const', 'Title', 'Year', 'Title Type'];
	const indexes = required.map(
		(name) => header?.findIndex((cell) => cell.trim() === name) ?? -1
	);
	if (
		indexes.some((index) => index < 0) ||
		required.some(
			(name) => header.filter((cell) => cell.trim() === name).length !== 1
		)
	)
		throw new Error(
			'IMDb CSV must contain Const, Title, Year and Title Type columns.'
		);
	if (rows.some((row) => row.length !== header.length))
		throw new Error('Invalid CSV row length. Export the list again from IMDb.');
	return normalize(
		rows.map((row) => ({
			id: row[indexes[0]],
			name: row[indexes[1]],
			year: row[indexes[2]],
			type: row[indexes[3]],
		}))
	);
}
