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

/** Keeps the derived `list:{id}` KV key well under Workers KV's 512-byte limit. */
export const MAX_NAME_LENGTH = 100;

export const NAME_ERROR = `Enter a Combined List name of ${MAX_NAME_LENGTH} characters or fewer.`;

export async function readName(request: Request): Promise<string | null> {
	try {
		const body: unknown = await request.json();
		if (!body || typeof body !== 'object' || !('name' in body)) return null;
		if (typeof body.name !== 'string') return null;
		const name = body.name.trim();
		return name && name.length <= MAX_NAME_LENGTH ? name : null;
	} catch {
		return null;
	}
}

export function apiError(error: unknown): Response {
	return error instanceof VersionConflictError
		? json({ error: error.message }, 409)
		: json({ error: 'Unable to save this change. Please try again.' }, 500);
}
