import type { APIRoute } from 'astro';

// Listio is a private single-user app, so ask crawlers to stay out.
export const GET: APIRoute = () =>
	new Response('User-agent: *\nDisallow: /\n', {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
