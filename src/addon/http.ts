import { createHash, timingSafeEqual } from 'node:crypto';

/** Hash to equal-length buffers before the constant-time comparison. */
export function validSecret(
	candidate: string | undefined,
	expected: string | undefined
): boolean {
	const digest = (value: string) => createHash('sha256').update(value).digest();
	const equal = timingSafeEqual(
		digest(candidate ?? ''),
		digest(expected ?? '')
	);
	return equal && Boolean(candidate) && Boolean(expected);
}

export function addonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'max-age=60',
		},
	});
}

export function addonNotFound(): Response {
	return addonResponse({ error: 'Not found' }, 404);
}
