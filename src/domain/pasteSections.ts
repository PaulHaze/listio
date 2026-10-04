import { pasteLines, type PasteLine } from './pasteLines.ts';

export type ImportError = { line: number; message: string; sectionId?: string };
export type ImportSection = {
	id: string;
	line: number;
	name: string;
	lines: PasteLine[];
};
export type SectionPreview = ImportSection & { selected: boolean };
export type MultipleImport = {
	sections: ImportSection[];
	errors: ImportError[];
};
export function parseImport(text: string, mode: 'multiple'): MultipleImport;
export function parseImport(
	text: string,
	mode: 'single'
): { lines: PasteLine[]; errors: ImportError[] };
export function parseImport(
	text: string,
	mode: 'single' | 'multiple'
): { lines: PasteLine[]; errors: ImportError[] } | MultipleImport;

/** Structural validation only; TMDB decides whether title text can be matched. */
export function parseImport(
	text: string,
	mode: 'single' | 'multiple'
): { lines: PasteLine[]; errors: ImportError[] } | MultipleImport {
	if (mode === 'multiple') return parseMultiple(text);
	const errors: ImportError[] = [];
	const accepted: string[] = [];
	text.split(/\r?\n/).forEach((raw, index) => {
		if (raw.includes('//')) return;
		const line = raw
			.trim()
			.replace(/^(?:[-*]\s+|\d+\.\s+)/, '')
			.trim();
		if (line.startsWith('#')) {
			errors.push({
				line: index + 1,
				message: /^##\s/.test(line)
					? `Line ${index + 1}: "${line}" is a list header. Switch to Multiple lists, or remove list headers and use one title per line.`
					: `Line ${index + 1}: "${line}" isn't a title line. Remove the heading.`,
			});
		} else accepted.push(line);
	});
	const lines = pasteLines(accepted.join('\n'));
	return { lines, errors };
}

export function validateImportName(
	value: string,
	existing: readonly { name: string }[]
): string | null {
	const name = value.trim();
	if (!name || name.length > 100)
		return 'Enter a list name of 100 characters or fewer.';
	if (
		existing.some(
			(list) => list.name.trim().toLowerCase() === name.toLowerCase()
		)
	)
		return `A list named "${name}" already exists.`;
	return null;
}

function parseMultiple(text: string): MultipleImport {
	const sections: ImportSection[] = [];
	const errors: ImportError[] = [];
	let current: ImportSection | undefined;
	let titles: string[] = [];
	const finish = () => {
		if (current) current.lines = pasteLines(titles.join('\n'));
		titles = [];
	};
	text.split(/\r?\n/).forEach((raw, index) => {
		if (raw.includes('//')) return;
		const line = raw.trim();
		const sourceLine = index + 1;
		// A bare ## is a blank name that can be repaired in the preview.
		if (line === '##' || line.startsWith('## ')) {
			finish();
			current = {
				id: `section-${sourceLine}`,
				line: sourceLine,
				name: line.slice(2).trim(),
				lines: [],
			};
			sections.push(current);
			return;
		}
		if (!line) return;
		const titleLine = line.replace(/^(?:[-*]\s+|\d+\.\s+)/, '').trim();
		if (titleLine.startsWith('#')) {
			errors.push({
				line: sourceLine,
				...(current ? { sectionId: current.id } : {}),
				message: `Line ${sourceLine}: "${titleLine}" isn't a valid header. Use "## " for list names.`,
			});
		} else if (!current) {
			errors.push({
				line: sourceLine,
				message: `Line ${sourceLine}: "${line}" is above the first "## " header.`,
			});
		} else titles.push(line);
	});
	finish();
	if (!sections.length)
		errors.unshift({
			line: 1,
			message:
				'No "## " list headers found. Switch to Single list, or add headers.',
		});
	return { sections, errors };
}

/** Structural errors retain ownership; editable names and selections are checked separately. */
export function validateImportSections(
	parsed: MultipleImport,
	preview: readonly SectionPreview[],
	existing: readonly { name: string }[]
): ImportError[] {
	const selected = preview.filter((section) => section.selected);
	const ids = new Set(selected.map((section) => section.id));
	const errors = parsed.errors.filter(
		(error) => !error.sectionId || ids.has(error.sectionId)
	);
	const names = new Map<string, SectionPreview>();
	for (const section of selected) {
		const name = section.name.trim();
		if (!section.lines.length)
			errors.push({
				line: section.line,
				sectionId: section.id,
				message: `Line ${section.line}: "## ${name}" has no titles.`,
			});
		if (!name || name.length > 100)
			errors.push({
				line: section.line,
				sectionId: section.id,
				message: `Line ${section.line}: list names must be 1–100 characters.`,
			});
		if (
			existing.some(
				(list) => list.name.trim().toLowerCase() === name.toLowerCase()
			)
		)
			errors.push({
				line: section.line,
				sectionId: section.id,
				message: `Line ${section.line}: a list named "${name}" already exists.`,
			});
		const previous = names.get(name.toLowerCase());
		if (previous)
			errors.push({
				line: section.line,
				sectionId: section.id,
				message: `Lines ${previous.line} and ${section.line}: two lists are named "${name}".`,
			});
		else names.set(name.toLowerCase(), section);
	}
	return errors;
}
