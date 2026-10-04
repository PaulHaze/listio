import { useState } from 'react';
import type { ListIndexEntry } from '../../storage/lists.ts';
import {
	buildNuvioCollection,
	collectionFilename,
} from '../../domain/nuvioCollection.ts';

export default function ExportCollection({
	lists,
	addonId,
	initialSelected = [],
}: {
	lists: ListIndexEntry[];
	addonId: string;
	initialSelected?: string[];
}) {
	const [name, setName] = useState('');
	const [selected, setSelected] = useState(() =>
		[...new Set(initialSelected)].filter((id) =>
			lists.some(
				(list) => list.id === id && list.count > 0 && list.types.length > 0
			)
		)
	);
	const [message, setMessage] = useState('');
	const [error, setError] = useState('');
	const chosen = selected.map((id) => lists.find((list) => list.id === id)!);
	function move(index: number, offset: number) {
		setSelected((ids) => {
			const next = [...ids];
			[next[index], next[index + offset]] = [next[index + offset], next[index]];
			return next;
		});
	}
	return (
		<form
			className="panel"
			onSubmit={(event) => {
				event.preventDefault();
				setError('');
				setMessage('');
				try {
					const data = buildNuvioCollection(
						name,
						chosen.map((list) => ({
							listId: list.id,
							name: list.name,
							types: list.types,
						})),
						addonId
					);
					const url = URL.createObjectURL(
						new Blob([JSON.stringify(data, null, 2) + '\n'], {
							type: 'application/json',
						})
					);
					const link = document.createElement('a');
					link.href = url;
					link.download = collectionFilename(name);
					document.body.appendChild(link);
					link.click();
					link.remove();
					setTimeout(() => URL.revokeObjectURL(url), 1000);
					setMessage('Collection downloaded. Import the JSON in Nuvio.');
				} catch (failure) {
					setError(
						failure instanceof Error
							? failure.message
							: 'Unable to download. Try again.'
					);
				}
			}}
		>
			<label htmlFor="collection-name">Collection name</label>
			<input
				id="collection-name"
				required
				maxLength={100}
				value={name}
				onChange={(event) => setName(event.target.value)}
			/>
			<p>
				Re-exporting the same name uses the same collection ID. Importing it can
				replace that collection in Nuvio.
			</p>
			<fieldset>
				<legend>Choose Combined Lists</legend>
				{lists.length === 0 && <p>No Combined Lists yet.</p>}
				{lists.map((list) => (
					<label key={list.id} style={{ display: 'block' }}>
						<input
							type="checkbox"
							checked={selected.includes(list.id)}
							disabled={!list.count || !list.types.length}
							onChange={(event) =>
								setSelected((ids) =>
									event.target.checked
										? [...ids, list.id]
										: ids.filter((id) => id !== list.id)
								)
							}
						/>{' '}
						{list.name} ({list.count} {list.count === 1 ? 'Title' : 'Titles'})
						{!list.count && ' — save Titles before exporting'}
					</label>
				))}
			</fieldset>
			{chosen.length > 0 && (
				<>
					<h2>Folder order</h2>
					<ol>
						{chosen.map((list, index) => (
							<li key={list.id}>
								{list.name}{' '}
								<button
									type="button"
									aria-label={`Move ${list.name} up`}
									disabled={index === 0}
									onClick={() => move(index, -1)}
								>
									Up
								</button>{' '}
								<button
									type="button"
									aria-label={`Move ${list.name} down`}
									disabled={index === chosen.length - 1}
									onClick={() => move(index, 1)}
								>
									Down
								</button>
							</li>
						))}
					</ol>
				</>
			)}
			<button type="submit" disabled={!name.trim() || !chosen.length}>
				Download collection
			</button>
			{error && (
				<p className="error" role="alert">
					{error}
				</p>
			)}
			{message && <p role="status">{message}</p>}
			<p>
				For new lists, refresh or reinstall the Listio addon before importing.
				Saved Title updates may take a minute to appear.
			</p>
		</form>
	);
}
