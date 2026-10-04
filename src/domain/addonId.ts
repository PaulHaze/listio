export const DEFAULT_ADDON_ID = 'org.listio.addon';

/** The one place the configured `ADDON_ID` is resolved, so the manifest's `id`
 * and exported collections' `addonId` always agree. */
export function resolveAddonId(configured?: string) {
	return configured?.trim() || DEFAULT_ADDON_ID;
}
