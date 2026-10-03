import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { json } from '../../../api/http.ts';
import { isRecord } from '../../../api/validate.ts';
import { detectSource, SourceDetectionError } from '../../../sources/detect.ts';
import { fetchTrakt } from '../../../sources/trakt.ts';
import {
	fetchMdbList,
	SourceRequestBudgetError,
} from '../../../sources/mdblist.ts';

export const POST: APIRoute = async ({ request }) => {
	const body: unknown = await request.json().catch(() => null);
	if (!isRecord(body) || typeof body.url !== 'string' || body.url.length > 2048)
		return json({ error: 'Paste a Trakt or MDBList Source URL.' }, 400);
	try {
		const source = detectSource(body.url);
		const key =
			source.site === 'trakt' ? env.TRAKT_CLIENT_ID : env.MDBLIST_API_KEY;
		if (!key?.trim())
			return json(
				{
					error: `${source.site === 'trakt' ? 'Trakt' : 'MDBList'} is not configured.`,
				},
				503
			);
		const result =
			source.site === 'trakt'
				? await fetchTrakt(source, { clientId: key })
				: await fetchMdbList(source, { apiKey: key, maxPages: 40 });
		return json({
			titles: result.titles,
			skippedInvalid: result.skippedInvalid,
			source: {
				url: source.url,
				site: source.site,
				addedAt: new Date().toISOString(),
				titleCount: result.titles.length,
				skippedNoImdb: result.skippedNoImdb,
			},
		});
	} catch (error) {
		// Upstream error bodies can contain credentials; never forward them to the browser.
		if (error instanceof SourceRequestBudgetError)
			return json({ error: error.message }, 422);
		return error instanceof SourceDetectionError
			? json({ error: error.message }, 400)
			: json(
					{
						error: 'Unable to fetch this Source. Check the URL and try again.',
					},
					502
				);
	}
};
