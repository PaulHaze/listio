// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
	output: 'server',
	adapter: cloudflare({
		persistState: true,
		// workerd can't run on macOS < 13.5, so prerender in Node instead.
		prerenderEnvironment: 'node',
		// Posters are plain TMDB URLs; avoids provisioning a Cloudflare Images binding.
		imageService: 'passthrough',
	}),
	// Unused; stops the adapter auto-provisioning a SESSION KV namespace.
	session: false,
	site: 'https://listio.listio.workers.dev',
	vite: { plugins: [tailwindcss()] },
	integrations: [react(), sitemap(), icon()],
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
