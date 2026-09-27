import { describe, expect, it } from 'vitest';
import { mergeTitles } from '../src/domain/merge.ts';
import { slugify, uniqueSlug } from '../src/domain/slug.ts';
import { sortTitles } from '../src/domain/sort.ts';
import type { CombinedList, Title } from '../src/domain/types.ts';

const title = (overrides: Partial<Title> = {}): Title => ({
	imdbId: 'tt0000001',
	type: 'movie',
	name: 'Existing',
	year: 2020,
	poster: null,
	blurb: null,
	tmdbId: null,
	addedSeq: 0,
	...overrides,
});

const emptyList: Pick<CombinedList, 'titles' | 'removed' | 'nextSeq'> = {
	titles: [title()],
	removed: [title({ imdbId: 'tt0000002', name: 'Removed', addedSeq: 1 })],
	nextSeq: 2,
};

describe('slug generation', () => {
	it('slugifies display names and adds the first available suffix', () => {
		expect(slugify(' Spy & Thrillers ')).toBe('spy-thrillers');
		expect(slugify('Beyoncé')).toBe('beyonce');
		expect(
			uniqueSlug('Spy Thrillers', ['spy-thrillers', 'spy-thrillers-2'])
		).toBe('spy-thrillers-3');
	});
});

describe('mergeTitles', () => {
	it('deduplicates active and Removed Titles and assigns sequence numbers', () => {
		const result = mergeTitles(emptyList, [
			{
				imdbId: 'tt0000001',
				type: 'movie',
				name: 'Existing again',
				year: 2020,
				tmdbId: null,
			},
			{
				imdbId: 'tt0000002',
				type: 'movie',
				name: 'Removed again',
				year: 2020,
				tmdbId: null,
			},
			{
				imdbId: 'tt0000003',
				type: 'series',
				name: 'New show',
				year: 2024,
				tmdbId: 3,
			},
			{
				imdbId: 'TT0000003',
				type: 'series',
				name: 'Duplicate new show',
				year: 2024,
				tmdbId: 3,
			},
		]);

		expect(result.newIds).toEqual(['tt0000003']);
		expect(result.newTitles[0].addedSeq).toBe(2);
		expect(result.nextSeq).toBe(3);
		expect(result.skippedExisting).toBe(1);
		expect(result.skippedRemoved).toBe(1);
		expect(result.skippedDuplicate).toBe(1);
		expect(result.titles.map((item) => item.imdbId)).toEqual([
			'tt0000001',
			'tt0000003',
		]);
	});
});

describe('sortTitles', () => {
	const titles = [
		title({ imdbId: 'tt-a', name: 'Zulu', year: 2010, addedSeq: 2 }),
		title({ imdbId: 'tt-b', name: 'Alpha', year: 2024, addedSeq: 1 }),
		title({ imdbId: 'tt-c', name: 'Unknown year', year: null, addedSeq: 0 }),
	];

	it('supports release year, alphabetical and added order without mutation', () => {
		expect(sortTitles(titles, 'newest').map((item) => item.name)).toEqual([
			'Alpha',
			'Zulu',
			'Unknown year',
		]);
		expect(sortTitles(titles, 'oldest').map((item) => item.name)).toEqual([
			'Zulu',
			'Alpha',
			'Unknown year',
		]);
		expect(sortTitles(titles, 'az').map((item) => item.name)).toEqual([
			'Alpha',
			'Unknown year',
			'Zulu',
		]);
		expect(sortTitles(titles, 'added').map((item) => item.name)).toEqual([
			'Unknown year',
			'Alpha',
			'Zulu',
		]);
		expect(titles[0].name).toBe('Zulu');
	});
});
