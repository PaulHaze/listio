import type { CombinedList, Title } from '../domain/types.ts';
import type { PasteLine } from '../domain/pasteLines.ts';
import { validateImportName } from '../domain/pasteSections.ts';
import type { ListIndexEntry } from '../storage/lists.ts';
import { addTitle } from '../domain/merge.ts';
import type { ReviewLine } from './review.ts';
import { api, ApiError } from './api.ts';
import { matchLines, type CompletedMatch } from './matchLines.ts';

const createDraft = (list: CombinedList) => ({
	...list,
	newIds: new Set<string>(),
});

export type ImportState = {
	phase:
		| 'idle'
		| 'matching'
		| 'creating'
		| 'saving'
		| 'stopped'
		| 'rejected'
		| 'empty'
		| 'completed'
		| 'skipped';
	progress: string;
	error: string;
	list: CombinedList | null;
	matches: CompletedMatch[];
	review: ReviewLine[];
	duplicates: number;
};
/** One snapshot / one list. Kept in memory; callers can reuse this for each section. */
export class ImportListRun {
	name: string;
	readonly lines: PasteLine[];
	state: ImportState = {
		phase: 'idle',
		progress: '',
		error: '',
		list: null,
		matches: [],
		review: [],
		duplicates: 0,
	};
	private active = false;
	private uncertainCreate = false;
	private creationId = crypto.randomUUID();
	private adding = false;
	private existingId?: string;
	private overwrite = false;
	constructor(
		name: string,
		lines: PasteLine[],
		private changed: (state: ImportState) => void = () => {},
		target?: { id: string; overwrite: boolean }
	) {
		this.name = name.trim();
		this.lines = lines.map((line) => ({ ...line }));
		this.existingId = target?.id;
		this.overwrite = target?.overwrite ?? false;
	}
	private update(change: Partial<ImportState>) {
		this.state = { ...this.state, ...change };
		this.changed(this.state);
	}
	rename(name: string) {
		if (this.state.phase !== 'rejected' || this.uncertainCreate || this.active)
			return;
		this.name = name.trim();
		this.creationId = crypto.randomUUID();
		this.update({ error: '' });
	}
	get completed() {
		return this.state.phase === 'completed';
	}
	get canSkip() {
		return (
			!this.active &&
			!this.uncertainCreate &&
			!this.state.list &&
			['idle', 'stopped', 'rejected', 'empty'].includes(this.state.phase)
		);
	}
	skip() {
		if (!this.canSkip) return false;
		this.update({
			phase: 'skipped',
			progress: 'Skipped; no list created.',
			error: '',
			review: [],
		});
		return true;
	}
	retryEmpty() {
		if (this.state.phase === 'empty' && !this.active)
			this.update({ phase: 'idle', matches: [], review: [], error: '' });
	}
	async continue(signal: AbortSignal): Promise<void> {
		if (
			this.active ||
			this.state.phase === 'completed' ||
			this.state.phase === 'skipped' ||
			this.state.phase === 'empty'
		)
			return;
		this.active = true;
		this.update({ error: '' });
		try {
			const remaining = this.lines.filter(
				(line) => !this.state.matches.some((done) => done.line === line)
			);
			if (remaining.length) {
				this.update({ phase: 'matching' });
				const settled = this.state.matches.length;
				await matchLines(remaining, signal, {
					onProgress: ({ phase, completed, total }) =>
						this.update({
							progress: `${phase} ${phase === 'Matching' ? settled + completed : completed} / ${phase === 'Matching' ? this.lines.length : total}`,
						}),
					onResult: (line, result) =>
						this.update({ matches: [...this.state.matches, { line, result }] }),
				});
			}
			const confident = this.state.matches.flatMap(({ result }) =>
				result.status === 'matched' ? [result.title] : []
			);
			const review = this.state.matches
				.filter(({ result }) => result.status !== 'matched')
				.map(({ line, result }) => ({ ...line, result, resolved: false }));
			this.update({ review });
			if (!confident.length) {
				const reason = review.find(
					(row) =>
						row.result.status !== 'matched' &&
						((row.result.status === 'none' && row.result.retry) ||
							(row.result.reason && row.result.reason !== 'No match'))
				);
				this.update({
					phase: 'empty',
					progress: '',
					error:
						reason && reason.result.status !== 'matched'
							? `${reason.result.reason || 'Matching is temporarily unavailable.'} Try again shortly.`
							: 'No titles were found. Check the list format and try again.',
				});
				return;
			}
			this.update({
				duplicates:
					confident.length -
					new Set(confident.map((title) => title.imdbId.toLowerCase())).size,
			});
			if (!this.state.list && this.existingId) {
				this.update({ phase: 'creating', progress: 'Loading saved list…' });
				this.update({
					list: await api<CombinedList>(
						`/api/lists/${encodeURIComponent(this.existingId)}`,
						signal
					),
				});
			} else if (!this.state.list) {
				this.update({ phase: 'creating', progress: 'Checking saved lists…' });
				if (!this.uncertainCreate) {
					const index = await api<ListIndexEntry[]>('/api/lists', signal);
					const error = validateImportName(this.name, index);
					if (error) {
						this.update({ phase: 'rejected' });
						throw new Error(error + ' Choose another name.');
					}
				}
				this.update({ progress: 'Creating list…' });
				const previouslyUncertain = this.uncertainCreate;
				this.uncertainCreate = true;
				try {
					const list = await api<CombinedList>('/api/lists', signal, {
						name: this.name,
						creationId: this.creationId,
					});
					this.update({ list });
					this.uncertainCreate = false;
				} catch (error) {
					if (
						!previouslyUncertain &&
						error instanceof ApiError &&
						error.status >= 400 &&
						error.status < 500
					) {
						this.uncertainCreate = false;
						this.update({ phase: 'rejected' });
					}
					throw error;
				}
			} else {
				// Reconcile a save whose response was lost; use the latest version and preserve Titles.
				const current = await api<CombinedList>(
					`/api/lists/${encodeURIComponent(this.state.list.id)}`,
					signal
				);
				this.update({
					list:
						current.version >= this.state.list.version
							? current
							: this.state.list,
				});
			}
			this.update({ phase: 'saving', progress: 'Saving Titles…' });
			let draft = createDraft(this.state.list!);
			if (this.overwrite)
				draft = { ...draft, titles: [], removed: [], sources: [], nextSeq: 0 };
			for (const title of confident) draft = addTitle(draft, title).draft;
			const saved = await this.save(draft, signal);
			this.update({ list: saved, phase: 'completed', progress: '' });
		} catch (error) {
			this.update({
				phase: this.state.phase === 'rejected' ? 'rejected' : 'stopped',
				progress: this.state.list
					? 'List created; saving Titles is pending. Continue fills this same list.'
					: 'Import stopped; no completed result.',
				error:
					error instanceof Error ? error.message : 'Unable to import Titles.',
			});
		} finally {
			this.active = false;
		}
	}
	private save(list: CombinedList, signal: AbortSignal) {
		const { version, sort, titles, removed, sources } = list;
		return api<CombinedList>(
			`/api/lists/${encodeURIComponent(list.id)}`,
			signal,
			{ version, sort, titles, removed, sources },
			'PUT'
		);
	}
	async add(title: Title, signal: AbortSignal) {
		if (this.adding || this.state.phase !== 'completed' || !this.state.list)
			throw new Error('Wait for the current save to finish.');
		this.adding = true;
		try {
			const current = await api<CombinedList>(
				`/api/lists/${encodeURIComponent(this.state.list.id)}`,
				signal
			);
			const latest =
				current.version >= this.state.list.version ? current : this.state.list;
			const result = addTitle(createDraft(latest), title);
			const saved =
				result.status === 'duplicate'
					? latest
					: await this.save(result.draft, signal);
			this.update({ list: saved });
			return result.status;
		} finally {
			this.adding = false;
		}
	}
	resolve(row: ReviewLine, duplicate = false) {
		if (!this.state.review.includes(row) || row.resolved) return;
		this.update({
			review: this.state.review.map((entry) =>
				entry === row ? { ...entry, resolved: true } : entry
			),
			duplicates: this.state.duplicates + (duplicate ? 1 : 0),
		});
	}
	unresolvedText() {
		return this.state.review
			.filter((row) => !row.resolved)
			.map((row) => row.line)
			.join('\n');
	}
}
