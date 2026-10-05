import type { CombinedList } from '../domain/types.ts';
import { sortTitles } from '../domain/sort.ts';

export const PAGE_SIZE = 100;

export function buildCatalog(
	list: CombinedList | null,
	type: string,
	skip = 0
) {
	if (!list || !['movie', 'series'].includes(type) || skip < 0) {
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

/** Accepts `{id}.json` and `{id}/{key=value&…}.json`. Only `skip` is used;
 * other extras (the `genre` of a Catalog hidden from Nuvio's home) are ignored.
 */
export function parseCatalogPath(
	rest: string | undefined
): { id: string; skip: number } | null {
	const match = /^([^/]+)(?:\/([^/]+))?\.json$/.exec(rest ?? '');
	if (!match) return null;
	let skip = 0;
	for (const pair of match[2]?.split('&') ?? []) {
		const at = pair.indexOf('=');
		if (at < 1) return null;
		if (pair.slice(0, at) !== 'skip') continue;
		const value = pair.slice(at + 1);
		if (!/^\d+$/.test(value)) return null;
		skip = Number(value);
	}
	if (!Number.isSafeInteger(skip)) return null;
	return { id: match[1], skip };
}
