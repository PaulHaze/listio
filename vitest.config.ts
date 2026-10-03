import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	// Lets route modules resolve `cloudflare:workers`; tests replace it with vi.mock.
	resolve: {
		alias: {
			'cloudflare:workers': fileURLToPath(
				new URL('./src/dev/cloudflare-workers.ts', import.meta.url)
			),
		},
	},
	test: {},
});
