import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIContext } from 'astro';

const fakeEnv: Record<string, string | undefined> = {};

vi.mock('cloudflare:workers', () => ({ env: fakeEnv }));

const { onRequest } = await import('../src/middleware.ts');

const passed = new Response('ok');

function call(path: string, authorization?: string): Promise<Response> {
	const url = new URL(`https://listio.example${path}`);
	const headers = authorization ? { Authorization: authorization } : undefined;
	const context = { url, request: new Request(url, { headers }) };
	return onRequest(
		context as unknown as APIContext,
		async () => passed
	) as Promise<Response>;
}

const basic = (user: string, password: string) =>
	`Basic ${btoa(`${user}:${password}`)}`;

beforeEach(() => {
	fakeEnv.ADMIN_USER = 'paul';
	fakeEnv.ADMIN_PASSWORD = 'correct horse';
});

describe('basic auth middleware', () => {
	it('challenges the UI and API without credentials', async () => {
		for (const path of ['/', '/import', '/lists/abc', '/api/lists']) {
			const res = await call(path);
			expect(res.status).toBe(401);
			expect(res.headers.get('WWW-Authenticate')).toMatch(/^Basic /);
		}
	});

	it('lets the right credentials through', async () => {
		expect(await call('/api/lists', basic('paul', 'correct horse'))).toBe(
			passed
		);
	});

	it('rejects a wrong password or user, and malformed headers', async () => {
		expect((await call('/', basic('paul', 'wrong'))).status).toBe(401);
		expect((await call('/', basic('someone', 'correct horse'))).status).toBe(
			401
		);
		expect((await call('/', 'Basic !!!not-base64')).status).toBe(401);
		expect((await call('/', 'Bearer token')).status).toBe(401);
	});

	it('leaves the addon and robots.txt open', async () => {
		expect(await call('/addon/secret/manifest.json')).toBe(passed);
		expect(await call('/robots.txt')).toBe(passed);
	});

	it('fails closed when credentials are not configured', async () => {
		fakeEnv.ADMIN_PASSWORD = '';
		expect((await call('/', basic('paul', ''))).status).toBe(503);
	});
});
