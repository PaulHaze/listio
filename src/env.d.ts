/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
	// Cloudflare's generated Env contract is intentionally declaration-merged.
	// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
	interface Env {
		LISTIO: KVNamespace;
		ADDON_SECRET: string;
	}
}
