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

export const PATCH_ERROR = `${NAME_ERROR} Show on Nuvio home must be true or false.`;

async function readBody(
	request: Pick<Request, 'json'>
): Promise<Record<string, unknown> | null> {
	try {
		const body: unknown = await request.json();
		return body && typeof body === 'object'
			? (body as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function validName(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const name = value.trim();
	return name && name.length <= MAX_NAME_LENGTH ? name : null;
}

export async function readName(
	request: Pick<Request, 'json'>
): Promise<string | null> {
	const body = await readBody(request);
	return body && 'name' in body ? validName(body.name) : null;
}

export type ListPatch = { name?: string; showOnHome?: boolean };

/** A rename, a Nuvio home change, or both; any invalid field rejects the patch. */
export async function readListPatch(
	request: Pick<Request, 'json'>
): Promise<ListPatch | null> {
	const body = await readBody(request);
	if (!body || !('name' in body || 'showOnHome' in body)) return null;
	const patch: ListPatch = {};
	if ('name' in body) {
		const name = validName(body.name);
		if (!name) return null;
		patch.name = name;
	}
	if ('showOnHome' in body) {
		if (typeof body.showOnHome !== 'boolean') return null;
		patch.showOnHome = body.showOnHome;
	}
	return patch;
}

export function apiError(error: unknown): Response {
	return error instanceof VersionConflictError
		? json({ error: error.message }, 409)
		: json({ error: 'Unable to save this change. Please try again.' }, 500);
}
