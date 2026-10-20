import { Check, Download, Lock, Sparkles, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useInlineModals } from "./action-modal";
import { SampleRegion } from "./catalog-sample";
import { CodeView } from "./code-view";
import {
	DRIVE_WRITE_REASON,
	dateLabel,
	FileIconTile,
	KIND,
	PURGED_REASON,
	Uploader,
} from "./drive-files";
import {
	DRIVE_MISSING,
	kindOf,
	type SampleFile,
	sampleAccess,
	sampleHistory,
	samplePreview,
	scopePath,
	sizeLabel,
} from "./drive-placeholders";
import { ShortHash } from "./short-hash";

/*
 * The file panel: one file, beside the list at xl and up, an overlay sheet
 * below (the same pattern as the agent panel). A preview, the name and where
 * it lives, then Details, Agent access and History. The write controls are
 * real and disabled with their reason; the values are samples behind pills.
 */

export const FILE_TABS = [
	{ id: "details", label: "Details" },
	{ id: "access", label: "Agent access" },
	{ id: "history", label: "History" },
] as const;

/** Why Promote is disabled, and what it will do. */
export const PROMOTE_REASON =
	"Promoting arrives with the Drive. It makes a knowledge skill draft from this file, which is reviewed, approved and pinned by hash before any agent learns from it.";

type PanelProps = {
	file: SampleFile;
	onClose: () => void;
	/** A way to move it without dragging: the Drive's folder select. */
	moveTo?: ReactNode;
};

/** The file's details: a drawer on the right, over the page. */
export function FilePanelSheet({
	open,
	...props
}: PanelProps & { open: boolean }) {
	// A server render (a test) has no portal: an open sheet renders in place.
	const inline = useInlineModals();
	if (inline)
		return open ? (
			<div data-testid="drive-panel-sheet">
				<FilePanelBody {...props} />
			</div>
		) : null;
	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!next) props.onClose();
			}}
		>
			<SheetContent
				side="right"
				showCloseButton={false}
				data-testid="drive-panel-sheet"
				className="w-full gap-0 sm:max-w-md"
			>
				<FilePanelBody {...props} inSheet />
			</SheetContent>
		</Sheet>
	);
}

/** The panel's contents, the same in both places. */
export function FilePanelBody({
	file,
	onClose,
	moveTo,
	inSheet = false,
}: PanelProps & { inSheet?: boolean }) {
	const purged = file.purgedAt !== null;
	const Title = inSheet ? SheetTitle : "h2";
	const Description = inSheet ? SheetDescription : "p";
	return (
		<div
			data-testid="drive-panel"
			data-file={file.id}
			className="flex min-h-0 flex-1 flex-col"
		>
			<div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
				<span className="type-caption text-text-subtle">File</span>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Close panel"
					data-testid="drive-panel-close"
					onClick={onClose}
				>
					<X aria-hidden="true" />
				</Button>
			</div>
			<div className="app-scroll min-h-0 flex-1 overflow-y-auto">
				<div className="flex flex-col gap-3 p-4">
					<Preview file={file} />
					<div className="flex flex-col gap-1">
						<Title
							data-testid="drive-panel-name"
							className={cn(
								"type-title break-words",
								purged ? "text-text-subtle line-through" : "text-foreground",
							)}
						>
							{file.name}
						</Title>
						<Description
							data-testid="drive-panel-path"
							className="type-small text-text-muted"
						>
							{`Drive, ${scopePath(file)}`}
						</Description>
						{purged ? (
							<Badge
								variant="outline"
								data-testid="drive-panel-purged"
								className="self-start"
							>
								Bytes destroyed
							</Badge>
						) : null}
					</div>
					<FileActions file={file} />
					{moveTo}
				</div>
				<Tabs defaultValue="details" className="gap-0">
					<div className="border-y border-border px-4">
						<TabsList aria-label="File">
							{FILE_TABS.map((tab) => (
								<TabsTrigger
									key={tab.id}
									value={tab.id}
									data-testid={`drive-tab-${tab.id}`}
								>
									{tab.label}
								</TabsTrigger>
							))}
						</TabsList>
					</div>
					<div className="p-4">
						<TabsContent value="details">
							<DetailsTab file={file} />
						</TabsContent>
						<TabsContent value="access">
							<AccessTab file={file} />
						</TabsContent>
						<TabsContent value="history">
							<HistoryTab file={file} />
						</TabsContent>
					</div>
				</Tabs>
			</div>
		</div>
	);
}

