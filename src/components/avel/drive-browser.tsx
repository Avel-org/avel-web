import { FolderOpen, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/api/errors";
import { useMinWidth } from "@/lib/use-min-width";
import { cn } from "@/lib/utils";
import { CatalogListSkeleton, SampleRegion } from "./catalog-sample";
import { DropZone, FileGrid, FileList, RecentFiles } from "./drive-files";
import { FilePanelAside, FilePanelSheet } from "./drive-panel";
import {
	DRIVE_MISSING,
	type DriveFolder,
	FILE_KINDS,
	type FileKind,
	folderOf,
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
 * The Drive as one browser: the folder rail, the storage strip, the toolbar
 * and drop zone, the four most recent files, then every file in the folder as
 * a list or a grid, and the selected file's panel. Its state is the caller's
 * (the URL on /drive), so a folder, a search or a file is a link.
 */

export type DriveState = DriveControls & {
	/** "general", "client:<id>" or "engagement:<id>"; unset is every file. */
	folder?: string;
	/** The selected file's id. */
	file?: string;
};

export type DriveQuery = SurfaceQuery<readonly SampleFile[], ApiError>;

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
						<DropZone size="large" data-testid="drive-empty-drop" />
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

/** The loaded Drive: every part that needs the files. */
function DriveLoaded({
	files,
	state,
	onChange,
}: {
	files: readonly SampleFile[];
	state: DriveState;
	onChange: (next: Partial<DriveState>) => void;
}) {
	const is2xl = useMinWidth("96rem");
	const folder = folderOf(state.folder);
	const shown = visibleFiles(files, folder, state);
	const recent = recentFiles(files, folder);
	const filtering = (state.q ?? "") !== "" || state.kind !== undefined;
	// A file is shown only if it is one of these files: a stale ?file= opens nothing.
	const selected = files.find((f) => f.id === state.file);
	const open = (id: string) => onChange({ file: id });
	const close = () => onChange({ file: undefined });
	const goTo = (next: string | undefined) =>
		onChange({ folder: next, file: undefined });

	return (
		<div className="flex min-w-0 flex-1 items-start gap-6">
			{/* The panel takes the rail's place beside the list at 2xl, so the list keeps its width. */}
			<div
				data-testid="drive-rail-column"
				className={cn(
					"hidden w-60 shrink-0 lg:block",
					selected && "2xl:hidden",
				)}
			>
				<SampleRegion
					missing={DRIVE_MISSING.folders}
					title="Folders"
					what="General, then each client with its engagements, and how many files each holds."
					data-testid="drive-folders"
				>
					<FolderRail files={files} current={state.folder} onChange={goTo} />
				</SampleRegion>
			</div>

			<div className="flex min-w-0 flex-1 flex-col gap-4">
				<div className="flex flex-col gap-3">
					<div className="lg:hidden">
						<FolderSelect current={state.folder} onChange={goTo} />
					</div>
					<DriveToolbar
						controls={state}
						onChange={(next) => onChange(next)}
						counts={kindCounts(files, folder, state.q)}
					/>
					<DropZone data-testid="drive-drop" />
				</div>

				<FilesRegion>
					<FolderCrumbs folder={folder} onChange={goTo} />
					{!filtering && recent.length > 0 ? (
						<section
							aria-label="Recent"
							className="@container flex flex-col gap-2"
						>
							<h2 className="type-caption text-text-subtle">Recent</h2>
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
									: "Files uploaded for this scope will appear here."
							}
							action={
								filtering ? (
									<Button
										size="sm"
										variant="outline"
										data-testid="drive-clear"
										onClick={() => onChange({ q: undefined, kind: undefined })}
									>
										Clear search and kind
									</Button>
								) : undefined
							}
						/>
					) : (
						<section aria-label="All files" className="flex flex-col gap-2">
							<h2 className="flex items-baseline gap-2 type-caption text-text-subtle">
								{filtering ? "Matching files" : "All files"}
								<span
									data-testid="drive-showing"
									className="type-mono-small tabular-nums"
								>{`${shown.length} of ${files.filter((f) => inFolder(f, folder)).length}`}</span>
							</h2>
							{state.view === "grid" ? (
								<FileGrid files={shown} selectedId={state.file} onOpen={open} />
							) : (
								<FileList files={shown} onOpen={open} />
							)}
						</section>
					)}
				</FilesRegion>
			</div>

			{selected ? <FilePanelAside file={selected} onClose={close} /> : null}
			{selected ? (
				<FilePanelSheet
					file={selected}
					onClose={close}
					open={is2xl === false}
				/>
			) : null}
		</div>
	);
}
