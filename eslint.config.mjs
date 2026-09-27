// @ts-check
import { defineConfig, globalIgnores } from 'eslint/config';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginAstro from 'eslint-plugin-astro';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

export default defineConfig([
	globalIgnores(['dist/', '.astro/']),
	eslint.configs.recommended,
	tseslint.configs.recommended,
	eslintPluginAstro.configs.recommended,
	eslintPluginAstro.configs['jsx-a11y-recommended'],
	{
		// our own additional config
		languageOptions: {
			parser: tseslint.parser,
		},
		files: ['src/**/*.ts', 'src/**/*.tsx'],
		plugins: {
			// additional plugins
		},
		rules: {
			'@typescript-eslint/consistent-type-definitions': ['error', 'type'],
		},
	},
	{
		// override/add rules settings here, such as:
		// "astro/no-set-html-directive": "error"
		// 'no-unused-vars': 'warn'
		rules: {},
	},
	// Must come last: turns off rules that conflict with Prettier's formatting.
	eslintConfigPrettier,
]);
