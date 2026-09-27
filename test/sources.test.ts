import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectSource, SourceDetectionError } from '../src/sources/detect.ts';
import { fetchMdbList, normalizeMdbListItems } from '../src/sources/mdblist.ts';
import { fetchTrakt, normalizeTraktItems } from '../src/sources/trakt.ts';

function fixture(name: string): unknown {
	const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
	return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function jsonResponse(
	body: unknown,
	headers: Record<string, string> = {}
): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json', ...headers },
	});
}

describe('source URL detection', () => {
	it('recognises both Trakt URL forms and MDBList', () => {
		expect(
			detectSource('https://trakt.tv/users/paul/lists/spy-thrillers')
		).toMatchObject({
			site: 'trakt',
			user: 'paul',
			slug: 'spy-thrillers',
		});
		expect(detectSource('https://trakt.tv/lists/12345')).toMatchObject({
			site: 'trakt',
			listId: '12345',
		});
		expect(
			detectSource('https://mdblist.com/lists/paul/spy-thrillers')
		).toMatchObject({
			site: 'mdblist',
			user: 'paul',
			slug: 'spy-thrillers',
		});
	});

	it('gives a clear error for unsupported URLs', () => {
		expect(() => detectSource('https://example.com/list/1')).toThrow(
			SourceDetectionError
		);
		expect(() => detectSource('https://trakt.tv/movies/arrival')).toThrow(
			/Expected a Trakt list/
		);
	});

	it('drops query strings and fragments from the recorded Source URL', () => {
		expect(
			detectSource(
				'https://trakt.tv/users/paul/lists/spy-thrillers?sort=rank,asc#top'
			).url
		).toBe('https://trakt.tv/users/paul/lists/spy-thrillers');
	});
});

describe('Trakt source normalization', () => {
	it('maps movie/show ids and counts only missing ids', () => {
		const result = normalizeTraktItems(fixture('trakt-page-1.json'));
		expect(result.titles).toEqual([
			{
				imdbId: 'tt2543164',
				type: 'movie',
				name: 'Arrival',
				year: 2016,
				tmdbId: 329865,
			},
			{
				imdbId: 'tt5753856',
				type: 'series',
				name: 'Dark',
				year: 2017,
				tmdbId: 70523,
			},
		]);
		expect(result.skippedNoImdb).toBe(1);
	});

	it('fetches pages using Trakt headers and pagination', async () => {
		const calls: string[] = [];
		const request = async (input: unknown): Promise<Response> => {
			calls.push(String(input));
			return calls.length === 1
				? jsonResponse(fixture('trakt-page-1.json'), {
						'x-pagination-page-count': '2',
					})
				: jsonResponse(fixture('trakt-page-2.json'), {
						'x-pagination-page-count': '2',
					});
		};
		const result = await fetchTrakt(
			'https://trakt.tv/users/paul/lists/spy-thrillers',
			{
				clientId: 'client-id',
				baseUrl: 'https://api.example.test',
				fetch: request,
			}
		);

		expect(calls).toHaveLength(2);
		expect(calls[0]).toContain('page=1');
		expect(calls[1]).toContain('page=2');
		expect(result.titles).toHaveLength(3);
		expect(result.skippedNoImdb).toBe(1);
	});

	it('uses the /lists/{id} endpoint for list-id URLs', async () => {
		let requested = '';
		await fetchTrakt('https://trakt.tv/lists/12345', {
			clientId: 'client-id',
			baseUrl: 'https://api.example.test',
			fetch: async (input) => {
				requested = String(input);
				return jsonResponse([]);
			},
		});
		expect(new URL(requested).pathname).toBe('/lists/12345/items');
	});

	it('counts nameless items separately from missing IMDb ids', () => {
		const result = normalizeTraktItems([
			{ type: 'movie', movie: { title: '', ids: { imdb: 'tt0000010' } } },
			{ type: 'movie', movie: { title: 'No id', ids: { imdb: null } } },
		]);
		expect(result.skippedInvalid).toBe(1);
		expect(result.skippedNoImdb).toBe(1);
	});

	it('has no default size cap, and honours an explicit maxItems', async () => {
		const pageOf = (page: number) =>
			Array.from({ length: 100 }, (_, index) => ({
				type: 'movie',
				movie: {
					title: `Movie ${page}-${index}`,
					ids: { imdb: `tt${page * 1000 + index}` },
				},
			}));
		const request = async (input: unknown): Promise<Response> => {
			const page = Number(new URL(String(input)).searchParams.get('page'));
			return jsonResponse(pageOf(page), { 'x-pagination-page-count': '12' });
		};

		const all = await fetchTrakt('https://trakt.tv/users/paul/lists/big', {
			clientId: 'client-id',
			fetch: request,
		});
		expect(all.titles).toHaveLength(1200);
		expect(all.pages).toBe(12);

		const capped = await fetchTrakt('https://trakt.tv/users/paul/lists/big', {
			clientId: 'client-id',
			fetch: request,
			maxItems: 150,
		});
		expect(capped.titles).toHaveLength(150);
		expect(capped.pages).toBe(2);
	});
});

