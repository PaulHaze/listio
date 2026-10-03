import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { json } from '../../../api/http.ts';
import { isRecord } from '../../../api/validate.ts';
import { TmdbRequestError } from '../../../tmdb/enrich.ts';
import { matchTitle, type BatchMatchResult } from '../../../tmdb/match.ts';
export const POST: APIRoute = async ({ request }) => {
	const body: unknown = await request.json().catch(() => null);
	if (
		!isRecord(body) ||
		!Array.isArray(body.lines) ||
		body.lines.length > 20 ||
		!body.lines.every(
			(line) =>
				isRecord(line) &&
				typeof line.name === 'string' &&
				line.name.trim().length > 0 &&
				line.name.length <= 500 &&
				(line.year === undefined ||
					(Number.isInteger(line.year) &&
						(line.year as number) >= 1000 &&
						(line.year as number) <= 9999))
		)
	)
		return json(
			{
				error: 'Send at most 20 title lines with an optional four-digit year.',
			},
			400
		);
	if (!env.TMDB_API_KEY?.trim())
		return json({ error: 'TMDB is not configured.' }, 503);
	try {
		// Reserve two searches for each remaining line, staying below 50 external
		// subrequests. The client automatically completes deferred lookups separately.
		const lines = body.lines;
		let requests = 0;
		const request: typeof fetch = async (input, init) => {
			requests += 1;
			return fetch(input, init);
		};
		const results: BatchMatchResult[] = [];
		for (const [index, line] of lines.entries()) {
			try {
				results.push(
					await matchTitle(
						line.name.trim(),
						line.year,
						{ apiKey: env.TMDB_API_KEY, fetch: request },
						() => requests + 1 + 2 * (lines.length - index - 1) <= 48
					)
				);
			} catch (error) {
				// A bad key fails every line; anything else fails only this one.
				if (
					error instanceof TmdbRequestError &&
					(error.status === 401 || error.status === 403)
				)
					throw error;
				results.push({
					status: 'none',
					reason: 'TMDB lookup failed — try again',
					retry: true,
				});
			}
		}
		return json(results);
	} catch {
		return json({ error: 'Unable to match Titles. Please try again.' }, 502);
	}
};
