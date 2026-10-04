export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}
/** JSON request to a Listio route. A body defaults the method to POST. */
export async function api<T>(
	url: string,
	signal: AbortSignal,
	body?: unknown,
	method = body === undefined ? 'GET' : 'POST'
): Promise<T> {
	const response = await fetch(url, {
		method,
		signal,
		...(body === undefined
			? {}
			: {
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				}),
	});
	// Non-JSON error pages (Cloudflare 502, Access login) fall back to a generic message.
	const data: unknown = await response.json().catch(() => null);
	if (!response.ok || data === null)
		throw new ApiError(
			(data &&
			typeof data === 'object' &&
			'error' in data &&
			typeof data.error === 'string'
				? data.error
				: '') || 'Unable to complete this request. Please try again.',
			response.status
		);
	return data as T;
}