/** The first lines of a text file through the code view; an icon otherwise. */
function Preview({ file }: { file: SampleFile }) {
	const text = file.purgedAt === null ? samplePreview(file) : null;
	if (text === null) {
		return (
			<div
				data-testid="drive-panel-preview"
				data-preview="icon"
				className="flex aspect-[16/9] items-center justify-center rounded-control border border-border bg-app-well"
			>
				<FileIconTile file={file} size="lg" />
			</div>
		);
	}
	return (
		<SampleRegion
			missing={DRIVE_MISSING.preview}
			title="Preview"
			what="The file's first lines, read-only."
			data-testid="drive-panel-preview"
		>
			<CodeView
				text={text}
				label={`${file.name}, first lines`}
				data-testid="drive-panel-preview-code"
				lineTone={(line) =>
					line.startsWith("#")
						? "heading"
						: /^\s*"[^"]+":/.test(line)
							? "key"
							: undefined
				}
			/>
		</SampleRegion>
	);
}

/** Download, Promote and Delete: real, each disabled with its own reason. */
function FileActions({ file }: { file: SampleFile }) {
	const purged = file.purgedAt !== null;
	return (
		<div data-testid="drive-panel-actions" className="flex flex-wrap gap-2">
			<Button
				size="sm"
				variant="outline"
				data-testid="drive-download"
				disabledReason={purged ? PURGED_REASON : DRIVE_WRITE_REASON}
			>
				<Download aria-hidden="true" />
				Download
			</Button>
			<Button
				size="sm"
				variant="destructive"
				data-testid="drive-delete"
				disabledReason={purged ? "Already deleted." : DRIVE_WRITE_REASON}
			>
				<Trash2 aria-hidden="true" />
				Delete
			</Button>
		</div>
	);
}

/** A label and its value, in the details list. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
	return (
		<>
			<dt className="type-caption text-text-subtle">{label}</dt>
			<dd className="min-w-0 type-small text-text-muted">{children}</dd>
		</>
	);
}

export function DetailsTab({ file }: { file: SampleFile }) {
	const kind = kindOf(file.mime);
	return (
		<SampleRegion
			missing={DRIVE_MISSING.files}
			title="Details"
			what="The file's type and size as the server detected them, its SHA-256, who uploaded it and when, and whether its bytes still exist."
			data-testid="drive-details"
		>
			<dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2.5">
				<Fact label="Type">
					<span className="flex flex-col">
						<span>{KIND[kind].label}</span>
						<code className="type-mono break-all text-text-subtle">
							{file.mime}
						</code>
					</span>
				</Fact>
				<Fact label="Size">
					<span className="type-mono">{sizeLabel(file.bytes)}</span>
				</Fact>
				<Fact label="SHA-256">
					<ShortHash
						value={file.sha256}
						label="the SHA-256"
						data-testid="drive-details-sha"
					/>
				</Fact>
				<Fact label="Uploaded">
					<span className="flex flex-col gap-1">
						<Uploader login={file.uploadedBy} />
						<time
							dateTime={file.createdAt}
							className="type-mono text-text-subtle"
						>
							{dateLabel(file.createdAt)}
						</time>
					</span>
				</Fact>
				<Fact label="Bytes">
					{file.purgedAt === null ? (
						<span data-testid="drive-details-state">Held</span>
					) : (
						<span data-testid="drive-details-state">
							{`Destroyed ${dateLabel(file.purgedAt)}. The record stays.`}
						</span>
					)}
				</Fact>
			</dl>
			<p className="type-caption text-text-subtle">
				Type and size are read by the server from the bytes, never from the
				upload. A download is always an attachment, never shown inline.
			</p>
		</SampleRegion>
	);
}

/** Why a tombstone cannot be promoted. */
export const PURGED_PROMOTE_REASON =
	"This file's bytes were destroyed, so there is nothing to promote.";

