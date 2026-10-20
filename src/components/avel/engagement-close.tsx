import type { Engagement } from "avel-server/contract";
import { CircleCheck } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ApiError } from "@/lib/api";
import { closedEngagementCopy, useCloseEngagement } from "@/lib/api/clients";
import { useEngagementConnectionCount } from "@/lib/api/connections";
import { cn } from "@/lib/utils";
import { FormError } from "./client-form";

/**
 * Closing an engagement is irreversible and revokes its connections
 * (DATA-CONTRACTS-V2.md, Engagement), so it is confirmed in a dialog that
 * says what happens, asks for the engagement's name, and holds the action
 * rather than taking a click (ruling for deliver and abort).
 */
export function EngagementCloseDialog({
	engagement,
	onOpenChange,
}: {
	engagement: Pick<Engagement, "id" | "name"> | null;
	onOpenChange: (open: boolean) => void;
}) {
	const close = useCloseEngagement();
	// What the close revokes, read live; no number while it loads or fails.
	const connections = useEngagementConnectionCount(engagement?.id ?? null);
	return (
		<Dialog
			open={engagement !== null}
			onOpenChange={(next) => {
				if (!next) close.reset();
				onOpenChange(next);
			}}
		>
			<DialogContent data-testid="engagement-close-dialog">
				{engagement ? (
					<EngagementCloseConfirm
						name={engagement.name}
						activeConnections={connections.data}
						pending={close.isPending}
						error={close.error}
						onConfirm={() =>
							close.mutate(engagement.id, {
								onSuccess: (closed) => {
									toast.success(
										closedEngagementCopy(closed.revokedConnections),
									);
									onOpenChange(false);
								},
							})
						}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

/**
 * The final confirm's look: the filled danger confirm (audit D7, adopted),
 * because the dialog has already said what happens and asked for the name.
 * Outlined danger stays everywhere a destructive action sits beside other
 * work.
 */
const CONFIRM_VARIANT = "destructive-confirm" as const;

/** Why the confirm is off until the name is typed, said beside the field too. */
export const NAME_UNLOCK_REASON = "The button unlocks when the name matches.";

/** Whether what was typed is the engagement's name: exact, ends trimmed. */
export function nameMatches(typed: string, name: string): boolean {
	return typed.trim() === name.trim();
}

/** "1 active connection", "3 active connections". */
function connectionsLabel(count: number): string {
	return `${count} active ${count === 1 ? "connection" : "connections"}`;
}

/**
 * The dialog's content, in v3 .dialog anatomy and the "revoke access"
 * pattern: what happens, in a well; the name typed to confirm (v3
 * .field.is-match once it matches); then the held confirm. Presentational
 * apart from what was typed, so it tests directly.
 */
export function EngagementCloseConfirm({
	name,
	activeConnections,
	pending,
	error,
	onConfirm,
}: {
	name: string;
	/** Its live connections the close revokes; undefined while unread. */
	activeConnections?: number;
	pending: boolean;
	error: ApiError | null;
	onConfirm: () => void;
}) {
	const [typed, setTyped] = useState("");
	const inputId = useId();
	const helpId = useId();
	const matched = nameMatches(typed, name);
	return (
		<>
			<DialogHeader>
				<DialogTitle>Close {name}?</DialogTitle>
				<DialogDescription data-testid="engagement-close-consequence">
					Closing this engagement revokes its connections, so AVEL loses access
					to the accounts they reach. It cannot be undone.
				</DialogDescription>
			</DialogHeader>
			<section
				aria-label="What happens"
				data-testid="engagement-close-effects"
				className="flex flex-col gap-2 rounded-card border border-border bg-app-well p-3"
			>
				<h3 className="type-eyebrow">What happens</h3>
				<ul className="flex list-disc flex-col gap-1 pl-4 type-small text-text">
					<li data-testid="engagement-close-effect-connections">
						{activeConnections === undefined
							? "Its active connections are revoked."
							: activeConnections === 0
								? "It has no active connection, so none is revoked."
								: `Its ${connectionsLabel(activeConnections)} ${activeConnections === 1 ? "is" : "are"} revoked.`}
					</li>
					<li data-testid="engagement-close-effect-work">
						It takes no new work: a mission on it can no longer start.
					</li>
					<li data-testid="engagement-close-effect-final">
						It cannot be reopened.
					</li>
				</ul>
			</section>
			<div className="flex flex-col gap-1.5">
				<label htmlFor={inputId} className="type-small font-medium text-text">
					Type <span className="type-mono">{name}</span> to confirm
				</label>
				<div className="relative">
					<Input
						id={inputId}
						data-testid="engagement-close-name"
						data-match={matched || undefined}
						autoComplete="off"
						spellCheck={false}
						value={typed}
						onChange={(event) => setTyped(event.target.value)}
						aria-describedby={helpId}
						className={cn(matched && "border-gate-pass-solid pr-8")}
					/>
					{matched ? (
						<CircleCheck
							aria-hidden="true"
							className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-gate-pass"
						/>
					) : null}
				</div>
				<p
					id={helpId}
					data-testid="engagement-close-name-help"
					aria-live="polite"
					className={cn(
						"type-caption",
						matched ? "text-gate-pass" : "text-text-subtle",
					)}
				>
					{matched ? "The name matches." : NAME_UNLOCK_REASON}
				</p>
			</div>
			<FormError error={error} hasFieldErrors={false} />
			<DialogFooter>
				<DialogClose asChild>
					<Button variant="ghost" data-testid="engagement-close-cancel">
						Keep it open
					</Button>
				</DialogClose>
				<Button
					variant={CONFIRM_VARIANT}
					holdToConfirm
					onConfirm={onConfirm}
					disabled={pending}
					disabledReason={matched ? undefined : NAME_UNLOCK_REASON}
					data-testid="engagement-close-confirm"
				>
					{pending ? "Closing" : "Hold to close engagement"}
				</Button>
			</DialogFooter>
		</>
	);
}
