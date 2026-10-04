import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	parseImport,
	validateImportName,
	validateImportSections,
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

describe('multiple import parsing and preview validation', () => {
	it('keeps source identity, punctuation and titles scoped to sections', () => {
		const parsed = parseImport(
			" // ignored\n  ## A: & 'B'  \n- Brick (2005)\n1. BRICK (2005)\n## Second\nBrick (2005)\nTwin Peaks (1990)",
			'multiple'
		);
		expect(parsed.errors).toEqual([]);
		expect(
			parsed.sections.map((section) => [
				section.id,
				section.line,
				section.name,
				section.lines.length,
			])
		).toEqual([
			['section-2', 2, "A: & 'B'", 1],
			['section-5', 5, 'Second', 2],
		]);
		expect(parsed.sections[0].lines[0]).toEqual(parsed.sections[1].lines[0]);
	});
	it('reports every structural and name error, then clears only errors repaired or unticked', () => {
		const parsed = parseImport(
			'Brick\n### Extras\n## \n#Foo\n## ' +
				'x'.repeat(101) +
				'\n## Existing\nTitle\n## Same\nTitle\n## same\nTitle',
			'multiple'
		);
		let preview = parsed.sections.map((section) => ({
			...section,
			selected: true,
		}));
		const existing = [{ name: ' existing ' }];
		const errors = validateImportSections(parsed, preview, existing);
		expect(errors.map((error) => error.line)).toEqual([
			1, 2, 4, 3, 3, 5, 5, 6, 10,
		]);
		expect(errors.map((error) => error.message).join(' ')).toContain(
			'Lines 8 and 10'
		);
		preview = preview.map((section) =>
			section.line === 3 || section.line === 5 || section.line === 10
				? { ...section, selected: false }
				: section.line === 6
					? { ...section, name: "Renamed: & 'OK'" }
					: section
		);
		expect(
			validateImportSections(parsed, preview, existing).map(
				(error) => error.line
			)
		).toEqual([1, 2]);
		expect(parsed.sections[2].name).toBe('Existing');
	});
	it('renames blank, long, duplicate and existing headers independently of structure', () => {
		const parsed = parseImport(
			'##\nTitle\n## ' +
				'x'.repeat(101) +
				'\nTitle\n## Same\nTitle\n## same\nTitle\n## Existing\nTitle',
			'multiple'
		);
		const preview = parsed.sections.map((section, index) => ({
			...section,
			selected: true,
			name: `Good ${index}`,
		}));
		expect(
			validateImportSections(parsed, preview, [{ name: 'Existing' }])
		).toEqual([]);
		for (const line of ['#', '###', '#Foo', '##Foo', '- ## Hidden']) {
			expect(
				parseImport(`## Valid\nTitle\n${line}`, 'multiple').errors[0]
			).toMatchObject({ line: 3, sectionId: 'section-1' });
		}
	});
	it('keeps missing headers and text before a header global even with every section unticked', () => {
		const absent = parseImport('Brick\n// note', 'multiple');
		expect(absent.errors.map((error) => error.message).join(' ')).toContain(
			'No "## "'
		);
		expect(absent.errors.map((error) => error.line)).toEqual([1, 1]);
		const parsed = parseImport('Title\n## List\n#Bad', 'multiple');
		expect(
			validateImportSections(
				parsed,
				parsed.sections.map((section) => ({ ...section, selected: false })),
				[]
			)
		).toEqual([parsed.errors[0]]);
	});
	it('accepts all 25 midnight sections with fixed per-list counts and final TV Titles; rejects single-list fixtures', () => {
		const parsed = parseImport(
			readFileSync('test/fixtures/midnight_movies.md', 'utf8'),
			'multiple'
		);
		expect(parsed.sections).toHaveLength(25);
		expect(
			validateImportSections(
				parsed,
				parsed.sections.map((section) => ({ ...section, selected: true })),
				[]
			)
		).toEqual([]);
		expect(parsed.sections.map((section) => section.lines.length)).toEqual([
			6, 70, 78, 15, 19, 14, 23, 14, 26, 6, 10, 22, 108, 26, 11, 6, 9, 35, 21,
			12, 18, 38, 15, 6, 58,
		]);
		expect(parsed.sections.at(-1)?.name).toBe('Midnight Tv Shows');
		expect(
			parsed.sections.at(-1)?.lines.some((line) => line.name === 'Twin Peaks')
		).toBe(true);
		for (const file of ['absurd_movies', 'noir_not_noir'])
			expect(
				parseImport(
					readFileSync(`docs/movie_lists/${file}.md`, 'utf8'),
					'multiple'
				).errors.length
			).toBeGreaterThan(1);
	});
});

it('keeps the curated midnight file structurally valid without freezing its counts', () => {
	const parsed = parseImport(
		readFileSync('docs/movie_lists/midnight_movies.md', 'utf8'),
		'multiple'
	);
	expect(parsed.sections.length).toBeGreaterThan(0);
	expect(
		validateImportSections(
			parsed,
			parsed.sections.map((section) => ({ ...section, selected: true })),
			[]
		)
	).toEqual([]);
	expect(parsed.sections.at(-1)?.name.toLowerCase()).toBe('midnight tv shows');
});
it('rejects commented headers without moving their titles into the preceding section', () => {
	for (const prefix of ['', '## Previous\nOne\n']) {
		const parsed = parseImport(
			prefix + '## Movies // to sort\nTwo\n## Next\nThree // ignored\nFour',
			'multiple'
		);
		const bad = parsed.sections.find((section) => section.name.includes('//'))!;
		expect(bad.lines.map((line) => line.name)).toEqual(['Two']);
		expect(parsed.errors).toEqual([
			{
				line: bad.line,
				sectionId: bad.id,
				message: `Line ${bad.line}: "## Movies // to sort" contains "//". Remove the comment from the header.`,
			},
		]);
		expect(
			validateImportSections(
				parsed,
				parsed.sections.map((section) => ({
					...section,
					selected: section !== bad,
				})),
				[]
			)
		).toEqual([]);
		expect(parsed.sections.at(-1)?.lines.map((line) => line.name)).toEqual([
			'Four',
		]);
	}
});
it('reports blank names and empty sections without blank duplicate or existing-name noise', () => {
	const parsed = parseImport('##\n##', 'multiple');
	const errors = validateImportSections(
		parsed,
		parsed.sections.map((section) => ({ ...section, selected: true })),
		[{ name: ' ' }]
	);
	expect(errors.map((error) => error.message)).toEqual([
		'Line 1: this section has no titles.',
		'Line 1: list names must be 1–100 characters.',
		'Line 2: this section has no titles.',
		'Line 2: list names must be 1–100 characters.',
	]);
});
