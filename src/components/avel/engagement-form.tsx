import type { Client, Engagement } from "avel-server/contract";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api";
import {
	type CreateEngagementBody,
	dateInputToIso,
	type UpdateEngagementBody,
	useCreateEngagement,
	useUpdateEngagement,
} from "@/lib/api/clients";
import { landRecord } from "@/shell/motion";
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
						landRecord(saved.id);
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
			// What is missing shows on the button before it is pressed.
			submitDisabledReason={
				name.trim() === "" ? "Give the engagement a name." : undefined
			}
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
			<ModalField name="name" label="Name" testid="engagement-form-name">
				{(props) => (
					<Input
						{...props}
						required
						maxLength={200}
						value={name}
						onChange={(e) => setName(e.target.value)}
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

/**
 * An engagement's name and scope, changed in place. Its client and status
 * never change here (status only through close); a closed one can still be
 * renamed.
 */
export function EngagementEditModal({
	engagement,
	onOpenChange,
}: {
	engagement: Engagement | null;
	onOpenChange: (open: boolean) => void;
}) {
	const update = useUpdateEngagement();
	const generation = useOpenGeneration(engagement !== null);
	if (!engagement) return null;
	return (
		<EngagementEditForm
			key={`${engagement.id}:${generation}`}
			onOpenChange={(next) => {
				if (!next) update.reset();
				onOpenChange(next);
			}}
			engagement={engagement}
			pending={update.isPending}
			error={update.error}
			onSubmit={(body) =>
				update.mutate(
					{ id: engagement.id, body },
					{
						onSuccess: (saved) => {
							toast.success(`Saved ${saved.name}.`);
							onOpenChange(false);
							landRecord(saved.id);
						},
					},
				)
			}
		/>
	);
}

/** What Save sends: only the fields that changed. An emptied scope is cleared. */
export function engagementEditBody(
	engagement: Pick<Engagement, "name" | "scopeMd">,
	name: string,
	scope: string,
): UpdateEngagementBody {
	const nextScope = scope.trim();
	return {
		...(name.trim() === engagement.name ? {} : { name: name.trim() }),
		...(nextScope === (engagement.scopeMd ?? "")
			? {}
			: { scopeMd: nextScope === "" ? null : nextScope }),
	};
}

/** The edit form: only the fields that changed are sent. */
export function EngagementEditForm({
	open = true,
	onOpenChange = () => {},
	engagement,
	pending,
	error,
	onSubmit,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	engagement: Pick<Engagement, "name" | "scopeMd">;
	pending: boolean;
	error: ApiError | null;
	onSubmit: (body: UpdateEngagementBody) => void;
}) {
	const [name, setName] = useState(engagement.name);
	const [scope, setScope] = useState(engagement.scopeMd ?? "");
	const before = { name: engagement.name, scope: engagement.scopeMd ?? "" };
	const after = { name: name.trim(), scope: scope.trim() };
	const changes = fieldChanges(before, after, [
		{ key: "name", label: "Name" },
		{ key: "scope", label: "Scope" },
	]);

	const submit = () => onSubmit(engagementEditBody(engagement, name, scope));

	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="form"
			title="Edit engagement"
			description="Its missions show the new name. The client and status stay as they are."
			dirty={changes.length > 0}
			submitLabel="Save engagement"
			pendingLabel="Saving"
			submitDisabledReason={
				changes.length === 0
					? "Nothing has changed yet."
					: after.name === ""
						? "Give the engagement a name."
						: undefined
			}
			onSubmit={submit}
			pending={pending}
			error={error}
			fieldOf={engagementFieldOf}
			describeIssue={clientIssueCopy(error)}
			changes={
				<WhatChanges changes={changes} data-testid="engagement-edit-changes" />
			}
			data-testid="engagement-edit"
		>
			<ModalField name="name" label="Name" testid="engagement-edit-name">
				{(props) => (
					<Input
						{...props}
						required
						maxLength={200}
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				)}
			</ModalField>
			<ModalField
				name="scopeMd"
				label="Scope"
				hint="Optional. Empty it to clear the scope."
				testid="engagement-edit-scope"
			>
				{(props) => (
					<Textarea
						{...props}
						rows={6}
						maxLength={20_000}
						value={scope}
						onChange={(e) => setScope(e.target.value)}
					/>
				)}
			</ModalField>
		</ActionModal>
	);
}
