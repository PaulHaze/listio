import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { json } from '../../../api/http.ts';
import { isRecord, isTitle } from '../../../api/validate.ts';
import {
	enrichmentCost,
	MAX_ENRICH_REQUESTS,
} from '../../../components/editor/enrichment.ts';
import { enrichTitles } from '../../../tmdb/enrich.ts';

export const POST: APIRoute = async ({ request }) => {
	const body: unknown = await request.json().catch(() => null);
	if (
		!isRecord(body) ||
		!Array.isArray(body.titles) ||
		body.titles.length > 40 ||
		!body.titles.every(isTitle) ||
		body.titles.reduce((n, t) => n + enrichmentCost(t), 0) > MAX_ENRICH_REQUESTS
	)
		return json(
			{
				error:
					'Send at most 40 Titles and 40 TMDB requests (a Title without a TMDB ID needs two).',
			},
			400
		);
	if (!env.TMDB_API_KEY?.trim())
		return json(
			{ error: 'TMDB is not configured. Titles can still be saved.' },
			503
		);
	try {
		return json({
			titles: await enrichTitles(body.titles, { apiKey: env.TMDB_API_KEY }),
		});
	} catch {
		return json(
			{ error: 'Unable to enrich Titles. Titles can still be saved.' },
			502
		);
	}
};
