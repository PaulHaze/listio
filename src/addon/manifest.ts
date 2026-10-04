import type { ListIndexEntry } from '../storage/lists.ts';
import { DEFAULT_ADDON_ID } from '../domain/nuvioCollection.ts';

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
				name: list.name,
				extra: [{ name: 'skip' }],
			}))
		),
	};
}
