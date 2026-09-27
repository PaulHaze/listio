/** @type {import("prettier").Config & import("prettier-plugin-tailwindcss").PluginOptions} */
export default {
	printWidth: 80,
	semi: true,
	singleQuote: true,
	tabWidth: 2,
	trailingComma: 'es5',
	useTabs: true,
	plugins: ['prettier-plugin-astro', 'prettier-plugin-tailwindcss'],
	// Tailwind v4 has no JS config, so point the class sorter at the CSS entry.
	tailwindStylesheet: './src/styles/main.css',
	tailwindFunctions: ['cn', 'clsx'],
	overrides: [
		{
			files: '*.astro',
			options: {
				parser: 'astro',
			},
		},
	],
};
