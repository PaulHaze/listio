import { pasteLines, type PasteLine } from './pasteLines.ts';

export type ImportError = { line: number; message: string };
/** Structural validation only; TMDB decides whether title text can be matched. */
export function parseImport(
	text: string,
	mode: 'single'
): {
	lines: PasteLine[];
	errors: ImportError[];
} {
	const errors: ImportError[] = [];
	const accepted: string[] = [];
	if (mode !== 'single') throw new Error('Unsupported import mode.');
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
					? `Line ${index + 1}: "${line}" is a list header. Use one title per line and remove list headers.`
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
