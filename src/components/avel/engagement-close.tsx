import type { Engagement } from "avel-server/contract";
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
import { closedEngagementCopy, useCloseEngagement } from "@/lib/api/clients";
import { FormError } from "./client-form";

/**
 * Closing an engagement is irreversible and revokes its connections
 * (DATA-CONTRACTS-V2.md, Engagement), so it is confirmed in a dialog that
 * says so, and the action is held, not clicked (ruling for deliver and abort).
 */
export function EngagementCloseDialog({
	engagement,
	onOpenChange,
}: {
	engagement: Pick<Engagement, "id" | "name"> | null;
	onOpenChange: (open: boolean) => void;
}) {
	const close = useCloseEngagement();
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

/** The dialog's content; presentational, so it tests directly. */
export function EngagementCloseConfirm({
	name,
	pending,
	error,
	onConfirm,
}: {
	name: string;
	pending: boolean;
	error: ApiError | null;
	onConfirm: () => void;
}) {
	return (
		<>
			<DialogHeader>
				<DialogTitle>Close {name}?</DialogTitle>
				<DialogDescription data-testid="engagement-close-consequence">
					Closing this engagement revokes its connections, so AVEL loses access
					to the accounts they reach. It cannot be undone.
				</DialogDescription>
			</DialogHeader>
			<FormError error={error} hasFieldErrors={false} />
			<DialogFooter>
				<DialogClose asChild>
					<Button variant="ghost" data-testid="engagement-close-cancel">
						Keep it open
					</Button>
				</DialogClose>
				<Button
					variant="destructive"
					holdToConfirm
					onConfirm={onConfirm}
					disabled={pending}
					data-testid="engagement-close-confirm"
				>
					{pending ? "Closing" : "Hold to close engagement"}
				</Button>
			</DialogFooter>
		</>
	);
}
