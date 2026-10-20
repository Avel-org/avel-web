import type { Intake, IntakeFile } from "avel-server/contract";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { type DragEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/api/clients";
import {
	intakeFileContentUrl,
	loadedIntakeFiles,
	uploadProblem,
	useIntakeFiles,
	usePurgeIntakeFile,
	useUploadIntakeFile,
} from "@/lib/api/intake-files";
import { describeError } from "@/lib/error-map";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { ActionModal } from "./action-modal";
import { ActorMark } from "./actor";
import { DataPanel } from "./data-panel";
import { EmptyState } from "./empty-state";
import { Paging, PanelFooter } from "./panel-footer";
import { Reason } from "./reason";
import { ErrorState, Surface } from "./surface";

/*
 * An intake's Drive files: the documents its brief is drafted from. A draft
 * or proposed intake takes uploads (text only, up to 10 MB, one at a time);
 * each file downloads, never opens inline, and a purge destroys its bytes
 * and leaves a tombstone, shown under Show purged.
 */

/** "12.4 KB": a file's size for a row. */
export function fileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Queued = { file: File; key: string };

export type UploadQueue<T> = { add: (items: T[]) => Promise<void> };

/**
 * One at a time, across every drop: items join one queue and a single loop
 * drains it, so a second drop never starts a second loop and two uploads
 * never overlap. `run` handles its own failures; the loop just moves on.
 */
export function uploadQueue<T>(
	run: (item: T) => Promise<void>,
): UploadQueue<T> {
	const waiting: T[] = [];
	let running = false;
	const drain = async () => {
		if (running) return;
		running = true;
		try {
			for (
				let next = waiting.shift();
				next !== undefined;
				next = waiting.shift()
			)
				await run(next);
		} finally {
			running = false;
		}
	};
	return {
		add(items) {
			waiting.push(...items);
			return drain();
		},
	};
}

type Pending = {
	key: string;
	name: string;
	state: "waiting" | "uploading" | "refused";
	message?: string;
};

export function IntakeFiles({ intake }: { intake: Intake }) {
	const [showPurged, setShowPurged] = useState(false);
	const files = useIntakeFiles(intake.id, showPurged);
	const upload = useUploadIntakeFile(intake.id);
	const [pending, setPending] = useState<Pending[]>([]);
	const [purging, setPurging] = useState<IntakeFile | null>(null);
	const takes = intake.status === "draft" || intake.status === "proposed";
	const total = files.data?.pages[0]?.meta.total;
	const now = useNow();

	// One upload at a time across every drop: a new drop joins the one queue.
	const uploadOne = async ({ file, key }: Queued) => {
		setPending((list) =>
			list.map((p) => (p.key === key ? { ...p, state: "uploading" } : p)),
		);
		try {
			await upload.mutateAsync({ file, name: file.name });
			setPending((list) => list.filter((p) => p.key !== key));
		} catch (error) {
			const copy =
				error instanceof Error && "failure" in error
					? describeError(error as Parameters<typeof describeError>[0])
					: null;
			setPending((list) =>
				list.map((p) =>
					p.key === key
						? {
								...p,
								state: "refused",
								message:
									copy?.what ?? "Only UTF-8 text uploads: .md, .txt or .html.",
							}
						: p,
				),
			);
		}
	};
	// The queue outlives renders; it calls the latest uploadOne.
	const latest = useRef(uploadOne);
	latest.current = uploadOne;
	const queue = useRef<UploadQueue<Queued> | null>(null);
	queue.current ??= uploadQueue((item: Queued) => latest.current(item));

	const send = (chosen: File[]) => {
		const queued = chosen.map((file, i) => ({
			file,
			key: `${Date.now()}-${i}-${file.name}`,
		}));
		setPending((list) => [
			...list,
			...queued.map(({ file, key }) => {
				const problem = uploadProblem(file);
				return problem
					? {
							key,
							name: file.name,
							state: "refused" as const,
							message: problem,
						}
					: { key, name: file.name, state: "waiting" as const };
			}),
		]);
		void queue.current?.add(queued.filter(({ file }) => !uploadProblem(file)));
	};

	return (
		<DataPanel
			data-testid="intake-files"
			title="Files"
			count={total}
			toolbar={
				<div className="flex w-full items-center">
					<Button
						variant="ghost"
						size="sm"
						aria-pressed={showPurged}
						data-testid="intake-files-show-purged"
						className="ml-auto aria-pressed:bg-selected"
						onClick={() => setShowPurged((on) => !on)}
					>
						Show purged
					</Button>
				</div>
			}
			footer={
				<PanelFooter data-testid="intake-files-read-age" queries={[files]}>
					{files.data ? (
						<Paging
							loaded={loadedIntakeFiles(files.data).length}
							total={total}
							hasMore={files.hasNextPage}
							loadingMore={files.isFetchingNextPage}
							onLoadMore={() => files.fetchNextPage()}
							testIdPrefix="intake-files"
						/>
					) : null}
				</PanelFooter>
			}
		>
			<div className="flex flex-col gap-3 p-4">
				{takes ? <FileDrop onFiles={send} /> : null}
				{pending.length > 0 ? (
					<ul
						data-testid="intake-files-pending"
						className="flex flex-col gap-1"
					>
						{pending.map((p) => (
							<li
								key={p.key}
								data-state={p.state}
								className="flex items-center gap-2 type-small"
							>
								<FileText
									aria-hidden="true"
									className="size-4 text-text-subtle"
								/>
								<span className="min-w-0 flex-1 truncate">{p.name}</span>
								{p.state === "refused" ? (
									<>
										<span className="type-caption text-destructive">
											{p.message}
										</span>
										<Button
											variant="ghost"
											size="sm"
											onClick={() =>
												setPending((list) =>
													list.filter((x) => x.key !== p.key),
												)
											}
										>
											Dismiss
										</Button>
									</>
								) : (
									<span className="type-caption text-text-subtle">
										{p.state === "uploading" ? "Uploading" : "Waiting"}
									</span>
								)}
							</li>
						))}
					</ul>
				) : null}
				<Surface
					data-testid="intake-files-list"
					query={files}
					isEmpty={(data) => loadedIntakeFiles(data).length === 0}
					loading={<Skeleton className="h-9 w-full" />}
					empty={
						<EmptyState
							data-testid="intake-files-empty"
							compact
							icon={FileText}
							title="No files yet"
							description={
								takes
									? "Add the notes, call transcripts or pages this intake is drafted from."
									: "No file was added to this intake."
							}
						/>
					}
					error={ErrorState}
				>
					{(data) => (
						<ul
							aria-label="Files"
							className="-mx-4 flex flex-col divide-y divide-border border-y border-border"
						>
							{loadedIntakeFiles(data).map((file) => (
								<FileRow
									key={file.id}
									file={file}
									intakeId={intake.id}
									canPurge={takes}
									now={now}
									onPurge={() => setPurging(file)}
								/>
							))}
						</ul>
					)}
				</Surface>
			</div>
			<PurgeFileModal
				intakeId={intake.id}
				file={purging}
				onClose={() => setPurging(null)}
			/>
		</DataPanel>
	);
}

/** The drop zone: drop text files on it, or choose them. */
function FileDrop({ onFiles }: { onFiles: (files: File[]) => void }) {
	const input = useRef<HTMLInputElement>(null);
	const hintId = useId();
	const [over, setOver] = useState(false);
	const take = (list: FileList | null) => {
		if (list && list.length > 0) onFiles([...list]);
	};
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: dropping is a pointer shortcut; Choose files is the control
		<div
			data-testid="intake-files-drop"
			data-over={over || undefined}
			onDragOver={(e: DragEvent) => {
				e.preventDefault();
				setOver(true);
			}}
			onDragLeave={() => setOver(false)}
			onDrop={(e: DragEvent) => {
				e.preventDefault();
				setOver(false);
				take(e.dataTransfer.files);
			}}
			className={cn(
				"flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-dashed px-3 py-2.5 transition-colors duration-(--duration-micro) ease-avel",
				over ? "border-selected-border bg-selected" : "border-border-strong",
			)}
		>
			<Upload aria-hidden="true" className="size-4 text-text-subtle" />
			<span className="type-small text-text">
				Drop .md, .txt or .html here, or
			</span>
			<Button
				variant="outline"
				size="sm"
				aria-describedby={hintId}
				data-testid="intake-files-choose"
				onClick={() => input.current?.click()}
			>
				Choose files
			</Button>
			<Reason className="basis-full" data-testid="intake-files-hint">
				<span id={hintId}>Text files up to 10 MB each.</span>
			</Reason>
			<input
				ref={input}
				type="file"
				multiple
				accept=".md,.txt,.html,text/markdown,text/plain,text/html"
				className="sr-only"
				tabIndex={-1}
				aria-hidden="true"
				onChange={(e) => {
					take(e.target.files);
					e.target.value = "";
				}}
			/>
		</div>
	);
}

