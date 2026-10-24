import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientEngagements, useClients } from "@/lib/api/clients";
import { useCreateIntake } from "@/lib/api/intakes";
import { NewIntakeForm } from "./intake-new";
import { OptionCards } from "./option-cards";
import { useOpenGeneration } from "./use-open-generation";

/*
 * New mission. A mission is created when its intake is approved
 * (POST /api/intakes/:id/approve), so New mission starts that intake: the
 * client, one of its active engagements, and what the client asked for. It
 * opens on the intake's page, where Canon briefs it and the operator
 * proposes and approves it.
 */

export function NewMissionModal({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const clients = useClients(undefined, "active", { enabled: open });
	const list = clients.data?.pages.flatMap((page) => page.data);
	const [picked, setPicked] = useState("");
	// One client is the only choice: chosen already.
	const clientId = picked || (list?.length === 1 ? (list[0]?.id ?? "") : "");
	const client = list?.find((c) => c.id === clientId);
	const engagements = useClientEngagements(clientId, "active", {
		enabled: open && clientId !== "",
	});
	const create = useCreateIntake();
	const navigate = useNavigate();
	const generation = useOpenGeneration(open);

	const picker =
		list === undefined ? (
			<div
				data-testid="mission-new-clients-loading"
				className="flex flex-col gap-2"
			>
				<Skeleton className="h-4 w-16" />
				<Skeleton className="h-14 w-full rounded-card" />
			</div>
		) : list.length === 0 ? (
			<p
				data-testid="mission-new-no-client"
				className="rounded-control border border-border bg-app-well px-3 py-2 type-small text-text-muted"
			>
				There is no active client. A mission is for a client, so add one on
				Clients first.
			</p>
		) : (
			<OptionCards
				legend="Client"
				value={clientId}
				onChange={setPicked}
				columns={list.length > 1 ? 2 : 1}
				data-testid="mission-new-client"
				options={list.map((c) => ({
					value: c.id,
					title: c.name,
					"data-testid": `mission-new-client-${c.id}`,
				}))}
			/>
		);

	return (
		<NewIntakeForm
			key={generation}
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					create.reset();
					setPicked("");
				}
				onOpenChange(next);
			}}
			title="New mission"
			description="A mission starts as an intake: what the client asked for, under one of their engagements. Canon briefs it, and approving it creates the mission."
			clientPicker={picker}
			clientName={client?.name ?? ""}
			engagements={
				engagements.data?.pages.flatMap((page) => page.data) ?? undefined
			}
			pending={create.isPending}
			error={create.error}
			onSubmit={(body) =>
				create.mutate(body, {
					onSuccess: (intake) => {
						toast.success("Intake created as a draft.");
						onOpenChange(false);
						setPicked("");
						void navigate({
							to: "/clients/$id/intakes/$intakeId",
							params: { id: clientId, intakeId: intake.id },
						});
					},
				})
			}
		/>
	);
}
