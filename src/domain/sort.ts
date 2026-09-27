import type { CombinedList, SortOrder, Title } from './types';

function yearCompare(a: Title, b: Title, direction: 1 | -1): number {
	if (a.year === null && b.year === null) return 0;
	if (a.year === null) return 1;
	if (b.year === null) return -1;
	return (a.year - b.year) * direction;
}

function compareTitles(a: Title, b: Title, order: SortOrder): number {
	switch (order) {
		case 'newest':
			return yearCompare(a, b, -1);
		case 'oldest':
			return yearCompare(a, b, 1);
		case 'az':
			return a.name.localeCompare(b.name, undefined, {
				sensitivity: 'base',
			});
		case 'added':
			return a.addedSeq - b.addedSeq;
	}
}

/** Return a sorted copy of Titles, leaving the Combined List's arrays intact. */
export function sortTitles(
	titles: readonly Title[],
	order: SortOrder = 'newest'
): Title[] {
	return titles
		.map((title, index) => ({ title, index }))
		.sort((a, b) => compareTitles(a.title, b.title, order) || a.index - b.index)
		.map(({ title }) => title);
}

/** Sort the title portion of a Combined List without mutating it. */
export function sortCombinedList(
	list: CombinedList,
	order: SortOrder = list.sort
): CombinedList {
	return {
		...list,
		titles: sortTitles(list.titles, order),
		sort: order,
	};
}

export const sortListTitles = sortTitles;
