import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { json } from '../../api/http.ts';
import { searchTitles } from '../../tmdb/search.ts';
export const GET: APIRoute = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (q.length < 2) return json([]);
	if (!env.TMDB_API_KEY?.trim())
		return json({ error: 'TMDB is not configured.' }, 503);
	try {
		return json(await searchTitles(q, { apiKey: env.TMDB_API_KEY }));
	} catch {
		return json({ error: 'Unable to search Titles. Please try again.' }, 502);
	}
};
