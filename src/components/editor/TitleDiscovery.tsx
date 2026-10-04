import { useEffect, useRef, useState } from 'react';
import type { Title } from '../../domain/types.ts';
import { pasteLines, type PasteLine } from '../../domain/pasteLines.ts';
import type { MatchResult } from '../../tmdb/match.ts';
import type { Draft } from './draft.ts';
import { matchLines } from '../../client/matchLines.ts';
import { titleFor, sameId } from '../../client/titleIdentity.ts';
import {
	Search,
	NeedALook,
	type ReviewLine,
	type AddStatus,
} from '../titles/TitleControls.tsx';

const lineKey = (line: PasteLine) => line.line.trim().toLowerCase();
export default function TitleDiscovery({
	draft,
	saving,
	add,
	busy,
}: {
	draft: Draft;
	saving: boolean;
	add: (title: Title) => AddStatus;
	busy: (delta: number) => void;
}) {
	const [text, setText] = useState('');
	const [matching, setMatching] = useState(false);
	const [adding, setAdding] = useState(0);
	const additionBusy = (delta: number) => {
		setAdding((n) => n + delta);
		busy(delta);
	};
	const [progress, setProgress] = useState('');
	const [summary, setSummary] = useState<{
		added: number;
		duplicate: number;
	} | null>(null);
	const [review, setReview] = useState<ReviewLine[]>([]);
	const [error, setError] = useState('');
	const controller = useRef<AbortController | null>(null);
	const draftRef = useRef(draft);
	draftRef.current = draft;
	const reviewRef = useRef(review);
	reviewRef.current = review;
	// Pasted line → IMDb ID chosen in Need a look, reused on a repeat paste.
	const resolutions = useRef(new Map<string, string>());
	useEffect(() => {
		controller.current = new AbortController();
		return () => controller.current?.abort();
	}, []);
	const signal = () => controller.current!.signal;
	/** A Draft Title this line was already resolved to, if any. */
	function known(line: PasteLine, result: MatchResult): Title | undefined {
		const current = draftRef.current;
		const chosen = resolutions.current.get(lineKey(line));
		const byChoice =
			chosen &&
			[...current.titles, ...current.removed].find((t) =>
				sameId(t.imdbId, chosen)
			);
		if (byChoice) return byChoice;
		if (result.status === 'ambiguous')
			for (const candidate of result.candidates) {
				const title = titleFor(current, candidate);
				if (title) return title;
			}
	}
	async function find() {
		const lines = pasteLines(text);
		if (!lines.length || matching || saving || adding) return;
		setMatching(true);
		busy(1);
		setError('');
		setReview([]);
		setSummary(null);
		let added = 0,
			duplicate = 0;
		const unresolved: ReviewLine[] = [];
		try {
			await matchLines(lines, signal(), {
				onProgress: ({ phase, completed, total }) =>
					setProgress(`${phase} ${completed} / ${total}…`),
				onResult: (line, result) => {
					const title =
						result.status === 'matched' ? result.title : known(line, result);
					if (title) {
						if (add(title) === 'duplicate') duplicate++;
						else added++;
					} else unresolved.push({ ...line, result, resolved: false });
					setReview([...unresolved]);
					setSummary({ added, duplicate });
				},
			});
			setProgress('');
		} catch (error) {
			if (!signal().aborted) {
				setError(
					error instanceof Error ? error.message : 'Unable to match Titles.'
				);
				setReview([...unresolved]);
				setSummary({ added, duplicate });
				setProgress(
					'Matching stopped. Completed batches remain in your Draft; retry the pasted lines safely.'
				);
			}
		} finally {
			busy(-1);
			if (!signal().aborted) {
				setMatching(false);
			}
		}
	}
	function resolve(row: ReviewLine, status?: AddStatus, title?: Title) {
		if (!reviewRef.current.includes(row)) return;
		if (title) resolutions.current.set(lineKey(row), title.imdbId);
		setReview((rows) =>
			rows.map((r) => (r === row ? { ...r, resolved: true } : r))
		);
		if (status)
			setSummary(
				(value) =>
					value && {
						...value,
						[status === 'duplicate' ? 'duplicate' : 'added']:
							value[status === 'duplicate' ? 'duplicate' : 'added'] + 1,
					}
			);
	}
	return (
		<div className="discovery-panels">
			<section className="panel" aria-labelledby="search-heading">
				<h2 id="search-heading">Search Titles</h2>
				<p>
					Find Movies and Series to add to your Draft. Only Save publishes to
					Nuvio.
				</p>
				<Search
					current={draft}
					disabled={saving}
					add={add}
					busy={additionBusy}
				/>
			</section>
			<section className="panel" aria-labelledby="paste-heading">
				<h2 id="paste-heading">Paste titles</h2>
				<label htmlFor="paste-titles">
					One Title per line, optionally with a year (1999)
				</label>
				<textarea
					id="paste-titles"
					rows={8}
					value={text}
					disabled={saving || matching}
					onChange={(event) => setText(event.target.value)}
				/>
				<button
					type="button"
					disabled={
						saving || matching || adding > 0 || !pasteLines(text).length
					}
					onClick={() => void find()}
				>
					Find titles
				</button>
				<p role="status">{progress}</p>
				{summary && (
					<p role="status">
						{summary.added} added · {summary.duplicate} already in list ·{' '}
						{review.filter((row) => !row.resolved).length} need a look
					</p>
				)}
				{error && (
					<p className="error" role="alert">
						{error}
					</p>
				)}
				{review.some((row) => !row.resolved) && <h3>Need a look</h3>}
				<NeedALook
					rows={review}
					current={draft}
					disabled={saving || matching}
					add={add}
					busy={additionBusy}
					onResolved={resolve}
				/>
			</section>
		</div>
	);
}
