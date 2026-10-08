import { describe, expect, it } from 'vitest';
import reference from '../docs/nuvio/collection-reference.json';
import { resolveAddonId } from '../src/domain/addonId.ts';
import {
	buildNuvioCollection,
	collectionExportUrl,
	collectionFilename,
} from '../src/domain/nuvioCollection.ts';

describe('Nuvio collection JSON', () => {
	it('includes movie-only, series-only and mixed Catalogs in the chosen folder order', () => {
		const lists = [
			{ listId: 'shows', name: 'Shows', types: ['series'] as const },
			{ listId: 'films', name: 'Films', types: ['movie'] as const },
			{
				listId: 'mixed',
				name: 'Mixed',
				types: ['series', 'movie', 'movie'] as const,
			},
		];
		const [collection] = buildNuvioCollection(
			' Weekend ',
			lists,
			'org.listio.custom'
		);
		expect(collection.title).toBe('Weekend');
		expect(collection.folders.map((folder) => folder.title)).toEqual([
			'Shows',
			'Films',
			'Mixed',
		]);
		expect(collection.folders.map((folder) => folder.catalogSources)).toEqual([
			[
				{
					addonId: 'org.listio.custom',
					type: 'series',
					catalogId: 'shows',
				},
			],
			[
				{
					addonId: 'org.listio.custom',
					type: 'movie',
					catalogId: 'films',
				},
			],
			['movie', 'series'].map((type) => ({
				addonId: 'org.listio.custom',
				type,
				catalogId: 'mixed',
			})),
		]);
		expect(
			buildNuvioCollection(
				'Weekend',
				[...lists].reverse(),
				'org.listio.custom'
			)[0].id
		).toBe(collection.id);
		expect(
			buildNuvioCollection('Other', lists, 'org.listio.custom')[0].id
		).not.toBe(collection.id);
		expect(buildNuvioCollection('Weekend', lists)[0].id).not.toBe(
			collection.id
		);
		expect(collection.folders.map((folder) => folder.id)).toEqual(
			buildNuvioCollection(
				'Weekend',
				lists,
				'org.listio.custom'
			)[0].folders.map((folder) => folder.id)
		);
	});
	it('builds punctuation-free IDs, scopes folder IDs to the collection and ignores name case', () => {
		const list = { listId: 'a/b', name: 'A', types: ['movie'] as const };
		const [weird] = buildNuvioCollection('Q? "1"/#2 & 🎬', [list]);
		for (const id of [weird.id, weird.folders[0].id])
			expect(id).toMatch(/^[\w.!~*'()%:-]+$/);
		const [lower] = buildNuvioCollection('weekend', [list]);
		const [upper] = buildNuvioCollection(' WEEKEND ', [list]);
		expect(upper.id).toBe(lower.id);
		const [other] = buildNuvioCollection('Other', [list]);
		expect(other.folders[0].id).not.toBe(lower.folders[0].id);
		expect(resolveAddonId(' ')).toBe('org.listio.addon');
		expect(resolveAddonId(' custom.id ')).toBe('custom.id');
	});
	it('matches the source-derived reference shape (not an owner-exported sample)', () => {
		const actual = buildNuvioCollection('Reference collection', [
			{ listId: 'mixed', name: 'Mixed list', types: ['movie', 'series'] },
		]);
		const expected = structuredClone(reference);
		expected[0].id = actual[0].id;
		expected[0].folders[0].id = actual[0].folders[0].id;
		expect(actual).toEqual(expected);
		expect(JSON.stringify(actual)).not.toContain('manifest.json');
	});
	it('rejects blank names, empty selections, empty lists and duplicate folders', () => {
		const list = { listId: 'films', name: 'Films', types: ['movie'] as const };
		expect(() => buildNuvioCollection(' ', [list])).toThrow('name');
		expect(() => buildNuvioCollection('Weekend', [])).toThrow('Choose');
		expect(() =>
			buildNuvioCollection('Weekend', [{ ...list, types: [] }])
		).toThrow('saved Titles');
		expect(() => buildNuvioCollection('Weekend', [list, list])).toThrow(
			'distinct'
		);
	});
	it('uses safe filenames and encodes imported IDs without losing order', () => {
		expect(collectionFilename(' Weekend Picks ')).toBe('Weekend Picks.json');
		expect(collectionFilename('../Bad:/name')).toBe('.._Bad__name.json');
		const url = new URL(
			collectionExportUrl(['second&first', 'one']),
			'https://listio.example'
		);
		expect(url.searchParams.getAll('list')).toEqual(['second&first', 'one']);
	});
});

it('encodes a collection title and preserves folder order and unnamed URLs', () => {
	const name = "Weekend & 'Picks'";
	const url = new URL(
		collectionExportUrl(['second', 'first'], name),
		'https://listio.example'
	);
	expect(url.searchParams.get('name')).toBe(name);
	expect(url.searchParams.getAll('list')).toEqual(['second', 'first']);
	expect(collectionExportUrl(['second', 'first'])).toBe(
		'/export?list=second&list=first'
	);
	expect(collectionExportUrl([], '')).toBe('/export?name=');
});
