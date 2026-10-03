import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	blurbFromTmdb,
	ratingFromTmdb,
	enrichTitle,
	enrichTitles,
} from '../src/tmdb/enrich.ts';
import type { Title } from '../src/domain/types.ts';

function fixture(name: string): unknown {
	const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
	return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

const baseTitle: Title = {
	imdbId: 'tt2543164',
	type: 'movie',
	name: 'Arrival',
	year: null,
	poster: null,
	blurb: null,
	tmdbId: 329865,
	addedSeq: 0,
};

function response(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

describe('TMDB enrichment', () => {
	it('uses details by TMDB id and builds a full poster URL', async () => {
		let requested = '';
		const enriched = await enrichTitle(baseTitle, {
			apiKey: 'v3-key',
			baseUrl: 'https://api.example.test/3',
			fetch: async (input) => {
				requested = String(input);
				return response(fixture('tmdb-movie.json'));
			},
		});

		expect(requested).toContain('/movie/329865');
		expect(requested).toContain('api_key=v3-key');
		expect(enriched.poster).toBe(
			'https://image.tmdb.org/t/p/w342/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg'
		);
		expect(enriched.year).toBe(2016);
		expect(enriched.rating).toBe(7.6);
		expect(enriched.blurb).toBe(
			'A linguist works with the military to communicate with alien lifeforms.'
		);
	});

	it('resolves an IMDb id with /find, then reads details for the tagline', async () => {
		const calls: string[] = [];
		const enriched = await enrichTitle(
			{ ...baseTitle, tmdbId: null },
			{
				apiKey: 'v3-key',
				baseUrl: 'https://api.example.test/3',
				fetch: async (input) => {
					calls.push(String(input));
					return String(input).includes('/find/')
						? response(fixture('tmdb-find.json'))
						: response(fixture('tmdb-movie.json'));
				},
			}
		);

		expect(calls).toHaveLength(2);
		expect(calls[0]).toContain('/find/tt2543164');
		expect(calls[0]).toContain('external_source=imdb_id');
		expect(calls[1]).toContain('/movie/329865');
		expect(enriched.tmdbId).toBe(329865);
		expect(enriched.year).toBe(2016);
		expect(enriched.blurb).toBe(
			'A linguist works with the military to communicate with alien lifeforms.'
		);
	});

	it('enriches from recorded live TMDB responses', async () => {
		const options = {
			apiKey: 'v3-key',
			baseUrl: 'https://api.example.test/3',
			fetch: async (input: unknown) => {
				const url = String(input);
				if (url.includes('/find/'))
					return response(fixture('tmdb-find-live.json'));
				if (url.includes('/tv/')) return response(fixture('tmdb-tv-live.json'));
				return response(fixture('tmdb-movie-live.json'));
			},
		};

		const movie = await enrichTitle(
			{ ...baseTitle, imdbId: 'tt0120915', name: 'Episode I', tmdbId: null },
			options
		);
		expect(movie).toMatchObject({
			tmdbId: 1893,
			year: 1999,
			poster: 'https://image.tmdb.org/t/p/w342/6wkfovpn7Eq8dYNKaG5PY3q2oq6.jpg',
			blurb: expect.stringMatching(/^Anakin Skywalker, a young slave/),
		});

		const series = await enrichTitle(
			{
				...baseTitle,
				imdbId: 'tt12262202',
				type: 'series',
				name: 'The Acolyte',
				tmdbId: 114479,
			},
			options
		);
		expect(series).toMatchObject({
			year: 2024,
			poster: 'https://image.tmdb.org/t/p/w342/mztdt3y6GBsJR69zHtszFezTCLT.jpg',
			blurb: expect.stringMatching(/^A hundred years before the rise/),
		});
	});

	it('falls back to the /find result when the details request fails', async () => {
		const enriched = await enrichTitle(
			{ ...baseTitle, tmdbId: null },
			{
				apiKey: 'v3-key',
				fetch: async (input) =>
					String(input).includes('/find/')
						? response(fixture('tmdb-find.json'))
						: new Response('unavailable', { status: 503 }),
			}
		);
		expect(enriched.tmdbId).toBe(329865);
		expect(enriched.blurb).toBe(
			'A linguist works with the military. A second sentence.'
		);
		expect(enriched.rating).toBeNull();
	});

	it('sends a v4 read token as a bearer header, not a query parameter', async () => {
		let requested = '';
		let authorization: string | null = null;
		await enrichTitle(baseTitle, {
			apiKey: 'eyJv4-token',
			fetch: async (input, init) => {
				requested = String(input);
				authorization = new Headers(init?.headers).get('authorization');
				return response(fixture('tmdb-movie.json'));
			},
		});
		expect(authorization).toBe('Bearer eyJv4-token');
		expect(requested).not.toContain('api_key');
	});

	it('raises an invalid key instead of silently leaving Titles unenriched', async () => {
		await expect(
			enrichTitle(baseTitle, {
				apiKey: 'bad-key',
				fetch: async () => new Response('invalid key', { status: 401 }),
			})
		).rejects.toThrow(/401/);
	});

	it('limits concurrent requests and keeps input order', async () => {
		let inFlight = 0;
		let peak = 0;
		const titles = Array.from({ length: 20 }, (_, index) => ({
			...baseTitle,
			tmdbId: index + 1,
			addedSeq: index,
		}));
		const enriched = await enrichTitles(titles, {
			apiKey: 'v3-key',
			concurrency: 3,
			fetch: async (input) => {
				inFlight += 1;
				peak = Math.max(peak, inFlight);
				await new Promise((resolve) => setTimeout(resolve, 1));
				inFlight -= 1;
				const id = Number(/\/movie\/(\d+)/.exec(String(input))?.[1]);
				return response({ id, title: `Movie ${id}` });
			},
		});
		expect(peak).toBe(3);
		expect(enriched.map((title) => title.tmdbId)).toEqual(
			titles.map((title) => title.tmdbId)
		);
	});

	it('prefers the overview, falls back to the tagline, else null', () => {
		expect(
			blurbFromTmdb({ tagline: 'A tagline', overview: 'First. Second.' })
		).toBe('First. Second.');
		expect(blurbFromTmdb({ tagline: 'A tagline', overview: '' })).toBe(
			'A tagline'
		);
		expect(blurbFromTmdb({ tagline: '', overview: '' })).toBeNull();
	});

	it('rounds the vote average and ignores unrated Titles', () => {
		expect(ratingFromTmdb({ vote_average: 6.849, vote_count: 12 })).toBe(6.8);
		expect(ratingFromTmdb({ vote_average: 0, vote_count: 0 })).toBeNull();
		expect(ratingFromTmdb({ vote_average: 8, vote_count: 0 })).toBeNull();
		expect(ratingFromTmdb({})).toBeNull();
	});

	it('leaves a Title intact when TMDB is unavailable', async () => {
		const result = await enrichTitle(baseTitle, {
			apiKey: 'v3-key',
			fetch: async () => new Response('unavailable', { status: 503 }),
		});
		expect(result).toEqual(baseTitle);
	});
});
