import { FolderOpen, SearchX } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/api/errors";
import { CanvasHint, CanvasSurface, useCanvasHint } from "./canvas";
import { CatalogListSkeleton, SampleRegion } from "./catalog-sample";
import { DropZone, FileGrid, FileList, RecentFiles } from "./drive-files";
import { FilePanelSheet } from "./drive-panel";
import {
	DRIVE_MISSING,
	type DriveFolder,
	FILE_KINDS,
	type FileKind,
	folderOf,
	folderPath,
	folderValue,
	inFolder,
	kindOf,
	newestFirst,
	type SampleFile,
} from "./drive-placeholders";
import { FolderCrumbs, FolderRail, FolderSelect } from "./drive-rail";
import { type DriveControls, DriveToolbar } from "./drive-toolbar";
import { EmptyState } from "./empty-state";
import {
	ErrorState,
	type ErrorStateProps,
	Surface,
	type SurfaceQuery,
} from "./surface";

/*
 * The Drive as one browser, in the builders' canvas language: the header
 * (where you are, the toolbar), then the canvas with the folders docked as
 * its tray and the files as cards (or the list) beside them, and the
 * selected file in the Details drawer. A file drags onto a folder to move;
 * the moves are sample, kept for the visit. Its state is the caller's (the
 * URL on /drive), so a folder, a search or a file is a link.
 */

export type DriveState = DriveControls & {
	/** "general", "client:<id>" or "engagement:<id>"; unset is every file. */
	folder?: string;
	/** The selected file's id. */
	file?: string;
};

type DriveQuery = SurfaceQuery<readonly SampleFile[], ApiError>;

/** The files a folder and the controls keep, in the chosen order. */
export function visibleFiles(
	files: readonly SampleFile[],
	folder: DriveFolder,
	controls: Pick<DriveControls, "q" | "kind" | "sort">,
): SampleFile[] {
	const q = controls.q?.trim().toLowerCase() ?? "";
	const kept = files.filter(
		(file) =>
			inFolder(file, folder) &&
			(controls.kind === undefined || kindOf(file.mime) === controls.kind) &&
			(q === "" || file.name.toLowerCase().includes(q)),
	);
	switch (controls.sort) {
		case "name":
			return [...kept].sort((a, b) => a.name.localeCompare(b.name));
		case "size":
			// A tombstone holds no bytes, so it sorts as zero.
			return [...kept].sort(
				(a, b) =>
					(b.purgedAt ? 0 : b.bytes) - (a.purgedAt ? 0 : a.bytes) ||
					a.name.localeCompare(b.name),
			);
		default:
			return newestFirst(kept);
	}
}

/** The four most recent files still held, in a folder. */
export function recentFiles(
	files: readonly SampleFile[],
	folder: DriveFolder,
): SampleFile[] {
	return newestFirst(
		files.filter((f) => inFolder(f, folder) && f.purgedAt === null),
	).slice(0, 4);
}

/** Files per kind in a folder, before any kind chip, for the chip counts. */
export function kindCounts(
	files: readonly SampleFile[],
	folder: DriveFolder,
	q: string | undefined,
): Record<FileKind, number> & { all: number } {
	const pool = visibleFiles(files, folder, { q, sort: "newest" });
	const counts = { all: pool.length } as Record<FileKind, number> & {
		all: number;
	};
	for (const kind of FILE_KINDS) {
		counts[kind] = pool.filter((f) => kindOf(f.mime) === kind).length;
	}
	return counts;
}

/** The files region, around whatever state the list is in. */
function FilesRegion({ children }: { children: ReactNode }) {
	return (
		<SampleRegion
			missing={DRIVE_MISSING.files}
			title="Files"
			what="Every file in this folder: its kind, where it lives, who uploaded it, its size, date and SHA-256."
			data-testid="drive-files"
		>
			{children}
		</SampleRegion>
	);
}

