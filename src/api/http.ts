import { VersionConflictError } from '../storage/lists.ts';

export function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store',
		},
	});
}

export async function readName(request: Request): Promise<string | null> {
	try {
		const body: unknown = await request.json();
		if (!body || typeof body !== 'object' || !('name' in body)) return null;
		return typeof body.name === 'string' && body.name.trim()
			? body.name.trim()
			: null;
	} catch {
		return null;
	}
}

export function apiError(error: unknown): Response {
	return error instanceof VersionConflictError
		? json({ error: error.message }, 409)
		: json({ error: 'Unable to save this change. Please try again.' }, 500);
}
