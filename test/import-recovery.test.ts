import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { APIContext, APIRoute } from 'astro';
import { ImportListRun } from '../src/client/importList.ts';
import { pasteLines } from '../src/domain/pasteLines.ts';
import type { CombinedList } from '../src/domain/types.ts';

const values = new Map<string, string>();
let failKey = '';
let hideMutable = false;
const writes: string[] = [];
const kv = {
	async get(key: string) {
		if (hideMutable && (key.startsWith('list:') || key.startsWith('initial:')))
			return null;
		const value = values.get(key);
		return value ? JSON.parse(value) : null;
	},
	async put(key: string, value: string) {
		writes.push(key);
		if (failKey && key.startsWith(failKey)) {
			failKey = '';
			throw new Error('One-off KV failure');
		}
		values.set(key, value);
	},
	async delete(key: string) {
		values.delete(key);
	},
};
vi.mock('cloudflare:workers', () => ({ env: { LISTIO: kv } }));
const { POST, GET: index } = await import('../src/pages/api/lists/index.ts');
const { GET, PUT, DELETE } = await import('../src/pages/api/lists/[id].ts');
const title = {
	imdbId: 'tt123',
	type: 'movie',
	name: 'Brick',
	year: 2005,
	tmdbId: 1,
	poster: null,
	blurb: null,
	addedSeq: 0,
};
function call(route: APIRoute, method: string, body?: unknown, id?: string) {
	return route({
		params: { id },
		request: new Request('https://listio.test/api/lists', {
			method,
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		}),
	} as unknown as APIContext) as Promise<Response>;
}
beforeEach(() => {
	values.clear();
	writes.length = 0;
	failKey = '';
	hideMutable = false;
});
afterEach(() => vi.unstubAllGlobals());
it.each(['index', 'initial:'])(
	'continues after a failure writing %s through real routes and storage',
	async (boundary) => {
		let matches = 0;
		const creates: unknown[] = [];
		vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
			if (url.endsWith('/match')) {
				matches++;
				return new Response(JSON.stringify([{ status: 'matched', title }]));
			}
			const body = init.body ? JSON.parse(init.body as string) : undefined;
			if (url === '/api/lists') {
				if (init.method === 'POST') {
					creates.push(body);
					return call(POST, 'POST', body);
				}
				return call(index, 'GET');
			}
			return call(
				init.method === 'PUT' ? PUT : GET,
				init.method!,
				body,
				url.split('/').pop()
			);
		});
		failKey = boundary;
		const run = new ImportListRun('Test', pasteLines('Brick (2005)'));
		await run.continue(new AbortController().signal);
		expect(run.state.phase).toBe('stopped');
		expect(run.state.list).toBeNull();
		expect(values.has('index')).toBe(boundary === 'initial:');
		await run.continue(new AbortController().signal);
		expect(run.state.phase).toBe('completed');
		expect(run.state.list?.titles).toHaveLength(1);
		expect(matches).toBe(1);
		expect(creates).toHaveLength(2);
		expect(creates[0]).toEqual(creates[1]);
		const entries = JSON.parse(values.get('index')!);
		expect(entries).toHaveLength(1);
		expect(entries[0].count).toBe(1);
		expect((await call(GET, 'GET', undefined, entries[0].id)).status).toBe(200);
	}
);
it('replays creation without overwriting saved Titles even when the mutable record is temporarily invisible', async () => {
	const body = { name: 'Test', creationId: crypto.randomUUID() };
	const initial: CombinedList = await (await call(POST, 'POST', body)).json();
	await call(PUT, 'PUT', { ...initial, titles: [title] }, initial.id);
	const saved = values.get(`list:${initial.id}`);
	hideMutable = true;
	expect((await call(POST, 'POST', body)).status).toBe(201);
	hideMutable = false;
	expect(values.get(`list:${initial.id}`)).toBe(saved);
	expect(
		(
			(await (
				await call(GET, 'GET', undefined, initial.id)
			).json()) as CombinedList
		).titles
	).toHaveLength(1);
	await call(DELETE, 'DELETE', undefined, initial.id);
	expect((await call(GET, 'GET', undefined, initial.id)).status).toBe(404);
});
it('rejects unrelated existing names and IDs rather than filling their lists', async () => {
	const existing: CombinedList = await (
		await call(POST, 'POST', { name: 'Test' })
	).json();
	const before = [...values];
	expect(
		(
			await call(POST, 'POST', {
				name: ' test ',
				creationId: crypto.randomUUID(),
			})
		).status
	).toBe(409);
	expect([...values]).toEqual(before);
	const token = crypto.randomUUID();
	values.set(
		`list:import-${token}`,
		JSON.stringify({ ...existing, id: `import-${token}` })
	);
	expect(
		(await call(POST, 'POST', { name: 'Other', creationId: token })).status
	).toBe(409);
	expect(JSON.parse(values.get(`list:import-${token}`)!).titles).toEqual([]);
});