export function DriveBrowser({
	query,
	state,
	onChange,
}: {
	query: DriveQuery;
	state: DriveState;
	onChange: (next: Partial<DriveState>) => void;
}) {
	const failed = (props: ErrorStateProps<ApiError>) => (
		<FilesRegion>
			<ErrorState {...props} />
		</FilesRegion>
	);
	return (
		<div data-testid="drive" className="flex min-h-0 flex-1 flex-col">
			<Surface
				data-testid="drive-surface"
				query={query}
				loading={
					<FilesRegion>
						<CatalogListSkeleton data-testid="drive-skeleton" />
					</FilesRegion>
				}
				empty={
					<FilesRegion>
						<EmptyState
							data-testid="drive-empty"
							compact
							icon={FolderOpen}
							title="The Drive is empty"
							description="Agreements, call notes, brand kits and exports for the agency and each client live here, one store, scoped by who may read them."
						/>
						{/* The top bar has the one Upload button. */}
						<DropZone
							size="large"
							upload={false}
							data-testid="drive-empty-drop"
						/>
					</FilesRegion>
				}
				error={failed}
			>
				{(files) => (
					<DriveLoaded files={files} state={state} onChange={onChange} />
				)}
			</Surface>
		</div>
	);
}

/** Where a file sits: what a move changes. */
export type Placement = Pick<SampleFile, "scope" | "clientId" | "engagementId">;

/** A folder as a place to put a file; All files is every folder, so none. */
export function placementOf(folder: DriveFolder): Placement | null {
	switch (folder.kind) {
		case "all":
			return null;
		case "general":
			return { scope: "general", clientId: null, engagementId: null };
		case "client":
			return {
				scope: "client",
				clientId: folder.client.id,
				engagementId: null,
			};
		case "engagement":
			return {
				scope: "engagement",
				clientId: folder.client.id,
				engagementId: folder.engagement.id,
			};
	}
}

/** The folder's own name: the last part of its path. */
const folderName = (folder: DriveFolder) =>
	folderPath(folder).at(-1) ?? "Drive";

/** Why a file can't go to a folder, or null when it can. */
export function moveProblem(
	file: SampleFile,
	folder: DriveFolder,
): string | null {
	const to = placementOf(folder);
	if (to === null) return "Choose a folder: All files holds every folder.";
	if (file.purgedAt !== null)
		return "Its bytes are destroyed: the tombstone stays where it was.";
	if (
		file.scope === to.scope &&
		file.clientId === to.clientId &&
		file.engagementId === to.engagementId
	)
		return `${file.name} is already in ${folderName(folder)}.`;
	return null;
}

/** The files with this visit's moves applied. Nothing is sent: sample only. */
export function withMoves(
	files: readonly SampleFile[],
	moves: Readonly<Record<string, Placement>>,
): SampleFile[] {
	return files.map((f) => (moves[f.id] ? { ...f, ...moves[f.id] } : f));
}

const DRIVE_HINT =
	"Drag a file onto a folder to move it there, or choose Move to in its details. Click a file to open its details. Sample: moves aren't saved.";

