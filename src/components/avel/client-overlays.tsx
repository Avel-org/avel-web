import type { Client, Engagement } from "avel-server/contract";
import { type ReactNode, useState } from "react";
import { ClientFormModal } from "./client-form";
import { ClientStatusDialog } from "./client-status-dialog";
import { EngagementCloseDialog } from "./engagement-close";
import { EngagementEditModal, EngagementFormModal } from "./engagement-form";
import { NewIntakeModal } from "./intake-new";

/*
 * Every change to a client or its engagements, as modals (ruling 35), shared
 * by the client board and the client's page so both change things the same
 * way. One overlay is open at a time.
 */

/** What the operator can do to a client, from its card or its page. */
export type ClientActions = {
	onNewClient: () => void;
	onEdit: (client: Client) => void;
	onNewEngagement: (client: Client) => void;
	onClose: (client: Client) => void;
	onReopen: (client: Client) => void;
	onCloseEngagement: (engagement: Pick<Engagement, "id" | "name">) => void;
	onEditEngagement: (engagement: Engagement) => void;
	/** A new intake, on the engagement when there is one. */
	onNewIntake: (client: Client, engagement?: Engagement) => void;
};

type Overlay =
	| { kind: "none" }
	| { kind: "new-client" }
	| { kind: "edit-client"; client: Client }
	| { kind: "client-status"; client: Client; to: "closed" | "active" }
	| { kind: "new-engagement"; client: Client }
	| { kind: "close-engagement"; engagement: Pick<Engagement, "id" | "name"> }
	| { kind: "edit-engagement"; engagement: Engagement }
	| { kind: "new-intake"; client: Client; engagementId?: string };

/**
 * The actions and the modals they open. `onShowEngagements` is where a
 * refused close goes to show the active engagements that blocked it.
 */
export function useClientOverlays({
	onShowEngagements,
}: {
	onShowEngagements: (clientId: string) => void;
}): { actions: ClientActions; modals: ReactNode } {
	const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
	// Fixed at mount: the engagement form's default start date.
	const [today] = useState(() => new Date().toLocaleDateString("en-CA"));
	const onOpenChange = (open: boolean) => {
		if (!open) setOverlay({ kind: "none" });
	};

	const actions: ClientActions = {
		onNewClient: () => setOverlay({ kind: "new-client" }),
		onEdit: (client) => setOverlay({ kind: "edit-client", client }),
		onNewEngagement: (client) => setOverlay({ kind: "new-engagement", client }),
		onClose: (client) =>
			setOverlay({ kind: "client-status", client, to: "closed" }),
		onReopen: (client) =>
			setOverlay({ kind: "client-status", client, to: "active" }),
		onCloseEngagement: (engagement) =>
			setOverlay({ kind: "close-engagement", engagement }),
		onEditEngagement: (engagement) =>
			setOverlay({ kind: "edit-engagement", engagement }),
		onNewIntake: (client, engagement) =>
			setOverlay({
				kind: "new-intake",
				client,
				...(engagement ? { engagementId: engagement.id } : {}),
			}),
	};

	const modals = (
		<>
			<ClientFormModal
				open={overlay.kind === "new-client" || overlay.kind === "edit-client"}
				onOpenChange={onOpenChange}
				client={overlay.kind === "edit-client" ? overlay.client : undefined}
			/>
			<EngagementFormModal
				open={overlay.kind === "new-engagement"}
				onOpenChange={onOpenChange}
				client={overlay.kind === "new-engagement" ? overlay.client : null}
				today={today}
			/>
			<ClientStatusDialog
				client={
					overlay.kind === "client-status"
						? { value: overlay.client, to: overlay.to }
						: null
				}
				onOpenChange={onOpenChange}
				onShowEngagements={onShowEngagements}
			/>
			<EngagementEditModal
				engagement={
					overlay.kind === "edit-engagement" ? overlay.engagement : null
				}
				onOpenChange={onOpenChange}
			/>
			{overlay.kind === "new-intake" ? (
				<NewIntakeModal
					open
					client={overlay.client}
					engagementId={overlay.engagementId}
					onOpenChange={onOpenChange}
				/>
			) : null}
			<EngagementCloseDialog
				engagement={
					overlay.kind === "close-engagement" ? overlay.engagement : null
				}
				onOpenChange={onOpenChange}
			/>
		</>
	);

	return { actions, modals };
}
