import type { CombinedList } from '../domain/types.ts';
import { sortTitles } from '../domain/sort.ts';

export const PAGE_SIZE = 100;

export function buildCatalog(
	list: CombinedList | null,
	type: string,
	skip = 0
) {
	if (
		!list ||
		!['movie', 'series'].includes(type) ||
		!Number.isSafeInteger(skip) ||
		skip < 0
	) {
		return { metas: [] };
	}
	return {
		metas: sortTitles(
			list.titles.filter((title) => title.type === type),
			list.sort
		)
			.slice(skip, skip + PAGE_SIZE)
			.map((title) => ({
				id: title.imdbId,
				type: title.type,
				name: title.name,
				poster: title.poster,
			})),
	};
}

/** Only the two Stremio catalog paths are accepted. */
export function parseCatalogPath(
	rest: string | undefined
): { id: string; skip: number } | null {
	const match = /^([^/]+)(?:\/skip=(\d+))?\.json$/.exec(rest ?? '');
	if (!match) return null;
	const skip = Number(match[2] ?? 0);
	if (!Number.isSafeInteger(skip)) return null;
	return { id: match[1], skip };
}
