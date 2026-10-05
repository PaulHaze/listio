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
const { POST, GET: index } = await import('../src/pages/api/lists/index.ts');
const { GET, PATCH, PUT, DELETE } =
	await import('../src/pages/api/lists/[id].ts');
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
	it('returns the saved list index for import name checks and reconciliation', async () => {
		expect(await (await call(index, 'GET')).json()).toEqual([]);
		const list = await create();
		expect(await (await call(index, 'GET')).json()).toEqual([
			{ id: list.id, name: list.name, count: 0, types: [] },
		]);
	});
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
				showInHome: false,
				extra: [
					{ name: 'genre', isRequired: true, options: ['All'] },
					{ name: 'skip' },
				],
			},
		]);
		expect((await call(DELETE, 'DELETE', list.id)).status).toBe(204);
		expect(values.has(`list:${list.id}`)).toBe(false);
		expect(await (await call(manifest, 'GET')).json()).toMatchObject({
			catalogs: [],
		});
		expect((await call(GET, 'GET', list.id)).status).toBe(404);
	});

	it('keeps lists off Nuvio home until shown, and a Draft save keeps the setting', async () => {
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
		const catalogs = async () =>
			((await (await call(manifest, 'GET')).json()) as { catalogs: unknown[] })
				.catalogs;
		for (const body of [{ showOnHome: 'yes' }, { showOnHome: null }])
			expect((await call(PATCH, 'PATCH', list.id, body)).status).toBe(400);
		const shown = await call(PATCH, 'PATCH', list.id, { showOnHome: true });
		expect(await shown.json()).toMatchObject({
			name: list.name,
			showOnHome: true,
			version: 2,
		});
		expect(await catalogs()).toEqual([
			{
				type: 'movie',
				id: list.id,
				name: list.name,
				extra: [{ name: 'skip' }],
			},
		]);
		const saved = await call(PUT, 'PUT', list.id, {
			version: 2,
			sort: 'az',
			titles: list.titles,
			removed: [],
			sources: [],
		});
		expect(await saved.json()).toMatchObject({ showOnHome: true, sort: 'az' });
		await call(PATCH, 'PATCH', list.id, { showOnHome: false });
		expect(await catalogs()).toEqual([
			expect.objectContaining({ id: list.id, showInHome: false }),
		]);
	});

	it('saves a full Draft, updates catalogs, and rejects stale versions without losing data', async () => {
		const list = await create();
		const title = {
			imdbId: 'tt123',
			type: 'movie',
			name: 'Saved Title',
			year: 2020,
			poster: null,
			blurb: null,
			tmdbId: 123,
			addedSeq: 9,
		};
		const body = {
			...list,
			id: 'malicious-id',
			titles: [title],
			sort: 'az',
			nextSeq: 0,
		};
		const response = await call(PUT, 'PUT', list.id, body);
		expect(response.status).toBe(200);
		const saved = await response.json();
		expect(saved).toMatchObject({
			id: list.id,
			version: 2,
			nextSeq: 10,
			titles: [title],
			sort: 'az',
		});
		expect(await (await call(GET, 'GET', list.id)).json()).toEqual(saved);
		expect(JSON.parse(values.get('index')!)[0]).toMatchObject({
			count: 1,
			types: ['movie'],
		});
		expect((await call(PUT, 'PUT', list.id, body)).status).toBe(409);
		expect(await (await call(GET, 'GET', list.id)).json()).toEqual(saved);
	});

	it('rejects malformed Drafts and missing lists without writing', async () => {
		const list = await create();
		const before = [...values];
		const title = {
			imdbId: 'tt123',
			type: 'movie',
			name: 'Title',
			year: null,
			poster: null,
			blurb: null,
			tmdbId: null,
			addedSeq: 0,
		};
		for (const body of [
			null,
			{},
			{ ...list, version: 0 },
			{ ...list, sort: 'invalid' },
			{ ...list, titles: [{ ...title, imdbId: 'bad' }] },
			{ ...list, titles: [title, title] },
			{ ...list, titles: [title], removed: [title] },
			{ ...list, sources: [{}] },
			{ ...list, titles: [{ ...title, addedSeq: Number.MAX_SAFE_INTEGER }] },
		]) {
			expect((await call(PUT, 'PUT', list.id, body)).status).toBe(400);
			expect([...values]).toEqual(before);
		}
		expect((await call(PUT, 'PUT', 'missing', list)).status).toBe(404);
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

	it('rejects names over 100 characters without writing', async () => {
		const long = 'a'.repeat(101);
		expect((await call(POST, 'POST', undefined, { name: long })).status).toBe(
			400
		);
		expect(values.size).toBe(0);
		const list = await create('a'.repeat(100));
		expect((await call(PATCH, 'PATCH', list.id, { name: long })).status).toBe(
			400
		);
		expect(JSON.parse(values.get(`list:${list.id}`)!).name).toHaveLength(100);
	});

	it('deletes an index entry whose list write never landed', async () => {
		const list = await create();
		values.delete(`list:${list.id}`);
		expect((await call(DELETE, 'DELETE', list.id)).status).toBe(204);
		expect(JSON.parse(values.get('index')!)).toEqual([]);
		expect((await call(DELETE, 'DELETE', list.id)).status).toBe(404);
	});

	it('finishes a delete whose index write failed', async () => {
		const list = await create();
		const put = kv.put;
		kv.put = async () => {
			throw new Error('KV unavailable');
		};
		try {
			expect((await call(DELETE, 'DELETE', list.id)).status).toBe(500);
		} finally {
			kv.put = put;
		}
		expect(values.has(`list:${list.id}`)).toBe(false);
		expect((await call(DELETE, 'DELETE', list.id)).status).toBe(204);
		expect(JSON.parse(values.get('index')!)).toEqual([]);
	});
});
