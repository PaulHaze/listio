import type { MiddlewareHandler } from 'astro';
import { env } from 'cloudflare:workers';

// HTTP Basic Auth in front of everything except the addon (Nuvio can't log in;
// it's guarded by ADDON_SECRET instead) and robots.txt. Fails closed when the
// credentials aren't configured.
const PUBLIC_PREFIXES = ['/addon/', '/robots.txt'];

const encoder = new TextEncoder();

async function sameSecret(a: string, b: string): Promise<boolean> {
	// Compare SHA-256 digests so the comparison time doesn't depend on the input.
	const [x, y] = await Promise.all(
		[a, b].map(
			async (s) =>
				new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(s)))
		)
	);
	let diff = 0;
	for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
	return diff === 0;
}

function parseBasic(header: string | null): [string, string] | null {
	if (!header?.startsWith('Basic ')) return null;
	try {
		const decoded = atob(header.slice(6).trim());
		const colon = decoded.indexOf(':');
		if (colon < 0) return null;
		return [decoded.slice(0, colon), decoded.slice(colon + 1)];
	} catch {
		return null;
	}
}

const challenge = () =>
	new Response('Authentication required', {
		status: 401,
		headers: { 'WWW-Authenticate': 'Basic realm="Listio", charset="UTF-8"' },
	});

export const onRequest: MiddlewareHandler = async (context, next) => {
	const { pathname } = context.url;
	if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return next();

	const user = env.ADMIN_USER;
	const password = env.ADMIN_PASSWORD;
	if (!user || !password) {
		return new Response('Login is not configured', { status: 503 });
	}

	const given = parseBasic(context.request.headers.get('Authorization'));
	if (!given) return challenge();
	const [userOk, passwordOk] = await Promise.all([
		sameSecret(given[0], user),
		sameSecret(given[1], password),
	]);
	return userOk && passwordOk ? next() : challenge();
};
