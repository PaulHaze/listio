import type { TitleType } from './types.ts';

export const DEFAULT_ADDON_ID = 'org.listio.addon';

export type CollectionList = {
	listId: string;
	name: string;
	types: readonly TitleType[];
};

/** Legacy catalogSources remains supported by Nuvio's collection importer.
 * IDs use an unambiguous tuple, so changing order or list contents preserves
 * collection identity. A different collection name creates a new identity.
 */
export function buildNuvioCollection(
	name: string,
	lists: readonly CollectionList[],
	addonId = DEFAULT_ADDON_ID
) {
	const title = name.trim();
	if (!title) throw new Error('Enter a collection name.');
	if (!addonId.trim()) throw new Error('An addon ID is required.');
	if (!lists.length) throw new Error('Choose at least one Combined List.');
	const seen = new Set<string>();
	return [
		{
			id: `listio:${JSON.stringify([addonId, title])}`,
			title,
			pinToTop: false,
			viewMode: 'TABBED_GRID',
			showAllTab: true,
			folders: lists.map((list) => {
				if (!list.listId || !list.name.trim() || seen.has(list.listId))
					throw new Error('Choose distinct, named Combined Lists.');
				seen.add(list.listId);
				const types = (['movie', 'series'] as const).filter((type) =>
					list.types.includes(type)
				);
				if (!types.length)
					throw new Error('Each Combined List must have saved Titles.');
				return {
					id: `listio-folder:${JSON.stringify([addonId, list.listId])}`,
					title: list.name,
					tileShape: 'POSTER',
					hideTitle: false,
					catalogSources: types.map((type) => ({
						addonId,
						type,
						catalogId: list.listId,
					})),
				};
			}),
		},
	];
}

export function collectionFilename(name: string) {
	return `${
		name
			.trim()
			.replace(/[<>:"/\\|?*\p{Cc}]/gu, '_')
			.replace(/[. ]+$/g, '') || 'collection'
	}.json`;
}

export function collectionExportUrl(listIds: readonly string[]) {
	const query = new URLSearchParams();
	for (const id of listIds) query.append('list', id);
	return `/export?${query}`;
}
