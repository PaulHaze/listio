import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { blurbFromTmdb, enrichTitle } from '../src/tmdb/enrich.ts';
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
			'https://image.tmdb.org/t/p/w185/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg'
		);
		expect(enriched.year).toBe(2016);
		expect(enriched.blurb).toBe('Why are they here?');
	});

	it('uses the IMDb find endpoint when a Title has no TMDB id', async () => {
		const calls: string[] = [];
		const enriched = await enrichTitle(
			{ ...baseTitle, tmdbId: null },
			{
				apiKey: 'v3-key',
				baseUrl: 'https://api.example.test/3',
				fetch: async (input) => {
					calls.push(String(input));
					return response(fixture('tmdb-find.json'));
				},
			}
		);

		expect(calls[0]).toContain('/find/tt2543164');
		expect(calls[0]).toContain('external_source=imdb_id');
		expect(enriched.tmdbId).toBe(329865);
		expect(enriched.year).toBe(2016);
		expect(enriched.blurb).toBe('A linguist works with the military.');
	});

	it('prefers a tagline and returns null for empty metadata', () => {
		expect(
			blurbFromTmdb({ tagline: 'A tagline', overview: 'First. Second.' })
		).toBe('A tagline');
		expect(blurbFromTmdb({ tagline: '', overview: '' })).toBeNull();
	});

	it('leaves a Title intact when TMDB is unavailable', async () => {
		const result = await enrichTitle(baseTitle, {
			apiKey: 'v3-key',
			fetch: async () => new Response('unavailable', { status: 503 }),
		});
		expect(result).toEqual(baseTitle);
	});
});
