import type { Client } from "avel-server/contract";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
	activeEngagementsLine,
	type ClientDraft,
	changedFields,
	createBodyOf,
	draftOf,
	fieldErrors,
	preconditionReason,
	useCreateClient,
	useUpdateClient,
} from "@/lib/api/clients";
import { describeError } from "@/lib/error-map";
import {
	ActionModal,
	type FieldIssue,
	type IssuePath,
	ModalField,
} from "./action-modal";
import { useOpenGeneration } from "./use-open-generation";
import { fieldChanges, WhatChanges } from "./what-changes";

/**
 * New client and edit client, in a Form modal (ruling 35).
 *
 * This is step 1 of ROUTES.md's /clients/new onboarding (the client record:
 * name and contact). The six-step wizard, with engagement, repository, the
 * repository read, RepoPolicy and Canon's brief, comes later; this form is
 * the part that exists in the contract today.
 */
export function ClientFormModal({
	open,
	onOpenChange,
	client,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Present when editing; absent when creating. */
	client?: Client;
}) {
	const create = useCreateClient();
	const update = useUpdateClient();
	const mutation = client ? update : create;
	// Each opening starts from the client's current values.
	const generation = useOpenGeneration(open);

	const submit = (draft: ClientDraft) => {
		if (client) {
			const patch = changedFields(client, draft);
			if (patch === null) return;
			update.mutate(
				{ id: client.id, patch },
				{
					onSuccess: (saved) => {
						toast.success(`Saved ${saved.name}.`);
						onOpenChange(false);
					},
				},
			);
		} else {
			create.mutate(createBodyOf(draft), {
				onSuccess: (saved) => {
					toast.success(`Added ${saved.name}.`);
					onOpenChange(false);
				},
			});
		}
	};

	return (
		<ClientForm
			key={`${client?.id ?? "new"}:${generation}`}
			open={open}
			onOpenChange={(next) => {
				if (!next) mutation.reset();
				onOpenChange(next);
			}}
			client={client}
			pending={mutation.isPending}
			error={mutation.error}
			onSubmit={submit}
		/>
	);
}

/** The client fields, by the name the contract's issues use. */
const CLIENT_FIELDS = ["name", "primaryContact", "notesMd"] as const;

/** An issue's field, when it is one of this form's. */
const clientFieldOf = (path: IssuePath): string | null =>
	(CLIENT_FIELDS as readonly unknown[]).includes(path[0])
		? (path[0] as string)
		: null;

/**
 * Copy for a refused field. The validator's own message is for logs, never
 * shown: a field gets this form's copy, anything else a plain line.
 */
export function clientIssueCopy(error: ApiError | null) {
	const copy = fieldErrors(error);
	return (issue: FieldIssue) =>
		(typeof issue.path[0] === "string" ? copy[issue.path[0]] : undefined) ??
		"A value here isn't accepted.";
}

/**
 * The form in its modal. It holds the draft and reports a submit; the caller
 * owns the request. Edit mode compares the draft with the client, so Save
 * holds, saying why, until something changed, and never sends an empty patch.
 */
