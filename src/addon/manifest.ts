import type { ListIndexEntry } from '../storage/lists.ts';
import { DEFAULT_ADDON_ID } from '../domain/addonId.ts';
import { HIDDEN_GENRE } from '../domain/nuvioCollection.ts';

/** Nuvio Mobile and Desktop leave a Catalog with a required extra off the home
 * screen; NuvioTV and NuvioTVSmart read `showInHome`. Nuvio collections still
 * accept a Catalog whose only required extra is `genre`.
 */
const hiddenFromHome = {
	showInHome: false,
	extra: [
		{ name: 'genre', isRequired: true, options: [HIDDEN_GENRE] },
		{ name: 'skip' },
	],
};

export function buildManifest(
	index: readonly ListIndexEntry[],
	addonId = DEFAULT_ADDON_ID
) {
	return {
		id: addonId,
		version: '0.0.1',
		name: 'Listio',
		description: 'Your curated Combined Lists.',
		resources: ['catalog'],
		types: ['movie', 'series'],
		catalogs: index.flatMap((list) =>
			list.types.map((type) => ({
				type,
				id: list.id,
				name:
					list.types.length > 1
						? `${list.name} (${type === 'movie' ? 'Movies' : 'Shows'})`
						: list.name,
				...(list.showOnHome ? { extra: [{ name: 'skip' }] } : hiddenFromHome),
			}))
		),
	};
}
