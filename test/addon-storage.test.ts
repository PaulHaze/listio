import { describe, expect, it } from 'vitest';
import type { CombinedList, Title } from '../src/domain/types.ts';
import {
	deleteList,
	getIndex,
	getList,
	putList,
	VersionConflictError,
	type ListStore,
} from '../src/storage/lists.ts';
import { buildManifest } from '../src/addon/manifest.ts';
import { buildCatalog, parseCatalogPath } from '../src/addon/catalog.ts';
import {
	addonNotFound,
	addonResponse,
	validSecret,
} from '../src/addon/http.ts';

function memoryStore() {
	const values = new Map<string, string>();
	return {
		values,
		kv: {
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
		} as unknown as ListStore,
	};
}
function title(seq: number, type: 'movie' | 'series' = 'movie'): Title {
	return {
		imdbId: `tt${seq}`,
		type,
		name: `Title ${seq}`,
		year: 2000 + seq,
		poster: `https://image.tmdb.org/t/p/w185/${seq}.jpg`,
		blurb: null,
		tmdbId: seq + 1,
		addedSeq: seq,
	};
}
function list(): CombinedList {
	return {
		id: 'test',
		name: 'Test',
		sort: 'added',
		sources: [],
		titles: [],
		removed: [],
		nextSeq: 0,
		version: 0,
		updatedAt: '',
	};
}

describe('KV repository', () => {
	it('creates, saves, updates its index in place, rejects stale versions and deletes', async () => {
		const { kv, values } = memoryStore();
		expect(await getList(kv, 'missing')).toBeNull();
		expect(await getIndex(kv)).toEqual([]);
		const saved = await putList(kv, {
			...list(),
			titles: [title(1), title(2, 'series')],
			removed: [title(3)],
		});
		expect(saved.version).toBe(1);
		expect(saved.updatedAt).toMatch(/^\d{4}-/);
		expect(await getIndex(kv)).toEqual([
			{ id: 'test', name: 'Test', count: 2, types: ['movie', 'series'] },
		]);
		expect(await getList(kv, 'test')).toEqual(saved);
		await expect(putList(kv, list())).rejects.toBeInstanceOf(
			VersionConflictError
		);
		expect(await getList(kv, 'test')).toEqual(saved);
		await putList(kv, {
			...saved,
			name: 'Renamed',
			titles: [title(2, 'series')],
		});
		expect(await getIndex(kv)).toEqual([
			{ id: 'test', name: 'Renamed', count: 1, types: ['series'] },
		]);
		await putList(kv, { ...list(), id: 'other' });
		await deleteList(kv, 'test');
		expect(values.has('list:test')).toBe(false);
		expect((await getIndex(kv)).map((entry) => entry.id)).toEqual(['other']);
		await deleteList(kv, 'missing');
		expect((await getIndex(kv)).length).toBe(1);
	});
	it('rejects an invalid version for a new list before writing', async () => {
		const { kv, values } = memoryStore();
		await expect(putList(kv, { ...list(), version: 3 })).rejects.toBeInstanceOf(
			VersionConflictError
		);
		expect(values.size).toBe(0);
	});
});

describe('addon protocol', () => {
	it('advertises only present types, stable IDs, pagination and required manifest metadata', () => {
		const manifest = buildManifest([
			{ id: 'mixed', name: 'Mixed', count: 2, types: ['movie', 'series'] },
			{ id: 'empty', name: 'Empty', count: 0, types: [] },
		]);
		expect(manifest).toMatchObject({
			id: 'com.paulhaze.listio',
			version: '0.0.1',
			resources: ['catalog'],
			types: ['movie', 'series'],
		});
		expect(manifest.catalogs).toEqual(
			['movie', 'series'].map((type) => ({
				type,
				id: 'mixed',
				name: 'Mixed',
				extra: [{ name: 'skip' }],
			}))
		);
	});
	it('filters before paging, sorts, excludes Removed and preserves metadata without mutation', () => {
		const movies = Array.from({ length: 205 }, (_, seq) => title(seq));
		const mixed = {
			...list(),
			titles: [...movies.reverse(), title(500, 'series')],
			removed: [title(600)],
		};
		expect(buildCatalog(mixed, 'movie').metas).toHaveLength(100);
		expect(
			buildCatalog(mixed, 'movie', 100).metas.map((meta) => meta.id)
		).toEqual(Array.from({ length: 100 }, (_, seq) => `tt${seq + 100}`));
		expect(buildCatalog(mixed, 'movie', 200).metas).toHaveLength(5);
		expect(buildCatalog(mixed, 'movie', 300).metas).toEqual([]);
		expect(buildCatalog(mixed, 'series').metas).toEqual([
			{
				id: 'tt500',
				type: 'series',
				name: 'Title 500',
				poster: 'https://image.tmdb.org/t/p/w185/500.jpg',
			},
		]);
		expect(
			buildCatalog({ ...mixed, sort: 'newest' }, 'movie').metas[0].id
		).toBe('tt204');
		expect(
			buildCatalog({ ...mixed, sort: 'oldest' }, 'movie').metas[0].id
		).toBe('tt0');
		expect(mixed.titles[0].imdbId).toBe('tt204');
		expect(buildCatalog(null, 'movie').metas).toEqual([]);
		expect(buildCatalog(mixed, 'unknown').metas).toEqual([]);
		expect(buildCatalog(mixed, 'movie', -1).metas).toEqual([]);
	});
	it('parses only valid catalog paths and safe pagination', () => {
		expect(parseCatalogPath('test.json')).toEqual({ id: 'test', skip: 0 });
		expect(parseCatalogPath('test/skip=100.json')).toEqual({
			id: 'test',
			skip: 100,
		});
		for (const path of [
			'test/skip=-1.json',
			'test/skip=abc.json',
			'test/skip=1.5.json',
			'test/skip=9007199254740992.json',
			'test/extra.json',
			'test',
		])
			expect(parseCatalogPath(path)).toBeNull();
	});
	it('checks equal, unequal, empty and absent secrets and sets headers on errors too', () => {
		expect(validSecret('secret', 'secret')).toBe(true);
		expect(validSecret('secrex', 'secret')).toBe(false);
		expect(validSecret('short', 'a much longer secret')).toBe(false);
		expect(validSecret('', '')).toBe(false);
		expect(validSecret(undefined, undefined)).toBe(false);
		for (const response of [addonResponse({ metas: [] }), addonNotFound()]) {
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
			expect(response.headers.get('Cache-Control')).toBe('max-age=60');
		}
		expect(addonNotFound().status).toBe(404);
	});
});
