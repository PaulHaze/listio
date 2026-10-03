// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import icon from 'astro-icon';
import { fileURLToPath } from 'node:url';

// Temporary Node dev server for macOS < 13.5, where workerd can't run (ADR 0004).
const nodeDev = process.env.LISTIO_NODE_DEV === '1';

// https://astro.build/config
export default defineConfig({
	output: 'server',
	adapter: nodeDev
		? undefined
		: cloudflare({
				persistState: true,
				// workerd can't run on macOS < 13.5, so prerender in Node instead.
				prerenderEnvironment: 'node',
				// Posters are plain TMDB URLs; avoids provisioning a Cloudflare Images binding.
				imageService: 'passthrough',
			}),
	// Unused; stops the adapter auto-provisioning a SESSION KV namespace.
	session: false,
	vite: {
		plugins: [tailwindcss()],
		resolve: nodeDev
			? {
					alias: {
						'cloudflare:workers': fileURLToPath(
							new URL('./src/dev/cloudflare-workers.ts', import.meta.url)
						),
					},
				}
			: {},
	},
	integrations: [react(), icon()],
	// Downloaded at build time and self-hosted, with size-adjusted fallbacks to
	// avoid layout shift while the web font loads.
	fonts: [
		{
			provider: fontProviders.fontsource(),
			name: 'Noto Sans',
			cssVariable: '--font-noto-sans',
			weights: ['100 900'],
			styles: ['normal'],
			subsets: ['latin'],
			fallbacks: ['sans-serif'],
		},
		{
			provider: fontProviders.fontsource(),
			name: 'Anton',
			cssVariable: '--font-anton',
			weights: [400],
			styles: ['normal'],
			subsets: ['latin'],
			fallbacks: ['sans-serif'],
		},
	],
});
