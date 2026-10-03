export type PasteLine = { line: string; name: string; year?: number };
export function pasteLines(text: string): PasteLine[] {
	const seen = new Set<string>();
	return text.split(/\r?\n/).flatMap((raw) => {
		const line = raw
			.trim()
			.replace(/^(?:[-*]\s+|\d+\.\s+)/, '')
			.trim();
		if (!line || /^(?:#|\/\/)/.test(line)) return [];
		const key = line.toLocaleLowerCase();
		if (seen.has(key)) return [];
		seen.add(key);
		const match = line.match(/\s*\((\d{4})\)\s*$/);
		const name = (match ? line.slice(0, match.index) : line).trim();
		return name
			? [{ line, name, ...(match ? { year: Number(match[1]) } : {}) }]
			: [];
	});
}
