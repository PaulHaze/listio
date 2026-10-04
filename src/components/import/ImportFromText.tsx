import { useEffect, useRef, useState } from 'react';
import type { ListIndexEntry } from '../../storage/lists.ts';
import { parseImport, validateImportName } from '../../domain/pasteSections.ts';
import { ImportListRun, type ImportState } from '../../client/importList.ts';
import { NeedALook } from '../titles/TitleControls.tsx';

export default function ImportFromText({
	initialLists,
}: {
	initialLists: ListIndexEntry[];
}) {
	const [name, setName] = useState('');
	const [text, setText] = useState('');
	const [fileError, setFileError] = useState('');
	const [reading, setReading] = useState(false);
	const [copyMessage, setCopyMessage] = useState('');
	const [state, setState] = useState<ImportState | null>(null);
	const [busy, setBusy] = useState(0);
	const run = useRef<ImportListRun | null>(null);
	const controller = useRef(new AbortController());
	const readId = useRef(0);
	useEffect(() => {
		controller.current = new AbortController();
		return () => {
			controller.current.abort();
			readId.current++;
		};
	}, []);
	const parsed = parseImport(text, 'single');
	const nameError = validateImportName(name, initialLists);
	const active =
		!!state && ['matching', 'creating', 'saving'].includes(state.phase);
	const locked = !!state && state.phase !== 'empty';
	const unresolved = state?.review.filter((row) => !row.resolved).length ?? 0;
	useEffect(() => {
		if (!unresolved && !active && !(state?.phase === 'stopped' && state.list))
			return;
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = '';
		};
		const fullLoad = (event: Event) => event.preventDefault();
		window.addEventListener('beforeunload', warn);
		document.addEventListener('astro:before-preparation', fullLoad);
		return () => {
			window.removeEventListener('beforeunload', warn);
			document.removeEventListener('astro:before-preparation', fullLoad);
		};
	}, [unresolved, active, state?.phase, state?.list]);
	async function upload(file: File) {
		const id = ++readId.current;
		setFileError('');
		if (!/\.(txt|md)$/i.test(file.name)) {
			setFileError('Choose a .txt or .md file.');
			return;
		}
		setReading(true);
		try {
			const content = await file.text();
			if (id === readId.current) {
				setText(content);
				setState(null);
			}
		} catch {
			if (id === readId.current)
				setFileError('Unable to read this file. Try uploading it again.');
		} finally {
			if (id === readId.current) setReading(false);
		}
	}
	function start() {
		if (
			active ||
			locked ||
			reading ||
			fileError ||
			(run.current && run.current.state.phase !== 'empty') ||
			nameError ||
			parsed.errors.length ||
			!parsed.lines.length
		)
			return;
		run.current = new ImportListRun(name, parsed.lines, setState);
		void run.current.continue(controller.current.signal);
	}
	return (
		<div className="discovery-panels">
			<section className="panel">
				<label htmlFor="import-name">List name</label>
				<input
					id="import-name"
					value={name}
					disabled={locked || reading}
					onChange={(event) => {
						setName(event.target.value);
						setState(null);
					}}
				/>
				{nameError && (
					<p className="error" role="alert">
						{nameError}
						{initialLists.some(
							(list) =>
								list.name.trim().toLowerCase() === name.trim().toLowerCase()
						) && (
							<>
								{' '}
								<a
									href={`/lists/${encodeURIComponent(initialLists.find((list) => list.name.trim().toLowerCase() === name.trim().toLowerCase())!.id)}`}
								>
									Open existing list
								</a>
							</>
						)}
					</p>
				)}
				<label htmlFor="import-text">
					One Title per line, optionally with a year (1999)
				</label>
				<textarea
					id="import-text"
					rows={12}
					value={text}
					disabled={locked || reading}
					onChange={(event) => {
						setText(event.target.value);
						setFileError('');
						setState(null);
					}}
				/>
				<label htmlFor="import-upload">Upload .txt/.md</label>
				<input
					id="import-upload"
					type="file"
					accept=".txt,.md,text/plain,text/markdown"
					disabled={locked || reading}
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = '';
						if (file) void upload(file);
					}}
				/>
				{fileError && (
					<p className="error" role="alert">
						{fileError}
					</p>
				)}
				{parsed.errors.map((error) => (
					<p key={error.line} className="error" role="alert">
						{error.message}
					</p>
				))}
				{!parsed.lines.length && (
					<p className="error" role="alert">
						Paste at least one title.
					</p>
				)}
				<button
					type="button"
					disabled={
						locked ||
						reading ||
						!!fileError ||
						!!nameError ||
						!!parsed.errors.length ||
						!parsed.lines.length
					}
					onClick={start}
				>
					Import
				</button>
				{reading && <p role="status">Reading file…</p>}
			</section>
			{state && (
				<section className="panel">
					<p role="status">{state.progress}</p>
					{state.error && (
						<p className="error" role="alert">
							{state.error}
						</p>
					)}
					{state.phase === 'stopped' && (
						<button
							type="button"
							onClick={() =>
								void run.current?.continue(controller.current.signal)
							}
						>
							Continue import
						</button>
					)}
					{state.list && (
						<h2>
							<a href={`/lists/${encodeURIComponent(state.list.id)}`}>
								{state.list.name}
							</a>
							{state.phase !== 'completed' ? ' — save pending' : ''}
						</h2>
					)}
					{state.phase === 'completed' && (
						<>
							<p role="status">
								{state.list!.titles.length} Titles saved · {state.duplicates}{' '}
								duplicates skipped · {unresolved} Need a look
							</p>
							<p className="notice">
								Saved. Refresh the Listio addon in Nuvio to see new Catalogs.
								Title updates can take up to a minute.
							</p>
							{unresolved > 0 && (
								<>
									<h3>Need a look</h3>
									<button
										type="button"
										onClick={() => {
											void navigator.clipboard
												.writeText(run.current!.unresolvedText())
												.then(() => setCopyMessage('Unresolved lines copied.'))
												.catch(() =>
													setCopyMessage(
														'Unable to copy. Select and copy the remaining lines below.'
													)
												);
										}}
									>
										Copy unresolved lines
									</button>
									<p role="status">{copyMessage}</p>
								</>
							)}
							<NeedALook
								rows={state.review}
								current={state.list!}
								disabled={busy > 0}
								busy={(delta) => setBusy((value) => value + delta)}
								add={(title) =>
									run.current!.add(title, controller.current.signal)
								}
								onResolved={(row, status) =>
									run.current!.resolve(row, status === 'duplicate')
								}
							/>
						</>
					)}
				</section>
			)}
		</div>
	);
}
