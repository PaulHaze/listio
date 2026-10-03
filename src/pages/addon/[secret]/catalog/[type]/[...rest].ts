import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
	buildCatalog,
	parseCatalogPath,
} from '../../../../../addon/catalog.ts';
import {
	addonNotFound,
	addonResponse,
	validSecret,
} from '../../../../../addon/http.ts';
import { getList } from '../../../../../storage/lists.ts';

export const GET: APIRoute = async ({ params }) => {
	if (!validSecret(params.secret, env.ADDON_SECRET)) return addonNotFound();
	const path = parseCatalogPath(params.rest);
	if (!path) return addonNotFound();
	// buildCatalog turns an unknown type into { metas: [] }.
	return addonResponse(
		buildCatalog(
			await getList(env.LISTIO, path.id),
			params.type ?? '',
			path.skip
		)
	);
};
