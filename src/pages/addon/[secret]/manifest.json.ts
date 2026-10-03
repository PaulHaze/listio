import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { buildManifest } from '../../../addon/manifest.ts';
import {
	addonNotFound,
	addonResponse,
	validSecret,
} from '../../../addon/http.ts';
import { getIndex } from '../../../storage/lists.ts';

export const GET: APIRoute = async ({ params }) => {
	if (!validSecret(params.secret, env.ADDON_SECRET)) return addonNotFound();
	return addonResponse(buildManifest(await getIndex(env.LISTIO), env.ADDON_ID));
};
