import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	parseImport,
	validateImportName,
} from '../src/domain/pasteSections.ts';

describe('single import parsing', () => {
	it('strips bullets, whitespace, numbers, blanks and deduplicates while retaining optional years', () => {
		expect(
			parseImport(
				' \n - Brick (2005) \n* Adaptation\n1. BRICK (2005)\n2. Unknown 1970',
				'single'
			)
		).toEqual({
			errors: [],
			lines: [
				{ line: 'Brick (2005)', name: 'Brick', year: 2005 },
				{ line: 'Adaptation', name: 'Adaptation' },
				{ line: 'Unknown 1970', name: 'Unknown 1970' },
			],
		});
	});
	it('reports every heading with original line numbers, including headings behind bullets', () => {
		const parsed = parseImport(
			'\n## List\nBrick\n### Extras\n#Foo\n#\n- ## Hidden',
			'single'
		);
		expect(parsed.errors.map((error) => error.line)).toEqual([2, 4, 5, 6, 7]);
		expect(parsed.errors[0].message).toContain('list header');
		expect(parsed.lines).toEqual([{ line: 'Brick', name: 'Brick' }]);
		for (const heading of ['#', '## List', '### List', '#Foo'])
			expect(parseImport(heading, 'single').errors).toHaveLength(1);
	});
	it('ignores entire lines containing // without changing editor parsing', () => {
		expect(
			parseImport(
				'// comment\nBrick // note\n## Header // comment\nAdaptation',
				'single'
			)
		).toEqual({
			errors: [],
			lines: [{ line: 'Adaptation', name: 'Adaptation' }],
		});
		expect(parseImport('\n// note', 'single').lines).toEqual([]);
	});
	it('accepts absurd and noir files and rejects the sectioned midnight file', () => {
		for (const name of ['absurd_movies', 'noir_not_noir']) {
			const parsed = parseImport(
				readFileSync(`docs/movie_lists/${name}.md`, 'utf8'),
				'single'
			);
			expect(parsed.errors).toEqual([]);
			expect(parsed.lines.length).toBeGreaterThan(20);
		}
		expect(
			parseImport(
				readFileSync('docs/movie_lists/midnight_movies.md', 'utf8'),
				'single'
			).errors.length
		).toBeGreaterThan(0);
	});
});
describe('independent list name validation', () => {
	it('trims and requires 1–100 characters', () => {
		expect(validateImportName('  Good  ', [])).toBeNull();
		expect(validateImportName('x'.repeat(100), [])).toBeNull();
		for (const name of ['', '  ', 'x'.repeat(101)])
			expect(validateImportName(name, [])).toContain('100 characters');
	});
	it('rejects existing names with case and surrounding whitespace ignored', () => {
		expect(validateImportName(' noir ', [{ name: ' Noir ' }])).toBe(
			'A list named "noir" already exists.'
		);
	});
});
