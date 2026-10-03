import { afterEach, describe, expect, it, vi } from 'vitest';
import type { APIContext, APIRoute } from 'astro';
import { readFileSync } from 'node:fs';
import { normalizeResults, searchTitles } from '../src/tmdb/search.ts';
import { lookupTitle } from '../src/tmdb/lookup.ts';
import { matchTitle } from '../src/tmdb/match.ts';
import { pasteLines } from '../src/domain/pasteLines.ts';
import { addTitle, mergeTitles } from '../src/domain/merge.ts';
import { createDraft, countChanges } from '../src/components/editor/draft.ts';
import type { CombinedList } from '../src/domain/types.ts';
vi.mock('cloudflare:workers', () => ({ env: { TMDB_API_KEY: 'private-key' } }));
const { GET: search } = await import('../src/pages/api/search.ts');
const { POST: lookup } = await import('../src/pages/api/titles/lookup.ts');
const { POST: match } = await import('../src/pages/api/titles/match.ts');
const fixture = (name: string) =>
	JSON.parse(
		readFileSync(
			new URL(`./fixtures/tmdb-search-${name}.json`, import.meta.url),
			'utf8'
		)
	);
const response = (body: unknown) => new Response(JSON.stringify(body));
const call = (route: APIRoute, body?: unknown, q = '') =>
	route({
		url: new URL(`https://listio.test/api?q=${q}`),
		request: new Request('https://listio.test/api', {
			method: body === undefined ? 'GET' : 'POST',
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		}),
	} as APIContext) as Promise<Response>;
afterEach(() => vi.unstubAllGlobals());

