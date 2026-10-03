/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
	// Cloudflare's generated Env contract is intentionally declaration-merged.
	// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
	interface Env {
		LISTIO: KVNamespace;
		ADDON_SECRET: string;
		ADDON_ID?: string;
		TRAKT_CLIENT_ID: string;
		MDBLIST_API_KEY: string;
		TMDB_API_KEY: string;
		ADMIN_USER: string;
		ADMIN_PASSWORD: string;
	}
}
