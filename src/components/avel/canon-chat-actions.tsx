import type { CanonSession } from "avel-server/contract";
import {
	Archive,
	ArchiveRestore,
	Check,
	OctagonX,
	Pencil,
	RotateCcw,
	Square,
	X,
} from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	CANON_TITLE_MAX,
	canonReopenBlocked,
	canonReplying,
	useArchiveCanonSession,
	useCloseCanonSession,
	useHaltCanonSession,
	useReopenCanonSession,
	useUnarchiveCanonSession,
	useUpdateCanonSession,
} from "@/lib/api/canon";
import { cn } from "@/lib/utils";
import { useIsPreview } from "@/shell/auth-gate";
import { retryOf } from "./retry";
import { ErrorState } from "./surface";

/*
 * What the operator does to a session, the same on Home and on an intake:
 * rename it inline, halt it (any time), close it (between Canon's turns),
 * reopen it (a closed one, or one the operator halted; a token-ceiling halt
 * is final), and archive or unarchive it. Archiving an open session closes
 * it first, so it waits for Canon's turn as Close does.
 */

/** The longest first-message excerpt a title stands in with. */
const EXCERPT = 60;

/** A session's name: its title, else its first message's first line, else Untitled. */
export function canonChatTitle(
	title: string | null,
	firstMessage?: string | null,
): string {
	if (title) return title;
	const line = (firstMessage ?? "").trim().split("\n")[0]?.trim() ?? "";
	if (line === "") return "Untitled chat";
	return line.length > EXCERPT
		? `${line.slice(0, EXCERPT - 1).trimEnd()}…`
		: line;
}

/** Why a title can't be saved, or undefined: trimmed, 1 to 120 characters. */
export function canonTitleProblem(text: string): string | undefined {
	const trimmed = text.trim();
	if (trimmed === "") return "Give the chat a name.";
	if (trimmed.length > CANON_TITLE_MAX)
		return `A name is at most ${CANON_TITLE_MAX} characters.`;
	return undefined;
}

/**
 * The session's name, with Rename beside it. Renaming swaps the name for a
 * field in place: Enter or Save keeps it, Escape or Cancel leaves it. A name
 * Canon chose says so, since the operator's never changes after.
 */
export function CanonSessionTitle({
	session: s,
	firstMessage,
	className,
}: {
	session: CanonSession;
	firstMessage?: string | null;
	className?: string;
}) {
	const preview = useIsPreview();
	const update = useUpdateCanonSession();
	const [draft, setDraft] = useState<string | null>(null);
	const fieldId = useId();
	const name = canonChatTitle(s.title, firstMessage);
	const problem = draft === null ? undefined : canonTitleProblem(draft);
	const unchanged = draft !== null && draft.trim() === (s.title ?? "");
	const save = () => {
		if (draft === null || problem || unchanged) {
			if (unchanged) setDraft(null);
			return;
		}
		update.mutate(
			{ id: s.id, body: { title: draft.trim() } },
			{ onSuccess: () => setDraft(null) },
		);
	};
	if (draft !== null)
		return (
			<form
				data-testid="canon-rename"
				className={cn("flex min-w-0 flex-col gap-1.5", className)}
				onSubmit={(e) => {
					e.preventDefault();
					save();
				}}
			>
				<div className="flex min-w-0 items-center gap-1.5">
					<label htmlFor={fieldId} className="sr-only">
						Chat name
					</label>
					<Input
						id={fieldId}
						data-testid="canon-rename-input"
						autoFocus
						value={draft}
						maxLength={CANON_TITLE_MAX}
						aria-invalid={problem ? true : undefined}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								e.preventDefault();
								setDraft(null);
								update.reset();
							}
						}}
						className="h-control-sm min-w-0 flex-1"
					/>
					<Button
						type="submit"
						size="icon-sm"
						variant="ghost"
						aria-label="Save name"
						data-testid="canon-rename-save"
						disabledReason={
							problem ?? (update.isPending ? "Saving" : undefined)
						}
					>
						<Check aria-hidden="true" />
					</Button>
					<Button
						type="button"
						size="icon-sm"
						variant="ghost"
						aria-label="Cancel rename"
						data-testid="canon-rename-cancel"
						onClick={() => {
							setDraft(null);
							update.reset();
						}}
					>
						<X aria-hidden="true" />
					</Button>
				</div>
				{update.error ? (
					<ErrorState error={update.error} {...retryOf(update)} />
				) : null}
			</form>
		);
	return (
		<div className={cn("flex min-w-0 items-center gap-1.5", className)}>
			<h2
				data-testid="canon-title"
				data-titled={s.title ? (s.titleSetBy ?? "operator") : undefined}
				title={name}
				className={cn(
					"min-w-0 truncate type-title",
					s.title ? "text-text" : "text-text-muted",
				)}
			>
				{name}
			</h2>
			{s.titleSetBy === "canon" ? (
				<span
					data-testid="canon-title-source"
					className="shrink-0 type-caption text-text-subtle"
				>
					Named by Canon
				</span>
			) : null}
			<Button
				type="button"
				size="icon-sm"
				variant="ghost"
				aria-label="Rename chat"
				data-testid="canon-rename-open"
				disabledReason={preview ? "Sign in to rename the chat" : undefined}
				onClick={() => setDraft(s.title ?? "")}
			>
				<Pencil aria-hidden="true" />
			</Button>
		</div>
	);
}

