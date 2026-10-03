import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { json } from '../../../api/http.ts';
import { isRecord } from '../../../api/validate.ts';
import { detectSource, SourceDetectionError } from '../../../sources/detect.ts';
import { SourceRequestBudgetError } from '../../../sources/errors.ts';
import { fetchTrakt } from '../../../sources/trakt.ts';
import { fetchMdbList } from '../../../sources/mdblist.ts';
import { fetchImdb } from '../../../sources/imdb.ts';

// Leave headroom below the Worker's 50 external subrequests per invocation.
const MAX_SOURCE_PAGES = 40;

export const POST: APIRoute = async ({ request }) => {
	const body: unknown = await request.json().catch(() => null);
	if (!isRecord(body) || typeof body.url !== 'string' || body.url.length > 2048)
		return json({ error: 'Paste a Trakt, MDBList or IMDb Source URL.' }, 400);
	let imdb = false;
	try {
		const source = detectSource(body.url);
		imdb = source.site === 'imdb';
		const key =
			source.site === 'trakt' ? env.TRAKT_CLIENT_ID : env.MDBLIST_API_KEY;
		if (!imdb && !key?.trim())
			return json(
				{
					error: `${source.site === 'trakt' ? 'Trakt' : 'MDBList'} is not configured.`,
				},
				503
			);
		const result =
			source.site === 'imdb'
				? await fetchImdb(source, { maxPages: MAX_SOURCE_PAGES })
				: source.site === 'trakt'
					? await fetchTrakt(source, {
							clientId: key!,
							maxPages: MAX_SOURCE_PAGES,
						})
					: await fetchMdbList(source, {
							apiKey: key!,
							maxPages: MAX_SOURCE_PAGES,
						});
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
		if (imdb)
			return json(
				{
					error:
						'Unable to fetch this IMDb Source. Export the list from IMDb and upload its CSV instead.',
					fallback: 'imdb-csv',
				},
				error instanceof SourceRequestBudgetError ? 422 : 502
			);
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
