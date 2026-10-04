import type { SectionPreview } from '../domain/pasteSections.ts';
import { ImportListRun } from './importList.ts';

/** Page-local snapshot; completed sections and their review state are never replayed. */
export class ImportQueue {
	readonly entries: { sectionId: string; run: ImportListRun }[];
	active = false;
	constructor(
		sections: readonly SectionPreview[],
		private changed: () => void = () => {}
	) {
		this.entries = sections
			.filter((section) => section.selected)
			.map((section) => ({
				sectionId: section.id,
				run: new ImportListRun(section.name, section.lines, () =>
					this.changed()
				),
			}));
	}
	get unfinished() {
		return this.entries.find(
			(entry) => !['completed', 'skipped'].includes(entry.run.state.phase)
		);
	}
	get progress() {
		const entry = this.unfinished;
		if (!entry) return 'Import complete.';
		const index = this.entries.indexOf(entry);
		const { run } = entry;
		return `${run.name} (${index + 1} of ${this.entries.length}): ${run.state.progress || 'Not started'}`;
	}
	skipUnfinished() {
		if (this.active) return false;
		return this.unfinished?.run.skip() ?? false;
	}
	async continue(signal: AbortSignal) {
		if (this.active) return;
		this.active = true;
		this.changed();
		try {
			for (const { run } of this.entries) {
				if (run.completed || run.state.phase === 'skipped') continue;
				run.retryEmpty();
				await run.continue(signal);
				if (!run.completed) break;
			}
		} finally {
			this.active = false;
			this.changed();
		}
	}
}
