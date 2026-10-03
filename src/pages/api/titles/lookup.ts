import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { json } from '../../../api/http.ts';
import { isRecord } from '../../../api/validate.ts';
import { lookupTitle } from '../../../tmdb/lookup.ts';
export const POST: APIRoute = async ({ request }) => {
	const body: unknown = await request.json().catch(() => null);
	if (
		!isRecord(body) ||
		!Number.isSafeInteger(body.tmdbId) ||
		(body.tmdbId as number) <= 0 ||
		(body.type !== 'movie' && body.type !== 'series')
	)
		return json({ error: 'Send a TMDB ID and Movie or Series type.' }, 400);
	if (!env.TMDB_API_KEY?.trim())
		return json({ error: 'TMDB is not configured.' }, 503);
	try {
		const result = await lookupTitle(body.tmdbId as number, body.type, {
			apiKey: env.TMDB_API_KEY,
		});
		return result.status === 'matched'
			? json(result.title)
			: json({ error: result.reason }, 422);
	} catch {
		return json(
			{ error: 'Unable to look up this Title. Please try again.' },
			502
		);
	}
};