/** Halt and Close while open; Reopen once ended; Archive or Unarchive. */
export function CanonSessionActions({
	session: s,
	className,
}: {
	session: CanonSession;
	className?: string;
}) {
	const preview = useIsPreview();
	const halt = useHaltCanonSession();
	const close = useCloseCanonSession();
	const reopen = useReopenCanonSession();
	const archive = useArchiveCanonSession();
	const unarchive = useUnarchiveCanonSession();
	const all = [halt, close, reopen, archive, unarchive];
	// One action at a time: starting one clears another's old failure.
	const run = (m: (typeof all)[number]) => {
		for (const other of all) if (other !== m) other.reset();
		m.mutate(s.id);
	};
	const failed = all.find((m) => m.error);
	const replying = canonReplying(s);
	const signIn = (what: string) => (preview ? `Sign in to ${what}` : undefined);
	const reopenBlocked = canonReopenBlocked(s);
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<span className="flex flex-wrap items-center justify-end gap-1.5">
				{s.status === "open" ? (
					<>
						<Button
							type="button"
							variant="outline"
							size="sm"
							data-testid="canon-halt"
							disabledReason={signIn("halt Canon")}
							onClick={() => run(halt)}
						>
							<OctagonX aria-hidden="true" />
							Halt
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							data-testid="canon-close"
							disabledReason={
								signIn("close the session") ??
								(replying
									? "Canon is answering. Halt stops it now."
									: undefined)
							}
							onClick={() => run(close)}
						>
							<Square aria-hidden="true" />
							Close
						</Button>
					</>
				) : (
					<Button
						type="button"
						variant="outline"
						size="sm"
						data-testid="canon-reopen"
						disabledReason={signIn("reopen the session") ?? reopenBlocked}
						onClick={() => run(reopen)}
					>
						<RotateCcw aria-hidden="true" />
						Reopen
					</Button>
				)}
				{s.archivedAt ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						data-testid="canon-unarchive"
						disabledReason={signIn("unarchive the session")}
						onClick={() => run(unarchive)}
					>
						<ArchiveRestore aria-hidden="true" />
						Unarchive
					</Button>
				) : (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						data-testid="canon-archive"
						disabledReason={
							signIn("archive the session") ??
							(replying
								? "Canon is answering. Halt it first, or wait for its reply."
								: undefined)
						}
						onClick={() => run(archive)}
					>
						<Archive aria-hidden="true" />
						Archive
					</Button>
				)}
			</span>
			{failed?.error ? (
				<ErrorState error={failed.error} {...retryOf(failed)} />
			) : null}
		</div>
	);
}
