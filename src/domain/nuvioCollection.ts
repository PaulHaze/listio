import { DEFAULT_ADDON_ID } from './addonId.ts';
import type { TitleType } from './types.ts';

export type CollectionList = {
	listId: string;
	name: string;
	types: readonly TitleType[];
};

/** The single genre option of a Catalog kept off Nuvio's home screen. */
export const HIDDEN_GENRE = 'All';

const idPart = (value: string) => encodeURIComponent(value);

/** Legacy catalogSources remains supported by Nuvio's collection importer.
 * IDs are made of percent-encoded parts joined by `:`, so they are unambiguous
 * and free of path/JSON punctuation. Changing order or list contents preserves
 * collection identity. A different collection name (ignoring case) or addon ID
 * creates a new identity. Folder IDs are scoped to their collection.
 * Every source names HIDDEN_GENRE so a Catalog hidden from Nuvio's home (which
 * requires a genre) loads; the addon ignores the genre otherwise.
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
	const collectionId = `listio:${idPart(addonId)}:${idPart(title.toLowerCase())}`;
	return [
		{
			id: collectionId,
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
					id: `listio-folder:${idPart(collectionId)}:${idPart(list.listId)}`,
					title: list.name,
					tileShape: 'POSTER',
					hideTitle: false,
					catalogSources: types.map((type) => ({
						addonId,
						type,
						catalogId: list.listId,
						genre: HIDDEN_GENRE,
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

export function collectionExportUrl(listIds: readonly string[], name?: string) {
	const query = new URLSearchParams();
	for (const id of listIds) query.append('list', id);
	if (name !== undefined) query.set('name', name);
	return `/export?${query}`;
}
