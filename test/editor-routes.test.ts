import { afterEach, describe, expect, it, vi } from 'vitest';
import type { APIContext, APIRoute } from 'astro';
import type { Title } from '../src/domain/types.ts';
vi.mock('cloudflare:workers', () => ({
	env: {
		TRAKT_CLIENT_ID: 'trakt-key',
		MDBLIST_API_KEY: 'mdb-key',
		TMDB_API_KEY: 'tmdb-key',
	},
}));
const { POST: source } = await import('../src/pages/api/sources/fetch.ts');
const { POST: enrich } = await import('../src/pages/api/titles/enrich.ts');
const call = (route: APIRoute, body: unknown) =>
	route({
		request: new Request('https://listio.test/api', {
			method: 'POST',
			body: JSON.stringify(body),
		}),
	} as APIContext) as Promise<Response>;
const title = (i: number, tmdbId: number | null = i): Title => ({
	imdbId: `tt${i}`,
	type: 'movie',
	name: `Title ${i}`,
	year: null,
	poster: null,
	blurb: null,
	tmdbId,
	addedSeq: i,
});
afterEach(() => vi.unstubAllGlobals());
describe('Source and enrichment routes', () => {
	it('detects, fetches and normalizes a Source without enrichment', async () => {
		const fetcher = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify([
					{
						type: 'movie',
						movie: {
							title: 'Movie',
							year: 2020,
							ids: { imdb: 'tt123', tmdb: 123 },
						},
					},
					{ type: 'movie', movie: { title: 'No ID', ids: {} } },
				]),
				{ headers: { 'x-pagination-page-count': '1' } }
			)
		);
		vi.stubGlobal('fetch', fetcher);
		const response = await call(source, {
			url: 'https://trakt.tv/lists/123?query=x',
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			titles: [{ imdbId: 'tt123', tmdbId: 123 }],
			source: {
				url: 'https://trakt.tv/lists/123',
				site: 'trakt',
				titleCount: 1,
				skippedNoImdb: 1,
			},
		});
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it('fetches a 501-Title MDBList Source over six pages without truncating', async () => {
		const fetcher = vi.fn(async (input: string) => {
			const offset = Number(new URL(input).searchParams.get('offset') ?? 0);
			const count = Math.min(100, 501 - offset);
			return new Response(
				JSON.stringify(
					Array.from({ length: count }, (_, i) => ({
						imdb_id: `tt${offset + i}`,
						title: `Title ${offset + i}`,
						mediatype: 'movie',
					}))
				)
			);
		});
		vi.stubGlobal('fetch', fetcher);
		const response = await call(source, {
			url: 'https://mdblist.com/lists/user/list',
		});
		expect(response.status).toBe(200);
		const result = (await response.json()) as { titles: Title[] };
		expect(result.titles).toHaveLength(501);
		expect(fetcher).toHaveBeenCalledTimes(6);
	});
	it('fails rather than importing a partial MDBList Source when its Worker request budget is exhausted', async () => {
		const fetcher = vi.fn(async (input: string) => {
			const offset = Number(new URL(input).searchParams.get('offset') ?? 0);
			return new Response(
				JSON.stringify({
					items: [{ imdb_id: `tt${offset}`, title: 'Title' }],
					has_more: true,
				})
			);
		});
		vi.stubGlobal('fetch', fetcher);
		const response = await call(source, {
			url: 'https://mdblist.com/lists/user/list',
		});
		expect(response.status).toBe(422);
		expect(await response.json()).toEqual({
			error:
				'This Source needs more than 40 API pages. No Titles were imported.',
		});
		expect(fetcher).toHaveBeenCalledTimes(40);
	});
	it.each([
		['dense', 100],
		['sparse', 10],
	])(
		'fails rather than exceeding the Worker request budget for a %s Trakt Source',
		async (_, valid) => {
			// 51 pages advertised; only `valid` records per page carry an IMDb ID.
			const fetcher = vi.fn(async (input: string) => {
				const page = Number(new URL(input).searchParams.get('page'));
				return new Response(
					JSON.stringify(
						Array.from({ length: 100 }, (_, i) => ({
							type: 'movie',
							movie: {
								title: `Title ${page}-${i}`,
								ids: i < valid ? { imdb: `tt${page * 1000 + i}` } : {},
							},
						}))
					),
					{ headers: { 'x-pagination-page-count': '51' } }
				);
			});
			vi.stubGlobal('fetch', fetcher);
			const response = await call(source, {
				url: 'https://trakt.tv/lists/123',
			});
			expect(response.status).toBe(422);
			expect(await response.json()).toEqual({
				error:
					'This Source needs more than 40 API pages. No Titles were imported.',
			});
			expect(fetcher).toHaveBeenCalledTimes(40);
		}
	);
	it('fetches a 501-Title Trakt Source over six pages without truncating', async () => {
		const fetcher = vi.fn(async (input: string) => {
			const page = Number(new URL(input).searchParams.get('page'));
			const count = Math.min(100, 501 - (page - 1) * 100);
			return new Response(
				JSON.stringify(
					Array.from({ length: count }, (_, i) => ({
						type: 'movie',
						movie: {
							title: 'Title',
							ids: { imdb: `tt${(page - 1) * 100 + i}` },
						},
					}))
				),
				{ headers: { 'x-pagination-page-count': '6' } }
			);
		});
		vi.stubGlobal('fetch', fetcher);
		const response = await call(source, { url: 'https://trakt.tv/lists/123' });
		expect(response.status).toBe(200);
		expect(
			((await response.json()) as { titles: Title[] }).titles
		).toHaveLength(501);
		expect(fetcher).toHaveBeenCalledTimes(6);
	});

	it('rejects invalid URLs and sanitizes upstream errors', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValue(
				new Response('secret-key-upstream-body', { status: 401 })
			);
		vi.stubGlobal('fetch', fetcher);
		expect(
			(await call(source, { url: 'https://example.com/list' })).status
		).toBe(400);
		expect(fetcher).not.toHaveBeenCalled();
		const response = await call(source, {
			url: 'https://mdblist.com/lists/user/list',
		});
		expect(response.status).toBe(502);
		expect(await response.text()).not.toContain('secret-key');
	});
	it('enforces both Title and upstream request limits before fetching', async () => {
		const fetcher = vi.fn();
		vi.stubGlobal('fetch', fetcher);
		for (const body of [
			null,
			{ titles: [{}] },
			{ titles: Array.from({ length: 41 }, (_, i) => title(i)) },
			{ titles: Array.from({ length: 21 }, (_, i) => title(i, null)) },
		]) {
			expect((await call(enrich, body)).status).toBe(400);
		}
		expect(fetcher).not.toHaveBeenCalled();
	});
	it('enriches 20 missing-TMDB-ID Titles in exactly 40 upstream calls and preserves input order', async () => {
		const fetcher = vi.fn(async (input: string) => {
			const path = new URL(input).pathname;
			if (path.includes('/find/'))
				return new Response(
					JSON.stringify({
						movie_results: [{ id: 123, poster_path: '/found.jpg' }],
					})
				);
			return new Response(
				JSON.stringify({
					id: 123,
					poster_path: '/poster.jpg',
					tagline: 'A blurb',
					release_date: '2020-01-01',
				})
			);
		});
		vi.stubGlobal('fetch', fetcher);
		const titles = Array.from({ length: 20 }, (_, i) => title(i, null));
		const response = await call(enrich, { titles });
		expect(response.status).toBe(200);
		const result = (await response.json()) as { titles: Title[] };
		expect(result.titles.map((t: Title) => t.imdbId)).toEqual(
			titles.map((t) => t.imdbId)
		);
		expect(result.titles[0]).toMatchObject({
			poster: 'https://image.tmdb.org/t/p/w342/poster.jpg',
			blurb: 'A blurb',
			year: 2020,
		});
		expect(fetcher).toHaveBeenCalledTimes(40);
	});
	it('keeps a Title usable on ordinary TMDB failure and reports invalid credentials without leaking upstream bodies', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response('', { status: 404 }))
		);
		expect(await (await call(enrich, { titles: [title(1)] })).json()).toEqual({
			titles: [title(1)],
		});
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response('secret', { status: 401 }))
		);
		const response = await call(enrich, { titles: [title(1)] });
		expect(response.status).toBe(502);
		expect(await response.text()).not.toContain('secret');
	});
});