describe('paste lines', () => {
	it('parses years and markers, skips comments/blanks/repeats, preserves internal punctuation', () => {
		expect(
			pasteLines(
				'\n# Header\n// comment\n- Being John Malkovich (1999)\n* Being John Malkovich (1999)\n1. 2001: A Space Odyssey (1968)\n2. [REC]\nTitle (Part 1)\n'
			)
		).toEqual([
			{
				line: 'Being John Malkovich (1999)',
				name: 'Being John Malkovich',
				year: 1999,
			},
			{
				line: '2001: A Space Odyssey (1968)',
				name: '2001: A Space Odyssey',
				year: 1968,
			},
			{ line: '[REC]', name: '[REC]' },
			{ line: 'Title (Part 1)', name: 'Title (Part 1)' },
		]);
	});
});
describe('TMDB discovery', () => {
	it('normalizes recorded search and excludes persons/malformed rows while retaining missing metadata', () => {
		const result = normalizeResults(fixture('multi'));
		expect(result[0]).toMatchObject({
			tmdbId: 492,
			type: 'movie',
			name: 'Being John Malkovich',
			year: 1999,
		});
		expect(
			normalizeResults({
				results: [
					{ id: 1, media_type: 'person', name: 'Actor' },
					{
						id: 2,
						media_type: 'tv',
						name: 'Show',
						first_air_date: '',
						poster_path: null,
					},
					{ media_type: 'movie', title: 'Bad' },
				],
			})
		).toEqual([
			{ tmdbId: 2, type: 'series', name: 'Show', year: null, poster: null },
		]);
		expect(normalizeResults(fixture('tv'), 'series')[0]).toMatchObject({
			name: 'Severance',
			type: 'series',
			year: 2022,
		});
	});
	it('uses one appended-details lookup with IMDb and returns typed no-IMDb without it', async () => {
		const fetcher = vi.fn(async (_input: string | URL | Request) =>
			response(fixture('lookup'))
		);
		const result = await lookupTitle(492, 'movie', {
			apiKey: 'key',
			fetch: fetcher,
		});
		expect(result).toMatchObject({
			status: 'matched',
			title: { imdbId: 'tt0120601', name: 'Being John Malkovich', year: 1999 },
		});
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(
			new URL(fetcher.mock.calls[0][0] as string).searchParams.get(
				'append_to_response'
			)
		).toBe('external_ids');
		const noId = {
			...fixture('lookup'),
			imdb_id: null,
			external_ids: { imdb_id: null },
		};
		expect(
			await lookupTitle(492, 'movie', {
				apiKey: 'key',
				fetch: async () => response(noId),
			})
		).toEqual({ status: 'no-imdb', reason: "No IMDb ID, can't add" });
	});
	it('searches multi with adult filtering and skips short queries', async () => {
		const fetcher = vi.fn(async (_input: string | URL | Request) =>
			response(fixture('multi'))
		);
		await searchTitles('Being John Malkovich', {
			apiKey: 'key',
			fetch: fetcher,
		});
		expect(
			new URL(fetcher.mock.calls[0][0] as string).searchParams.get(
				'include_adult'
			)
		).toBe('false');
		expect(await searchTitles('a', { apiKey: 'key', fetch: fetcher })).toEqual(
			[]
		);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it('matches a unique normalized name/year and no-year match from recordings', async () => {
		const fetcher = vi.fn(async (url: string | URL | Request) =>
			response(
				String(url).includes('/search/') ? fixture('movie') : fixture('lookup')
			)
		);
		for (const year of [1999, undefined])
			expect(
				await matchTitle('The Being John Malkovich!', year, {
					apiKey: 'key',
					fetch: fetcher as typeof fetch,
				})
			).toMatchObject({ status: 'matched', title: { imdbId: 'tt0120601' } });
	});
	it('does not confidently choose a year mismatch or two same-name films', async () => {
		const fetcher = async (url: string | URL | Request) =>
			response({
				results: String(url).includes('/search/tv')
					? []
					: fixture('movie').results,
			});
		expect(
			await matchTitle('Being John Malkovich', 2000, {
				apiKey: 'key',
				fetch: fetcher as typeof fetch,
			})
		).toMatchObject({ status: 'ambiguous' });
		expect(
			await matchTitle('Crash', undefined, {
				apiKey: 'key',
				fetch: async () => response(fixture('same-name')),
			})
		).toMatchObject({ status: 'ambiguous' });
	});
	it('falls back to TV only when no movie fits; no IMDb is none with reason', async () => {
		const fetcher = vi.fn(async (url: string | URL | Request) => {
			const path = new URL(String(url)).pathname;
			return response(
				path.endsWith('/search/movie')
					? { results: [] }
					: path.endsWith('/search/tv')
						? fixture('tv')
						: {
								...fixture('lookup'),
								imdb_id: null,
								external_ids: { imdb_id: null },
							}
			);
		});
		expect(
			await matchTitle('Severance', 2022, {
				apiKey: 'key',
				fetch: fetcher as typeof fetch,
			})
		).toEqual({ status: 'none', reason: "No IMDb ID, can't add" });
		expect(fetcher).toHaveBeenCalledTimes(3);
	});
});
describe('explicit Draft additions', () => {
	it('adds, ignores duplicates, restores original sequence, then merges a Source without duplicates', async () => {
		const found = await lookupTitle(492, 'movie', {
			apiKey: 'key',
			fetch: async () => response(fixture('lookup')),
		});
		if (found.status !== 'matched') throw new Error('missing fixture title');
		const list: CombinedList = {
			id: 'test',
			name: 'Test',
			titles: [],
			removed: [],
			sources: [],
			nextSeq: 4,
			version: 1,
			sort: 'added',
			updatedAt: '',
		};
		const first = addTitle(createDraft(list), found.title);
		expect(first.status).toBe('added');
		expect(first.draft.titles[0].addedSeq).toBe(4);
		expect(first.draft.newIds.has(found.title.imdbId)).toBe(true);
		expect(countChanges(list, first.draft)).toBe(1);
		expect(addTitle(first.draft, found.title)).toEqual({
			status: 'duplicate',
			draft: first.draft,
		});
		const removed = { ...list, removed: first.draft.titles, nextSeq: 5 };
		const restored = addTitle(createDraft(removed), found.title);
		expect(restored.status).toBe('restored');
		expect(restored.draft.removed).toEqual([]);
		expect(restored.draft.titles[0].addedSeq).toBe(4);
		expect(restored.draft.nextSeq).toBe(5);
		expect(countChanges(removed, restored.draft)).toBe(1);
		expect(mergeTitles(restored.draft, [found.title]).skippedExisting).toBe(1);
	});
});
describe('discovery API routes', () => {
	it('keeps credentials upstream, skips short queries, and sanitizes failures', async () => {
		const fetcher = vi.fn(async (_input: string | URL | Request) =>
			response(fixture('multi'))
		);
		vi.stubGlobal('fetch', fetcher);
		expect(await (await call(search, undefined, 'a')).json()).toEqual([]);
		expect(fetcher).not.toHaveBeenCalled();
		const data = await (await call(search, undefined, 'Malkovich')).text();
		expect(data).not.toContain('private-key');
		vi.stubGlobal(
			'fetch',
			async () => new Response('private-key', { status: 401 })
		);
		expect(
			await (await call(search, undefined, 'Malkovich')).text()
		).not.toContain('private-key');
	});
	it('validates lookup and returns a clear 422 for missing IMDb', async () => {
		vi.stubGlobal('fetch', async () =>
			response({
				...fixture('lookup'),
				imdb_id: null,
				external_ids: { imdb_id: null },
			})
		);
		expect((await call(lookup, { tmdbId: 0, type: 'person' })).status).toBe(
			400
		);
		const result = await call(lookup, { tmdbId: 492, type: 'movie' });
		expect(result.status).toBe(422);
		expect(await result.json()).toEqual({ error: "No IMDb ID, can't add" });
	});
	it('enforces max 20 lines and reserves search budget while preserving order and automatic lookup candidates', async () => {
		let calls = 0;
		vi.stubGlobal('fetch', async (url: string) => {
			calls++;
			const parsed = new URL(url);
			const name = parsed.searchParams.get('query');
			if (parsed.pathname.endsWith('/search/movie'))
				return response({ results: [] });
			if (parsed.pathname.endsWith('/search/tv'))
				return response({
					results: [
						{
							id: 100 + Number(name?.slice(5)),
							name,
							first_air_date: '2022-01-01',
						},
					],
				});
			return response({
				...fixture('lookup'),
				id: Number(parsed.pathname.split('/').pop()),
				name: `Show ${Number(parsed.pathname.split('/').pop()) - 100}`,
				external_ids: { imdb_id: `tt${parsed.pathname.split('/').pop()}` },
			});
		});
		expect(
			(
				await call(match, {
					lines: Array.from({ length: 21 }, () => ({ name: 'Show' })),
				})
			).status
		).toBe(400);
		expect(calls).toBe(0);
		const result = await call(match, {
			lines: Array.from({ length: 20 }, (_, i) => ({
				name: `Show ${i}`,
				year: 2022,
			})),
		});
		expect(result.status).toBe(200);
		const data = (await result.json()) as Array<{
			status: string;
			title?: { name: string };
			candidate?: { name: string };
		}>;
		expect(data).toHaveLength(20);
		expect(calls).toBeLessThanOrEqual(48);
		expect(data.filter((r) => r.status === 'lookup').length).toBeGreaterThan(0);
		expect(data.map((r) => r.title?.name ?? r.candidate?.name)).toEqual(
			Array.from({ length: 20 }, (_, i) => `Show ${i}`)
		);
	});
});