export function AccessTab({ file }: { file: SampleFile }) {
	const rows = sampleAccess(file);
	const purgedAt = file.purgedAt;
	return (
		<div className="flex flex-col gap-4">
			<SampleRegion
				missing={DRIVE_MISSING.access}
				title="Agent access"
				what="Which agents may read this file and why: firm agents across scopes, mission agents only when their brief lists it."
				data-testid="drive-access"
			>
				{purgedAt !== null ? (
					// No bytes, so no reader: not even a firm agent.
					<p
						data-testid="drive-access-none"
						className="flex items-start gap-2 type-small text-text-muted"
					>
						<Lock
							aria-hidden="true"
							className="mt-0.5 size-4 shrink-0 text-text-subtle"
						/>
						{`No one can read this file: its bytes were destroyed on ${dateLabel(purgedAt)}. The record stays for the audit trail.`}
					</p>
				) : (
					<ul
						aria-label="Who can read this file"
						className="flex flex-col divide-y divide-border"
					>
						{rows.map((row) => (
							<li
								key={row.who}
								data-testid="drive-access-row"
								data-reads={row.reads}
								className="flex items-start gap-3 py-2"
							>
								<span
									aria-hidden="true"
									className={cn(
										"mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full",
										row.reads
											? "bg-gate-pass-soft text-gate-pass"
											: "bg-app-raised text-text-subtle",
									)}
								>
									{row.reads ? (
										<Check className="size-3" />
									) : (
										<Lock className="size-3" />
									)}
								</span>
								<span className="flex min-w-0 flex-col">
									<span className="type-small text-foreground">
										{row.who}
										<span className="sr-only">
											{row.reads ? ", can read" : ", cannot read"}
										</span>
									</span>
									<span className="type-caption text-text-subtle">
										{row.why}
									</span>
								</span>
							</li>
						))}
					</ul>
				)}
				{file.scope !== "general" && purgedAt === null ? (
					<p
						data-testid="drive-access-one-way"
						className="rounded-control border border-border bg-app-well px-3 py-2 type-caption text-text-muted"
					>
						One-way door: a client's files are never readable by another
						client's agents. Agents never search the Drive; they read what they
						are given.
					</p>
				) : null}
			</SampleRegion>
			<div className="flex flex-col gap-2">
				<Button
					size="sm"
					variant="outline"
					data-testid="drive-promote"
					disabledReason={
						purgedAt !== null ? PURGED_PROMOTE_REASON : PROMOTE_REASON
					}
					className="self-start"
				>
					<Sparkles aria-hidden="true" />
					Promote to knowledge skill
				</Button>
				<ol
					aria-label="How promotion works"
					data-testid="drive-promote-steps"
					className="flex items-center gap-2 type-caption text-text-subtle"
				>
					<li>Draft</li>
					<li aria-hidden="true">→</li>
					<li>Review</li>
					<li aria-hidden="true">→</li>
					<li>Approve</li>
					<li aria-hidden="true">→</li>
					<li>Pinned by hash</li>
				</ol>
			</div>
		</div>
	);
}

const EVENT_LABEL = {
	uploaded: "Uploaded",
	attached: "Attached",
	promoted: "Promoted",
	deleted: "Deleted",
} as const;

export function HistoryTab({ file }: { file: SampleFile }) {
	const events = sampleHistory(file);
	return (
		<SampleRegion
			missing={DRIVE_MISSING.history}
			title="History"
			what="What happened to this file, oldest first."
			data-testid="drive-history"
		>
			<ol aria-label="History" className="flex flex-col">
				{events.map((event, i) => (
					<li
						key={event.id}
						data-testid="drive-history-event"
						data-what={event.what}
						className="relative flex gap-3 pb-3 last:pb-0"
					>
						{/* The rail between events. */}
						{i < events.length - 1 ? (
							<span
								aria-hidden="true"
								className="absolute top-4 bottom-0 left-[5px] w-px bg-border"
							/>
						) : null}
						<span
							aria-hidden="true"
							className={cn(
								"mt-1.5 size-[11px] shrink-0 rounded-full border-2",
								event.what === "deleted"
									? "border-text-subtle bg-app-panel"
									: "border-gate-pending-solid bg-app-panel",
							)}
						/>
						<span className="flex min-w-0 flex-col">
							<span className="type-small text-foreground">
								{EVENT_LABEL[event.what]}
								<span className="text-text-subtle">{` by ${event.by}`}</span>
							</span>
							<span className="type-caption text-text-subtle">
								{event.detail}
							</span>
							<time dateTime={event.at} className="type-mono text-text-subtle">
								{dateLabel(event.at)}
							</time>
						</span>
					</li>
				))}
			</ol>
		</SampleRegion>
	);
}
