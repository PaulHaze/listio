const FALLBACK_SLUG = 'list';

function existingChecker(
	existing: Iterable<string> | ((candidate: string) => boolean)
): (candidate: string) => boolean {
	if (typeof existing === 'function') return existing;

	const ids = new Set(existing);
	return (candidate) => ids.has(candidate);
}

/** Turn a display name into the stable, URL-safe base id for a Combined List. */
export function slugify(name: string): string {
	const slug = name
		.trim()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return slug || FALLBACK_SLUG;
}

/** Alias that reads naturally at call sites creating a new Combined List. */
export const slugifyName = slugify;

/**
 * Return a slug that does not collide with an existing id.
 *
 * The first collision receives `-2`, then `-3`, and so on. `existing` can be
 * a set/array of ids or a predicate backed by a KV/index lookup.
 */
export function uniqueSlug(
	name: string,
	existing: Iterable<string> | ((candidate: string) => boolean) = []
): string {
	const base = slugify(name);
	const isTaken = existingChecker(existing);
	if (!isTaken(base)) return base;

	let suffix = 2;
	while (isTaken(`${base}-${suffix}`)) suffix += 1;
	return `${base}-${suffix}`;
}

export const createUniqueSlug = uniqueSlug;
export const makeUniqueSlug = uniqueSlug;