/** The loaded Drive: every part that needs the files. */
function DriveLoaded({
	files: stored,
	state,
	onChange,
}: {
	files: readonly SampleFile[];
	state: DriveState;
	onChange: (next: Partial<DriveState>) => void;
}) {
	// Sample moves, kept for this visit only: no route takes them yet.
	const [moves, setMoves] = useState<Record<string, Placement>>({});
	const [held, setHeld] = useState<string | null>(null);
	const [live, setLive] = useState("");
	const [hintShown, dismissHint] = useCanvasHint("avel.drive.hint");
	const files = withMoves(stored, moves);
	const folder = folderOf(state.folder);
	const shown = visibleFiles(files, folder, state);
	const recent = recentFiles(files, folder);
	const filtering = (state.q ?? "") !== "" || state.kind !== undefined;
	const inFolderCount = files.filter((f) => inFolder(f, folder)).length;
	// A file is shown only if it is one of these files: a stale ?file= opens nothing.
	const selected = files.find((f) => f.id === state.file);
	const open = (id: string) => onChange({ file: id });
	const close = () => onChange({ file: undefined });
	const goTo = (next: string | undefined) =>
		onChange({ folder: next, file: undefined });
	const move = (id: string, value: string | undefined) => {
		const file = files.find((f) => f.id === id);
		if (!file) return;
		const to = folderOf(value);
		const problem = moveProblem(file, to);
		const place = placementOf(to);
		if (problem || place === null) {
			setLive(problem ?? "");
			return;
		}
		setMoves((m) => ({ ...m, [id]: place }));
		setLive(`Moved ${file.name} to ${folderName(to)}. Sample: not saved.`);
	};

	return (
		<div className="flex min-w-0 flex-1 flex-col gap-4">
			{/* Moves and refusals, read out. */}
			<p aria-live="polite" data-testid="drive-live" className="sr-only">
				{live}
			</p>
			{/* The canvas header, as Teams and Playbooks have: where you are, then
			    the search, kinds, sort and view. */}
			<header data-testid="drive-canvas-header" className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center gap-3">
					<FolderCrumbs folder={folder} onChange={goTo} />
					<div className="lg:hidden">
						<FolderSelect current={state.folder} onChange={goTo} />
					</div>
					<span
						data-testid="drive-showing"
						className="ml-auto type-caption text-text-subtle tabular-nums"
					>{`Showing ${shown.length} of ${inFolderCount}`}</span>
				</div>
				<DriveToolbar
					controls={state}
					onChange={(next) => onChange(next)}
					counts={kindCounts(files, folder, state.q)}
				/>
			</header>

			{/* The canvas: the folders docked left as the tray, the files as
			    cards on the band. */}
			<CanvasSurface data-testid="drive-canvas">
				{hintShown ? (
					<CanvasHint data-testid="drive-hint" onDismiss={dismissHint}>
						{DRIVE_HINT}
					</CanvasHint>
				) : null}
				<div className="grid min-h-0 flex-1 items-start gap-3 lg:grid-cols-[15rem_minmax(0,1fr)]">
					<aside
						aria-label="Folders"
						data-testid="drive-rail-column"
						className="hidden flex-col gap-2 rounded-card border border-border bg-app-panel p-2 shadow-card lg:flex"
					>
						<h2 className="px-2 pt-1 type-small font-medium text-text">
							Folders
						</h2>
						<SampleRegion
							missing={DRIVE_MISSING.folders}
							title="Folders"
							what="General, then each client with its engagements, and how many files each holds."
							data-testid="drive-folders"
						>
							<FolderRail
								files={files}
								current={state.folder}
								onChange={goTo}
								holding={held !== null}
								onDropFile={(value) => {
									if (held) move(held, value);
									setHeld(null);
								}}
							/>
						</SampleRegion>
						<p
							data-testid="drive-moves-note"
							className="px-2 pb-1 type-caption text-text-subtle"
						>
							Sample: moves aren't saved.
						</p>
					</aside>

					<div className="flex min-w-0 flex-col gap-4">
						<DropZone upload={false} data-testid="drive-drop" />
						<FilesRegion>
							{!filtering && recent.length > 0 ? (
								<section
									aria-label="Recent"
									className="@container flex flex-col gap-2"
								>
									<h2 className="type-eyebrow">Recent</h2>
									<RecentFiles files={recent} onOpen={open} />
								</section>
							) : null}
							{shown.length === 0 ? (
								<EmptyState
									data-testid="drive-no-match"
									compact
									icon={filtering ? SearchX : FolderOpen}
									title={filtering ? "No files match" : "This folder is empty"}
									description={
										filtering
											? "Nothing in this folder matches the search and kind chosen."
											: "Files uploaded for this scope will appear here. Drag a file onto this folder in the tray to move it here."
									}
									action={
										filtering ? (
											<Button
												size="sm"
												variant="outline"
												data-testid="drive-clear"
												onClick={() =>
													onChange({ q: undefined, kind: undefined })
												}
											>
												Clear filters
											</Button>
										) : undefined
									}
								/>
							) : (
								<section aria-label="All files" className="flex flex-col gap-2">
									<h2 className="type-eyebrow">
										{filtering ? "Matching files" : "All files"}
									</h2>
									{state.view === "grid" ? (
										<FileGrid
											files={shown}
											selectedId={state.file}
											onOpen={open}
											heldId={held}
											onHold={setHeld}
										/>
									) : (
										<div className="rounded-card border border-border bg-app-panel shadow-card">
											<FileList files={shown} onOpen={open} />
										</div>
									)}
								</section>
							)}
						</FilesRegion>
					</div>
				</div>
			</CanvasSurface>

			{/* The file's details: the drawer, as the builders' Details. */}
			{selected ? (
				<FilePanelSheet
					file={selected}
					onClose={close}
					open
					moveTo={
						selected.purgedAt === null ? (
							<FolderSelect
								fieldLabel="Move to"
								visibleLabel
								data-testid="drive-move-to"
								current={folderValue(placeFolder(selected))}
								onChange={(value) => move(selected.id, value)}
							/>
						) : null
					}
				/>
			) : null}
		</div>
	);
}

/** The folder a file sits in, as the rail names it. */
function placeFolder(file: SampleFile): DriveFolder {
	if (file.engagementId) return folderOf(`engagement:${file.engagementId}`);
	if (file.clientId) return folderOf(`client:${file.clientId}`);
	return { kind: "general" };
}
