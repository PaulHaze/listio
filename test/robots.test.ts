import { describe, expect, it } from 'vitest';
import { GET } from '../src/pages/robots.txt.ts';

describe('robots.txt', () => {
	it('disallows crawling without needing a configured site', async () => {
		const response = await GET({ site: undefined } as never);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('User-agent: *\nDisallow: /\n');
	});
});
