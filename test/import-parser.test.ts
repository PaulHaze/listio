import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	parseImport,
	validateImportName,
	validateImportSections,
} from '../src/domain/pasteSections.ts';

const SINGLE_FIXTURE = 'docs/movie_lists/test_movie_list.md';
const MULTI_FIXTURE = 'docs/movie_lists/test_multi_list.md';
const SINGLE_TITLE = 'Test Single List';

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
	it('accepts the static single-list fixture and rejects the sectioned multi-list fixture', () => {
		const parsed = parseImport(readFileSync(SINGLE_FIXTURE, 'utf8'), 'single');
		expect(parsed.errors).toEqual([]);
		expect(parsed.lines).toHaveLength(13);
		expect(parsed.lines[0]).toEqual({
			line: 'Brick (2005)',
			name: 'Brick',
			year: 2005,
		});
		expect(parsed.lines.at(-1)).toEqual({
			line: 'Cowboy Bebop (2001)',
			name: 'Cowboy Bebop',
			year: 2001,
		});
		expect(
			parseImport(readFileSync(MULTI_FIXTURE, 'utf8'), 'single').errors.map(
				(error) => error.line
			)
		).toEqual([1, 16]);
		expect(validateImportName(SINGLE_TITLE, [])).toBeNull();
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
		expect(
			validateImportName(' test single list ', [{ name: ` ${SINGLE_TITLE} ` }])
		).toBe('A list named "test single list" already exists.');
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
	it('accepts both sections of the static multi-list fixture; rejects the single-list fixture', () => {
		const parsed = parseImport(readFileSync(MULTI_FIXTURE, 'utf8'), 'multiple');
		expect(parsed.errors).toEqual([]);
		expect(
			validateImportSections(
				parsed,
				parsed.sections.map((section) => ({ ...section, selected: true })),
				[]
			)
		).toEqual([]);
		expect(
			parsed.sections.map((section) => [
				section.line,
				section.name,
				section.lines.length,
			])
		).toEqual([
			[1, 'Quietly Contemplative', 12],
			[16, 'Art-House After Dark', 5],
		]);
		expect(parsed.sections.at(-1)?.lines.at(-1)).toEqual({
			line: '8½ (1963)',
			name: '8½',
			year: 1963,
		});
		expect(
			parseImport(readFileSync(SINGLE_FIXTURE, 'utf8'), 'multiple').errors
				.length
		).toBeGreaterThan(0);
	});
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

it('marks collection-specific errors without changing multiple-list messages', () => {
	const absent = parseImport('Title', 'multiple');
	expect(absent.errors[0]).toMatchObject({
		code: 'no-headers',
		message:
			'No "## " list headers found. Switch to Single list, or add headers.',
	});
	const parsed = parseImport(
		'## Same  \nTitle\n##  sAmE\nTitle\n## Existing\nTitle',
		'multiple'
	);
	const errors = validateImportSections(
		parsed,
		parsed.sections.map((section) => ({ ...section, selected: true })),
		[{ name: ' existing ' }]
	);
	expect(errors).toEqual([
		{
			line: 3,
			sectionId: 'section-3',
			code: 'duplicate-header',
			name: 'sAmE',
			previousLine: 1,
			message: 'Lines 1 and 3: two lists are named "sAmE".',
		},
		{
			line: 5,
			sectionId: 'section-5',
			code: 'existing-list',
			name: 'Existing',
			message: 'Line 5: a list named "Existing" already exists.',
		},
	]);
});