describe('MDBList source normalization', () => {
	it('handles the recorded object response shape', () => {
		const result = normalizeMdbListItems(fixture('mdblist-items.json'));
		expect(result.titles.map((item) => [item.imdbId, item.type])).toEqual([
			['tt2543164', 'movie'],
			['tt5753856', 'series'],
		]);
		expect(result.skippedNoImdb).toBe(1);
	});

	it('fetches an MDBList array response and supplies the API key as a query parameter', async () => {
		let requested = '';
		const request = async (input: unknown): Promise<Response> => {
			requested = String(input);
			return jsonResponse([
				{
					imdb_id: 'tt2543164',
					title: 'Arrival',
					year: 2016,
					mediatype: 'movie',
				},
			]);
		};
		const result = await fetchMdbList(
			'https://mdblist.com/lists/paul/spy-thrillers',
			{
				apiKey: 'secret-key',
				baseUrl: 'https://api.example.test',
				fetch: request,
			}
		);

		expect(new URL(requested).searchParams.get('apikey')).toBe('secret-key');
		expect(result.titles[0].imdbId).toBe('tt2543164');
	});

	it('follows the current cursor based movies/shows response', async () => {
		const calls: string[] = [];
		const request = async (input: unknown): Promise<Response> => {
			calls.push(String(input));
			return calls.length === 1
				? jsonResponse({
						movies: [
							{
								imdb_id: 'tt2543164',
								title: 'Arrival',
								release_year: 2016,
								mediatype: 'movie',
							},
						],
						shows: [],
						pagination: { next_cursor: 'next-page', has_more: true },
					})
				: jsonResponse({
						movies: [],
						shows: [
							{
								imdb_id: 'tt5753856',
								title: 'Dark',
								release_year: 2017,
								mediatype: 'show',
							},
						],
						pagination: { next_cursor: null, has_more: false },
					});
		};
		const result = await fetchMdbList(
			'https://mdblist.com/lists/paul/spy-thrillers',
			{
				apiKey: 'secret-key',
				baseUrl: 'https://api.example.test',
				fetch: request,
			}
		);

		expect(calls).toHaveLength(2);
		expect(calls[1]).toContain('cursor=next-page');
		expect(result.titles.map((item) => item.imdbId)).toEqual([
			'tt2543164',
			'tt5753856',
		]);
	});

	it('advances offset for the legacy X-Has-More array response', async () => {
		const items = [
			{ imdb_id: 'tt0000001', title: 'One', mediatype: 'movie' },
			{ imdb_id: 'tt0000002', title: 'Two', mediatype: 'movie' },
		];
		const calls: string[] = [];
		const request = async (input: unknown): Promise<Response> => {
			calls.push(String(input));
			const offset = Number(
				new URL(String(input)).searchParams.get('offset') ?? 0
			);
			return jsonResponse(items.slice(offset, offset + 1), {
				'x-has-more': String(offset + 1 < items.length),
			});
		};
		const result = await fetchMdbList(
			'https://mdblist.com/lists/paul/spy-thrillers',
			{ apiKey: 'secret-key', fetch: request, pageSize: 1 }
		);

		expect(result.titles.map((item) => item.imdbId)).toEqual([
			'tt0000001',
			'tt0000002',
		]);
		expect(new URL(calls[0]).searchParams.has('offset')).toBe(false);
		expect(new URL(calls[1]).searchParams.get('offset')).toBe('1');
	});

	it('raises an error instead of truncating when a page repeats', async () => {
		const request = async (): Promise<Response> =>
			jsonResponse([{ imdb_id: 'tt0000001', title: 'One' }], {
				'x-has-more': 'true',
			});
		await expect(
			fetchMdbList('https://mdblist.com/lists/paul/spy-thrillers', {
				apiKey: 'secret-key',
				fetch: request,
				pageSize: 1,
			})
		).rejects.toThrow(/same page twice/);
	});

	it('types shows-bucket items as series when they omit a media type', () => {
		const result = normalizeMdbListItems({
			movies: [{ imdb_id: 'tt0000001', title: 'Film' }],
			shows: [{ imdb_id: 'tt0000002', title: 'Show' }],
		});
		expect(result.titles.map((item) => item.type)).toEqual(['movie', 'series']);
	});

	it('keeps long string TMDB ids intact and parses date-string years', () => {
		const result = normalizeMdbListItems([
			{
				imdb_id: 'tt0000001',
				title: 'Long id',
				tmdb_id: '1234567',
				release_year: '2019-04-01',
			},
		]);
		expect(result.titles[0]).toMatchObject({ tmdbId: 1234567, year: 2019 });
	});
});
