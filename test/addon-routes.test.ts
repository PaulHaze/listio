import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIContext } from 'astro';
import type { CombinedList } from '../src/domain/types.ts';

const values = new Map<string, string>();
const kv = {
	async get(key: string, type?: string) {
		const value = values.get(key);
		if (value === undefined) return null;
		return type === 'json' ? JSON.parse(value) : value;
	},
};

vi.mock('cloudflare:workers', () => ({
	env: { ADDON_SECRET: 'right', LISTIO: kv },
}));

const { GET: manifest } = await import(
	'../src/pages/addon/[secret]/manifest.json.ts'
);
const { GET: catalog } = await import(
	'../src/pages/addon/[secret]/catalog/[type]/[...rest].ts'
);

function call(
	route: typeof manifest,
	params: Record<string, string | undefined>
): Promise<Response> {
	return route({ params } as unknown as APIContext) as Promise<Response>;
}

const list: CombinedList = {
	id: 'proof',
	name: 'Proof',
	sort: 'added',
	sources: [],
	titles: [
		{
			imdbId: 'tt1',
			type: 'movie',
			name: 'One',
			year: 2001,
			poster: null,
			blurb: null,
			tmdbId: null,
			addedSeq: 0,
		},
	],
	removed: [],
	nextSeq: 1,
	version: 1,
	updatedAt: '',
};

beforeEach(() => {
	values.clear();
	values.set(`list:${list.id}`, JSON.stringify(list));
	values.set(
		'index',
		JSON.stringify([{ id: 'proof', name: 'Proof', count: 1, types: ['movie'] }])
	);
});

describe('addon routes', () => {
	it('serves the manifest only for the right secret', async () => {
		const ok = await call(manifest, { secret: 'right' });
		expect(ok.status).toBe(200);
		expect(((await ok.json()) as { catalogs: unknown[] }).catalogs).toHaveLength(
			1
		);
		expect((await call(manifest, { secret: 'wrong' })).status).toBe(404);
	});

	it('checks the secret before parsing the path', async () => {
		const response = await call(catalog, {
			secret: 'wrong',
			type: 'movie',
			rest: 'proof.json',
		});
		expect(response.status).toBe(404);
		const malformed = await call(catalog, {
			secret: 'wrong',
			type: 'movie',
			rest: 'not-a-path',
		});
		expect(malformed.status).toBe(404);
	});

	it('404s a malformed path but returns empty metas for unknown list or type', async () => {
		expect(
			(await call(catalog, { secret: 'right', type: 'movie', rest: 'x' }))
				.status
		).toBe(404);
		for (const params of [
			{ type: 'movie', rest: 'missing.json' },
			{ type: 'anime', rest: 'proof.json' },
			{ type: 'series', rest: 'proof/skip=100.json' },
		]) {
			const response = await call(catalog, { secret: 'right', ...params });
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ metas: [] });
		}
	});

	it('serves a catalog page', async () => {
		const response = await call(catalog, {
			secret: 'right',
			type: 'movie',
			rest: 'proof.json',
		});
		expect(await response.json()).toEqual({
			metas: [{ id: 'tt1', type: 'movie', name: 'One', poster: null }],
		});
	});
});
