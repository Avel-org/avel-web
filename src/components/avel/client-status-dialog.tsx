import type { Client } from "avel-server/contract";
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
import type { ApiError } from "@/lib/api";
import { preconditionReason, useUpdateClient } from "@/lib/api/clients";
import { landRecord } from "@/shell/motion";
import { FormError } from "./client-form";

/**
 * Close or reopen a client. Closing is refused while the client has an active
 * engagement (client_has_active_engagements), and nothing closes implicitly:
 * the answer names how many are active and offers to show them.
 */
export function ClientStatusDialog({
	client,
	onOpenChange,
	onShowEngagements,
}: {
	client: { value: Client; to: "closed" | "active" } | null;
	onOpenChange: (open: boolean) => void;
	onShowEngagements: (clientId: string) => void;
}) {
	const update = useUpdateClient();
	return (
		<Dialog
			open={client !== null}
			onOpenChange={(next) => {
				if (!next) update.reset();
				onOpenChange(next);
			}}
		>
			<DialogContent data-testid="client-status-dialog">
				{client ? (
					<ClientStatusConfirm
						client={client.value}
						to={client.to}
						pending={update.isPending}
						error={update.error}
						onConfirm={() =>
							update.mutate(
								{ id: client.value.id, patch: { status: client.to } },
								{
									onSuccess: (saved) => {
										toast.success(
											client.to === "closed"
												? `Closed ${saved.name}.`
												: `Reopened ${saved.name}.`,
										);
										onOpenChange(false);
										// It moves to its new section; land it there.
										landRecord(saved.id);
									},
								},
							)
						}
						onShowEngagements={() => {
							onShowEngagements(client.value.id);
							onOpenChange(false);
						}}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

/** The dialog's content; presentational, so it tests directly. */
export function ClientStatusConfirm({
	client,
	to,
	pending,
	error,
	onConfirm,
	onShowEngagements,
}: {
	client: Client;
	to: "closed" | "active";
	pending: boolean;
	error: ApiError | null;
	onConfirm: () => void;
	onShowEngagements: () => void;
}) {
	const blocked = preconditionReason(error) === "client_has_active_engagements";
	const closing = to === "closed";
	return (
		<>
			<DialogHeader>
				<DialogTitle>
					{closing ? `Close ${client.name}?` : `Reopen ${client.name}?`}
				</DialogTitle>
				<DialogDescription>
					{closing
						? "A closed client takes no new engagements. Its engagements are not closed for you, and you can reopen the client later."
						: "An active client can take new engagements again."}
				</DialogDescription>
			</DialogHeader>
			<FormError
				error={error}
				hasFieldErrors={false}
				activeEngagements={client.activeEngagementCount}
			/>
			<DialogFooter>
				{blocked ? (
					<Button
						variant="outline"
						data-testid="client-status-show-engagements"
						onClick={onShowEngagements}
					>
						Show active engagements
					</Button>
				) : (
					<DialogClose asChild>
						<Button variant="ghost" data-testid="client-status-cancel">
							Cancel
						</Button>
					</DialogClose>
				)}
				<Button
					// Closing is the dialog's final, named action: the filled
					// danger confirm (audit D7).
					variant={closing ? "destructive-confirm" : "default"}
					data-testid="client-status-confirm"
					disabled={pending}
					disabledReason={
						blocked ? "Close its active engagements first." : undefined
					}
					onClick={onConfirm}
				>
					{pending
						? closing
							? "Closing"
							: "Reopening"
						: closing
							? "Close client"
							: "Reopen client"}
				</Button>
			</DialogFooter>
		</>
	);
}