function FileRow({
	file,
	intakeId,
	canPurge,
	now,
	onPurge,
}: {
	file: IntakeFile;
	intakeId: string;
	canPurge: boolean;
	now: number;
	onPurge: () => void;
}) {
	const purged = file.purgedAt !== null;
	return (
		<li
			data-testid={`intake-file-${file.id}`}
			data-purged={purged || undefined}
			className="flex min-h-10 items-center gap-3 px-4 py-1.5"
		>
			<FileText
				aria-hidden="true"
				className="size-4 shrink-0 text-text-subtle"
			/>
			<span
				className={cn(
					"min-w-0 flex-1 truncate type-small",
					purged ? "text-text-subtle" : "text-text",
				)}
				title={file.name}
			>
				{file.name}
			</span>
			{purged && file.purgedAt ? (
				<span
					data-testid={`intake-file-${file.id}-purged`}
					className="type-caption text-text-subtle"
				>
					{`Purged ${relativeTime(file.purgedAt, now)}`}
				</span>
			) : (
				<>
					<span className="type-mono text-text-subtle">
						{fileSize(file.bytes)}
					</span>
					<span className="hidden items-center gap-1.5 type-caption text-text-muted md:inline-flex">
						<ActorMark
							kind={file.uploadedBy.kind}
							name={file.uploadedBy.display}
						/>
						{file.uploadedBy.display}
						<span className="text-text-subtle">
							{relativeTime(file.createdAt, now)}
						</span>
					</span>
					<Button asChild variant="ghost" size="icon-sm">
						<a
							href={intakeFileContentUrl(intakeId, file.id)}
							download={file.name}
							aria-label={`Download ${file.name}`}
							data-testid={`intake-file-${file.id}-download`}
						>
							<Download aria-hidden="true" />
						</a>
					</Button>
					{canPurge ? (
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={`Purge ${file.name}`}
							data-testid={`intake-file-${file.id}-purge`}
							onClick={onPurge}
						>
							<Trash2 aria-hidden="true" />
						</Button>
					) : null}
				</>
			)}
		</li>
	);
}

