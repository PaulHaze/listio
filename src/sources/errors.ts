/** A Source needs more upstream pages than one Worker invocation may spend. */
export class SourceRequestBudgetError extends Error {
	constructor(maxPages: number) {
		super(
			`This Source needs more than ${maxPages} API pages. No Titles were imported.`
		);
		this.name = 'SourceRequestBudgetError';
	}
}