export function ClientForm({
	open = true,
	onOpenChange = () => {},
	client,
	pending,
	error,
	onSubmit,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	client?: Client;
	pending: boolean;
	error: ApiError | null;
	onSubmit: (draft: ClientDraft) => void;
}) {
	const [draft, setDraft] = useState<ClientDraft>(() => draftOf(client));
	const [nameMissing, setNameMissing] = useState(false);
	const before = client ? draftOf(client) : undefined;
	const changes = fieldChanges(before, draft, [
		{ key: "name", label: "Name" },
		{ key: "primaryContact", label: "Primary contact" },
		{ key: "notesMd", label: "Notes" },
	]);
	const unchanged =
		client !== undefined && changedFields(client, draft) === null;

	const set = (field: keyof ClientDraft) => (value: string) => {
		setDraft((current) => ({ ...current, [field]: value }));
		if (field === "name") setNameMissing(false);
	};

	const submit = () => {
		if (draft.name.trim() === "") {
			setNameMissing(true);
			return;
		}
		onSubmit(draft);
	};

	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="form"
			title={client ? `Edit ${client.name}` : "Add client"}
			description={
				client
					? "Change the client's name, contact or notes."
					: "The client record. Engagements and repositories are added after."
			}
			dirty={changes.length > 0}
			submitLabel={client ? "Save client" : "Add client"}
			pendingLabel={client ? "Saving" : "Adding"}
			submitDisabledReason={unchanged ? "Nothing has changed yet." : undefined}
			onSubmit={submit}
			pending={pending}
			error={error}
			fieldOf={clientFieldOf}
			describeIssue={clientIssueCopy(error)}
			changes={
				<WhatChanges changes={changes} data-testid="client-form-changes" />
			}
			data-testid="client-form"
		>
			<ModalField
				name="name"
				label="Name"
				error={
					nameMissing ? "Give it a name of 1 to 200 characters." : undefined
				}
				testid="client-form-name"
			>
				{(props) => (
					<Input
						{...props}
						required
						maxLength={200}
						autoComplete="organization"
						value={draft.name}
						onChange={(e) => set("name")(e.target.value)}
					/>
				)}
			</ModalField>
			<ModalField
				name="primaryContact"
				label="Primary contact"
				hint="Optional"
				testid="client-form-contact"
			>
				{(props) => (
					<Input
						{...props}
						maxLength={200}
						value={draft.primaryContact}
						onChange={(e) => set("primaryContact")(e.target.value)}
					/>
				)}
			</ModalField>
			<ModalField
				name="notesMd"
				label="Notes"
				hint="Optional"
				testid="client-form-notes"
			>
				{(props) => (
					<Textarea
						{...props}
						rows={4}
						maxLength={20_000}
						value={draft.notesMd}
						onChange={(e) => set("notesMd")(e.target.value)}
					/>
				)}
			</ModalField>
		</ActionModal>
	);
}

/**
 * A labelled field. The error is linked to the control and marks it invalid,
 * so a screen reader hears it with the field.
 */
export function Field({
	label,
	hint,
	error,
	testid,
	children,
}: {
	label: string;
	hint?: string;
	error?: string;
	testid: string;
	children: (props: {
		id: string;
		"data-testid": string;
		"aria-invalid": boolean | undefined;
		"aria-describedby": string | undefined;
	}) => ReactNode;
}) {
	const id = useId();
	const errorId = `${id}-error`;
	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor={id} className="type-small font-medium text-foreground">
				{label}
				{hint ? (
					<span className="ml-2 font-normal text-text-subtle">{hint}</span>
				) : null}
			</label>
			{children({
				id,
				"data-testid": testid,
				"aria-invalid": error ? true : undefined,
				"aria-describedby": error ? errorId : undefined,
			})}
			{error ? (
				<p
					id={errorId}
					data-testid={`${testid}-error`}
					className="type-small text-gate-block"
				>
					{error}
				</p>
			) : null}
		</div>
	);
}

/**
 * What went wrong with a submit, in the operator's words. Field errors are
 * already on their fields, so only a short pointer shows here. Everything
 * else, preconditions included, is the error map's copy: what happened and
 * what to do. A refused close also says how many engagements are active,
 * the one fact the map cannot know.
 */
export function FormError({
	error,
	hasFieldErrors,
	activeEngagements,
}: {
	error: ApiError | null;
	hasFieldErrors: boolean;
	activeEngagements?: number;
}) {
	if (!(error instanceof ApiError)) return null;
	const copy = describeError(error);
	const counted =
		preconditionReason(error) === "client_has_active_engagements" &&
		activeEngagements !== undefined
			? activeEngagementsLine(activeEngagements)
			: null;
	return (
		<div
			role="alert"
			data-testid="form-error"
			className="flex flex-col gap-1 rounded-sm border border-gate-block-line bg-gate-block-soft px-3 py-2"
		>
			<p className="type-small text-foreground">
				{hasFieldErrors ? "Check the fields marked above." : copy.what}
			</p>
			{counted ? (
				<p
					data-testid="form-error-count"
					className="type-small text-foreground"
				>
					{counted}
				</p>
			) : null}
			{hasFieldErrors ? null : (
				<p className="type-small text-text-muted">{copy.next}</p>
			)}
		</div>
	);
}
