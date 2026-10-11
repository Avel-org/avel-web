import type { Client } from "avel-server/contract";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api";
import {
	type CreateEngagementBody,
	dateInputToIso,
	useCreateEngagement,
} from "@/lib/api/clients";
import { ActionModal, type IssuePath, ModalField } from "./action-modal";
import { clientIssueCopy } from "./client-form";
import { useOpenGeneration } from "./use-open-generation";
import { fieldChanges, WhatChanges } from "./what-changes";

/** A new engagement for one client, in a Form modal (ruling 35). */
export function EngagementFormModal({
	open,
	onOpenChange,
	client,
	today,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	client: Client | null;
	/** "YYYY-MM-DD": the default start date. */
	today: string;
}) {
	const create = useCreateEngagement();
	const generation = useOpenGeneration(open);
	if (!client) return null;
	return (
		<EngagementForm
			key={`${client.id}:${generation}`}
			open={open}
			onOpenChange={(next) => {
				if (!next) create.reset();
				onOpenChange(next);
			}}
			clientId={client.id}
			clientName={client.name}
			today={today}
			pending={create.isPending}
			error={create.error}
			onSubmit={(body) =>
				create.mutate(body, {
					onSuccess: (saved) => {
						toast.success(`Started ${saved.name}.`);
						onOpenChange(false);
					},
				})
			}
		/>
	);
}

const ENGAGEMENT_FIELDS = ["name", "scopeMd", "startedAt"] as const;

const engagementFieldOf = (path: IssuePath): string | null =>
	(ENGAGEMENT_FIELDS as readonly unknown[]).includes(path[0])
		? (path[0] as string)
		: null;

/** The form in its modal; it holds the draft and reports a submit. */
export function EngagementForm({
	open = true,
	onOpenChange = () => {},
	clientId,
	clientName,
	today,
	pending,
	error,
	onSubmit,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	clientId: string;
	clientName?: string;
	today: string;
	pending: boolean;
	error: ApiError | null;
	onSubmit: (body: CreateEngagementBody) => void;
}) {
	const [name, setName] = useState("");
	const [scope, setScope] = useState("");
	const [started, setStarted] = useState(today);
	const [nameMissing, setNameMissing] = useState(false);
	const changes = fieldChanges(
		undefined,
		{ name: name.trim(), scope: scope.trim(), started },
		[
			{ key: "name", label: "Name" },
			{ key: "scope", label: "Scope" },
			{ key: "started", label: "Started", mono: true },
		],
	);

	const submit = () => {
		if (name.trim() === "") {
			setNameMissing(true);
			return;
		}
		onSubmit({
			clientId,
			name: name.trim(),
			...(scope.trim() === "" ? {} : { scopeMd: scope.trim() }),
			...(started === "" ? {} : { startedAt: dateInputToIso(started) }),
		});
	};

	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="form"
			title="Start engagement"
			description={
				clientName
					? `For ${clientName}. An engagement groups the missions, connections and knowledge for one body of work.`
					: "An engagement groups the missions, connections and knowledge for one body of work."
			}
			// The start date defaults to today; only what was typed counts.
			dirty={name.trim() !== "" || scope.trim() !== "" || started !== today}
			submitLabel="Start engagement"
			pendingLabel="Starting"
			onSubmit={submit}
			pending={pending}
			error={error}
			fieldOf={engagementFieldOf}
			describeIssue={clientIssueCopy(error)}
			changes={
				<WhatChanges changes={changes} data-testid="engagement-form-changes" />
			}
			data-testid="engagement-form"
		>
			<ModalField
				name="name"
				label="Name"
				error={
					nameMissing ? "Give it a name of 1 to 200 characters." : undefined
				}
				testid="engagement-form-name"
			>
				{(props) => (
					<Input
						{...props}
						required
						maxLength={200}
						value={name}
						onChange={(e) => {
							setName(e.target.value);
							setNameMissing(false);
						}}
					/>
				)}
			</ModalField>
			<ModalField
				name="scopeMd"
				label="Scope"
				hint="Optional"
				testid="engagement-form-scope"
			>
				{(props) => (
					<Textarea
						{...props}
						rows={4}
						maxLength={20_000}
						value={scope}
						onChange={(e) => setScope(e.target.value)}
					/>
				)}
			</ModalField>
			<ModalField
				name="startedAt"
				label="Started"
				testid="engagement-form-started"
			>
				{(props) => (
					<Input
						{...props}
						type="date"
						value={started}
						onChange={(e) => setStarted(e.target.value)}
					/>
				)}
			</ModalField>
		</ActionModal>
	);
}
