// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
	// TODO: set to the deployed URL. Used for the sitemap, canonical and
	// Open Graph URLs.
	site: 'https://example.com',
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
