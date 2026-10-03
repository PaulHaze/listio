import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIContext, APIRoute } from 'astro';
import type { CombinedList } from '../src/domain/types.ts';

const values = new Map<string, string>();
const kv = {
	async get(key: string, type?: string) {
		const value = values.get(key);
		return value === undefined
			? null
			: type === 'json'
				? JSON.parse(value)
				: value;
	},
	async put(key: string, value: string) {
		values.set(key, value);
	},
	async delete(key: string) {
		values.delete(key);
	},
};
vi.mock('cloudflare:workers', () => ({
	env: { LISTIO: kv, ADDON_SECRET: 'right' },
}));
const { POST } = await import('../src/pages/api/lists/index.ts');
const { GET, PATCH, DELETE } = await import('../src/pages/api/lists/[id].ts');
const { GET: manifest } =
	await import('../src/pages/addon/[secret]/manifest.json.ts');

function call(route: APIRoute, method: string, id?: string, body?: unknown) {
	return route({
		params: { id, secret: 'right' },
		request: new Request('https://listio.test/api/lists', {
			method,
			...(body !== undefined ? { body: JSON.stringify(body) } : {}),
		}),
	} as unknown as APIContext) as Promise<Response>;
}
async function create(name = 'Weekend favourites'): Promise<CombinedList> {
	const response = await call(POST, 'POST', undefined, { name });
	expect(response.status).toBe(201);
	return response.json();
}

beforeEach(() => {
	values.clear();
});

describe('Combined List API', () => {
	it('creates a persisted empty Combined List with newest sort and -2 duplicate id', async () => {
		const list = await create('  Weekend favourites  ');
		expect(list).toMatchObject({
			id: 'weekend-favourites',
			name: 'Weekend favourites',
			sort: 'newest',
			titles: [],
			sources: [],
			removed: [],
			nextSeq: 0,
			version: 1,
		});
		expect(list.updatedAt).toMatch(/^\d{4}-/);
		expect(await (await call(GET, 'GET', list.id)).json()).toEqual(list);
		expect((await create()).id).toBe('weekend-favourites-2');
		expect(JSON.parse(values.get('index')!)).toHaveLength(2);
	});

	it('avoids ids reserved only in the index or only by a list key', async () => {
		const list = await create();
		values.delete(`list:${list.id}`);
		expect((await create()).id).toBe('weekend-favourites-2');
		values.set('index', '[]');
		values.set(`list:${list.id}`, JSON.stringify(list));
		expect((await create()).id).toBe('weekend-favourites-3');
	});

	it('renames only the display name, preserves Titles and stable catalog ids, and deletes from the manifest', async () => {
		const list = await create();
		list.titles.push({
			imdbId: 'tt1',
			type: 'movie',
			name: 'A Title',
			year: 2000,
			poster: null,
			blurb: null,
			tmdbId: null,
			addedSeq: 0,
		});
		list.nextSeq = 1;
		values.set(`list:${list.id}`, JSON.stringify(list));
		const renamed = await call(PATCH, 'PATCH', list.id, {
			name: '  New name  ',
			id: 'changed-id',
			titles: [],
			sort: 'az',
		});
		expect(renamed.status).toBe(200);
		expect(await renamed.json()).toMatchObject({
			...list,
			name: 'New name',
			version: 2,
			updatedAt: expect.any(String),
		});
		const addon = (await (await call(manifest, 'GET')).json()) as {
			catalogs: unknown[];
		};
		expect(addon.catalogs).toEqual([
			{
				type: 'movie',
				id: list.id,
				name: 'New name',
				extra: [{ name: 'skip' }],
			},
		]);
		expect((await call(DELETE, 'DELETE', list.id)).status).toBe(204);
		expect(values.has(`list:${list.id}`)).toBe(false);
		expect(await (await call(manifest, 'GET')).json()).toMatchObject({
			catalogs: [],
		});
		expect((await call(GET, 'GET', list.id)).status).toBe(404);
	});

	it('rejects malformed and blank names without writing and returns 404 for missing lists', async () => {
		for (const body of [null, {}, { name: 1 }, { name: '' }, { name: '  ' }]) {
			expect((await call(POST, 'POST', undefined, body)).status).toBe(400);
			expect((await call(PATCH, 'PATCH', 'missing', body)).status).toBe(400);
		}
		const response = await POST({
			request: new Request('https://listio.test/api/lists', {
				method: 'POST',
				body: '{bad',
			}),
		} as APIContext);
		expect(response.status).toBe(400);
		expect(values.size).toBe(0);
		expect(
			(await call(PATCH, 'PATCH', 'missing', { name: 'Valid' })).status
		).toBe(404);
		expect((await call(DELETE, 'DELETE', 'missing')).status).toBe(404);
		expect(
			(await call(GET, 'GET', 'missing')).headers.get('Cache-Control')
		).toBe('no-store');
	});
});