/** Purging destroys the bytes, so it says so and ends on the danger confirm. */
function PurgeFileModal({
	intakeId,
	file,
	onClose,
}: {
	intakeId: string;
	file: IntakeFile | null;
	onClose: () => void;
}) {
	const purge = usePurgeIntakeFile(intakeId);
	return (
		<ActionModal
			open={file !== null}
			onOpenChange={(next) => {
				if (!next) {
					purge.reset();
					onClose();
				}
			}}
			size="confirm"
			title={`Purge ${file?.name ?? "file"}`}
			description="Purging can't be undone."
			dirty={false}
			submitLabel="Purge file"
			pendingLabel="Purging"
			destructive
			onSubmit={() => {
				if (file) purge.mutate(file.id, { onSuccess: onClose });
			}}
			pending={purge.isPending}
			error={purge.error}
			data-testid="intake-file-purge"
		>
			<section
				aria-label="What happens"
				className="flex flex-col gap-2 rounded-card border border-border bg-app-well p-3"
			>
				<h3 className="type-eyebrow">What happens</h3>
				<ul className="flex list-disc flex-col gap-1 pl-4 type-small text-text">
					<li>The file's bytes are destroyed; it can't be downloaded again.</li>
					<li>Its name stays as a tombstone, under Show purged.</li>
					<li>What the brief was drafted from it stays.</li>
				</ul>
			</section>
		</ActionModal>
	);
}
