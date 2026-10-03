import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, afterEach } from 'vitest';
import type { APIContext } from 'astro';
import { detectSource } from '../src/sources/detect.ts';
import { fetchImdb, imdbTitleType, parseImdbCsv } from '../src/sources/imdb.ts';
import { SourceRequestBudgetError } from '../src/sources/errors.ts';
import { addSource, createDraft } from '../src/components/editor/draft.ts';
import type { CombinedList } from '../src/domain/types.ts';
vi.mock('cloudflare:workers', () => ({ env: {} }));
const { POST } = await import('../src/pages/api/sources/fetch.ts');
const fixture = (name: string) =>
	readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const page1 = JSON.parse(fixture('imdb-page-1.json'));
const page2 = JSON.parse(fixture('imdb-page-2.json'));
const url = 'https://www.imdb.com/list/ls004285275/';
const call = () =>
	POST({
		request: new Request('https://listio.test/api/sources/fetch', {
			method: 'POST',
			body: JSON.stringify({ url }),
		}),
	} as APIContext) as Promise<Response>;
afterEach(() => vi.unstubAllGlobals());

describe('IMDb Source', () => {
	it.each([
		'http://imdb.com/list/ls004285275',
		'https://m.imdb.com/list/ls004285275/',
		`${url}?sort=alpha#x`,
	])('recognizes and canonicalizes %s', (input) => {
		expect(detectSource(input)).toEqual({
			site: 'imdb',
			url,
			listId: 'ls004285275',
		});
	});
	it.each([
		'https://imdb.com.evil.test/list/ls123',
		'https://imdb.com/title/tt123',
		'https://imdb.com/list/lsabc',
		'https://imdb.com/list/ls123/export',
		'https://imdb.com:8443/list/ls123',
		'https://user@imdb.com/list/ls123',
	])('rejects %s', (input) => expect(() => detectSource(input)).toThrow());
	it('follows cursors with the verified query and matches CSV Titles and skip counts', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(Response.json(page1))
			.mockResolvedValueOnce(Response.json(page2));
		const result = await fetchImdb(url, { fetch: fetcher });
		expect(result).toMatchObject({
			...parseImdbCsv(fixture('imdb-export.csv')),
			pages: 2,
			skippedNoImdb: 1,
			skippedInvalid: 2,
		});
		expect(result.titles.map((title) => title.type)).toEqual([
			'movie',
			'series',
			'series',
			'movie',
		]);
		expect(fetcher).toHaveBeenCalledTimes(2);
		const [endpoint, options] = fetcher.mock.calls[1];
		expect(endpoint).toBe('https://caching.graphql.imdb.com/');
		expect(JSON.parse(options.body)).toMatchObject({
			variables: { id: 'ls004285275', first: 100, after: 'cursor-1' },
		});
		expect(options.headers.Origin).toBe('https://www.imdb.com');
	});
	it('normalizes an actual public IMDb GraphQL response', async () => {
		const payload = JSON.parse(fixture('imdb-live.json'));
		const fetcher = vi.fn().mockResolvedValue(Response.json(payload));
		const result = await fetchImdb(url, { fetch: fetcher });
		expect(result.titles[0]).toEqual({
			imdbId: 'tt0190332',
			name: 'Crouching Tiger, Hidden Dragon',
			year: 2000,
			type: 'movie',
			tmdbId: null,
		});
		expect(result.titles.length).toBe(
			payload.data.list.titleListItemSearch.edges.length
		);
	});
	it.each(['tvSeries', 'TV Series', 'tvMiniSeries', 'TV Mini Series'])(
		'maps %s to series',
		(type) => expect(imdbTitleType(type)).toBe('series')
	);
	it.each(['movie', 'TV Movie', 'Short', 'tvSpecial', 'Video', 'Music Video'])(
		'maps %s to movie',
		(type) => expect(imdbTitleType(type)).toBe('movie')
	);
	it.each(['tvEpisode', 'Video Game', '', 'unknown'])(
		'skips unsupported %s',
		(type) => expect(imdbTitleType(type)).toBeNull()
	);
	it.each([
		null,
		{},
		{ errors: [{ message: 'failure' }], data: page1.data },
		{ data: { list: null } },
		{ data: { list: { titleListItemSearch: { edges: [], pageInfo: {} } } } },
	])(
		'rejects unsuccessful/malformed responses rather than silently importing an empty Source',
		async (payload) => {
			await expect(
				fetchImdb(url, {
					fetch: vi.fn().mockResolvedValue(Response.json(payload)),
				})
			).rejects.toThrow();
		}
	);
	it('rejects cursor loops and request-budget exhaustion without returning partial Titles', async () => {
		await expect(
			fetchImdb(url, {
				fetch: vi.fn().mockImplementation(async () => Response.json(page1)),
			})
		).rejects.toThrow('pagination');
		await expect(
			fetchImdb(url, {
				fetch: vi.fn().mockImplementation(async () => Response.json(page1)),
				maxPages: 1,
			})
		).rejects.toBeInstanceOf(SourceRequestBudgetError);
	});
	it('rejects an empty first page so the editor offers CSV (people/image lists)', async () => {
		const payload = {
			data: {
				list: {
					titleListItemSearch: {
						edges: [],
						pageInfo: { hasNextPage: false, endCursor: null },
					},
				},
			},
		};
		await expect(
			fetchImdb(url, {
				fetch: vi.fn().mockResolvedValue(Response.json(payload)),
			})
		).rejects.toThrow('no Titles');
	});
	it('imports CSV quoting, BOM, CRLF and extra/reordered columns without a network request', () => {
		const result = parseImdbCsv(fixture('imdb-export.csv'));
		expect(result.titles[3]).toMatchObject({
			name: 'A, "quoted"\nTitle',
			year: null,
		});
		expect(
			parseImdbCsv('Title Type,Year,Title,Const\nTV Series,,Test,tt1').titles[0]
		).toMatchObject({ imdbId: 'tt1', type: 'series' });
	});
	it.each([
		'',
		'Const,Title,Year\ntt1,Test,2000',
		'Const,Title,Year,Title Type\ntt1,"unclosed,2000,Movie',
		'Const,Title,Year,Title Type\ntt1,"Test"oops,2000,Movie',
		'Const,Title,Year,Title Type\ntt1,Test',
		'Const,Const,Title,Year,Title Type\ntt1,tt1,Test,2000,Movie',
	])('rejects invalid CSV %s', (csv) =>
		expect(() => parseImdbCsv(csv)).toThrow()
	);
	it('applies CSV through the same Draft deduplication and Removed Title rules', () => {
		const parsed = parseImdbCsv(fixture('imdb-export.csv'));
		const removed = {
			...parsed.titles[0],
			poster: null,
			blurb: null,
			addedSeq: 1,
		};
		const saved: CombinedList = {
			id: 'test',
			name: 'Test',
			sort: 'added',
			sources: [],
			titles: [],
			removed: [removed],
			nextSeq: 2,
			version: 1,
			updatedAt: '',
		};
		const merged = addSource(
			createDraft(saved),
			{
				url,
				site: 'imdb-csv',
				addedAt: new Date().toISOString(),
				titleCount: parsed.titles.length,
				skippedNoImdb: parsed.skippedNoImdb,
			},
			[...parsed.titles, parsed.titles[1]]
		);
		expect(merged.draft.titles).toHaveLength(3);
		expect(merged.skipped).toBe(2);
		expect(saved.titles).toEqual([]);
	});
	it('fetches IMDb from the route without API keys', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(Response.json(page1))
				.mockResolvedValueOnce(Response.json(page2))
		);
		const response = await call();
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			titles: parseImdbCsv(fixture('imdb-export.csv')).titles,
			source: { url, site: 'imdb', titleCount: 4, skippedNoImdb: 1 },
		});
	});
	it('provides a safe CSV fallback on upstream failure, including second-page failures', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(Response.json(page1))
				.mockResolvedValueOnce(
					new Response('private-upstream-body', { status: 403 })
				)
		);
		const response = await call();
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({
			error:
				'Unable to fetch this IMDb Source. Export the list from IMDb and upload its CSV instead.',
		});
	});
});
