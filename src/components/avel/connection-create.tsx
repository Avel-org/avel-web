import { useInfiniteQuery } from "@tanstack/react-query";
import { createConnectionBody } from "avel-server/contract";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { type ApiError, useApiClient } from "@/lib/api";
import {
	clientEngagementsQuery,
	dateInputToIso,
	useClients,
} from "@/lib/api/clients";
import {
	CONNECTION_SCOPE,
	type ConnectionScopeType,
	type CreateConnectionBody,
	useCreateConnection,
} from "@/lib/api/connections";
import { landRecord } from "@/shell/motion";
import { ActionModal, type IssuePath, ModalField } from "./action-modal";
import { OptionCards } from "./option-cards";
import { useOpenGeneration } from "./use-open-generation";
import { fieldChanges, WhatChanges } from "./what-changes";

/*
 * Add connection (POST /api/connections), in a Form modal (ruling 35). A
 * connection is always an active GitHub one, for one client engagement or
 * for AVEL's own work, scoped to an owner or one repository. Its token stays
 * on the server: the form takes the name of the environment variable that
 * holds it, never the token, and the contract refuses anything shaped like
 * a token.
 */

// ---------------------------------------------------------------------------
// The draft: pure, tested directly.

/** Who the connection is for: AVEL's own work, or one client engagement. */
export type ConnectionFor = "avel" | "engagement";

/** The form's fields, as typed. */
export type ConnectionDraft = {
	label: string;
	for: ConnectionFor;
	clientId: string;
	engagementId: string;
	scopeType: ConnectionScopeType;
	scopeValue: string;
	credentialRef: string;
	/** "YYYY-MM-DD", or "" for none. */
	expires: string;
};

export const EMPTY_CONNECTION_DRAFT: ConnectionDraft = {
	label: "",
	for: "engagement",
	clientId: "",
	engagementId: "",
	scopeType: "repo",
	scopeValue: "",
	credentialRef: "",
	expires: "",
};

/** The body the draft sends. The credential's name is sent as typed. */
export function connectionBodyOf(draft: ConnectionDraft): CreateConnectionBody {
	return {
		engagementId:
			draft.for === "avel" || draft.engagementId === ""
				? null
				: draft.engagementId,
		label: draft.label.trim(),
		scopeType: draft.scopeType,
		scopeValue: draft.scopeValue.trim(),
		credentialRef: draft.credentialRef,
		...(draft.expires === ""
			? {}
			: { expiresAt: dateInputToIso(draft.expires) }),
	};
}

const LABEL_COPY = "Give it a name of 1 to 200 characters.";
const ENGAGEMENT_COPY = "Choose the engagement it is for.";
const SCOPE_COPY = {
	owner: "Give one GitHub owner, such as meridian-co.",
	repo: "Give owner/repo, such as meridian-co/app.",
} as const satisfies Record<ConnectionScopeType, string>;

/**
 * What would be refused, by field, before anything is sent. The contract's
 * own schema decides; the scope and credential keep its words, which are
 * already plain, and the rest get this form's.
 */
export function draftIssues(
	draft: ConnectionDraft,
): Partial<Record<keyof CreateConnectionBody, string>> {
	const issues: Partial<Record<keyof CreateConnectionBody, string>> = {};
	if (draft.for === "engagement" && draft.engagementId === "")
		issues.engagementId = ENGAGEMENT_COPY;
	const parsed = createConnectionBody.safeParse(connectionBodyOf(draft));
	if (parsed.success) return issues;
	for (const issue of parsed.error.issues) {
		const field = issue.path[0];
		if (field === "label") issues.label ??= LABEL_COPY;
		else if (field === "scopeValue")
			issues.scopeValue ??=
				issue.code === "custom" ? issue.message : SCOPE_COPY[draft.scopeType];
		else if (field === "credentialRef") issues.credentialRef ??= issue.message;
		else if (field === "expiresAt")
			issues.expiresAt ??= "Give a date, or leave it empty.";
	}
	return issues;
}

const FIELDS = [
	"label",
	"engagementId",
	"scopeType",
	"scopeValue",
	"credentialRef",
	"expiresAt",
] as const;

const fieldOf = (path: IssuePath): string | null =>
	(FIELDS as readonly unknown[]).includes(path[0]) ? (path[0] as string) : null;

const FOR_OPTIONS = [
	{
		value: "engagement",
		title: "A client engagement",
		meta: "Its work reads and delivers through it",
		"data-testid": "connection-form-for-engagement",
	},
	{
		value: "avel",
		title: "AVEL's own work",
		meta: "Internal missions, no client",
		"data-testid": "connection-form-for-avel",
	},
] as const;

const SCOPE_OPTIONS = [
	{
		value: "repo",
		title: CONNECTION_SCOPE.repo,
		meta: "One repository: owner/repo",
		"data-testid": "connection-form-scope-repo",
	},
	{
		value: "owner",
		title: CONNECTION_SCOPE.owner,
		meta: "Every repository under one owner",
		"data-testid": "connection-form-scope-owner",
	},
] as const;

// ---------------------------------------------------------------------------
// The trigger and the modal.

/**
 * Whatever opens the form (the page's button, the board's dashed card, the
 * empty state's action), with the modal it opens.
 */
export function NewConnection({
	children,
}: {
	children: (open: () => void) => ReactNode;
}) {
	const [open, setOpen] = useState(false);
	return (
		<>
			{children(() => setOpen(true))}
			<ConnectionFormModal open={open} onOpenChange={setOpen} />
		</>
	);
}

/** The form with its request: closes on success, keeps the draft on a refusal. */
export function ConnectionFormModal({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const create = useCreateConnection();
	const generation = useOpenGeneration(open);
	return (
		<ConnectionForm
			// A fresh draft each time it opens.
			key={generation}
			open={open}
			onOpenChange={(next) => {
				if (!next) create.reset();
				onOpenChange(next);
			}}
			pending={create.isPending}
			error={create.error}
			onSubmit={(body) =>
				create.mutate(body, {
					onSuccess: (saved) => {
						toast.success(`Added ${saved.label}.`);
						onOpenChange(false);
						landRecord(saved.id);
					},
				})
			}
		/>
	);
}

/** The form in its modal; it holds the draft and reports a submit. */
export function ConnectionForm({
	open = true,
	onOpenChange = () => {},
	initial = EMPTY_CONNECTION_DRAFT,
	pending,
	error,
	onSubmit,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	initial?: ConnectionDraft;
	pending: boolean;
	error: ApiError | null;
	onSubmit: (body: CreateConnectionBody) => void;
}) {
	const [draft, setDraft] = useState(initial);
	// Checks show once a submit was tried, then follow the typing.
	const [tried, setTried] = useState(false);
	const set = (patch: Partial<ConnectionDraft>) =>
		setDraft((now) => ({ ...now, ...patch }));
	const issues = tried ? draftIssues(draft) : {};
	const body = connectionBodyOf(draft);
	const changes = fieldChanges(
		undefined,
		{
			label: body.label,
			scope: body.scopeValue,
			credential: body.credentialRef,
			expires: draft.expires,
		},
		[
			{ key: "label", label: "Name" },
			{ key: "scope", label: CONNECTION_SCOPE[draft.scopeType], mono: true },
			{ key: "credential", label: "Token in", mono: true },
			{ key: "expires", label: "Expires", mono: true },
		],
	);

	const submit = () => {
		setTried(true);
		if (Object.keys(draftIssues(draft)).length > 0) return;
		onSubmit(body);
	};

	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="form"
			title="Add connection"
			description="A GitHub account AVEL may read and deliver through, limited to one owner or one repository. It starts active."
			dirty={JSON.stringify(draft) !== JSON.stringify(initial)}
			submitLabel="Add connection"
			pendingLabel="Adding"
			onSubmit={submit}
			pending={pending}
			error={error}
			fieldOf={fieldOf}
			changes={
				<WhatChanges changes={changes} data-testid="connection-form-changes" />
			}
			data-testid="connection-form"
		>
			<ModalField
				name="label"
				label="Name"
				error={issues.label}
				testid="connection-form-label"
			>
				{(props) => (
					<Input
						{...props}
						required
						maxLength={200}
						placeholder="Meridian app"
						value={draft.label}
						onChange={(e) => set({ label: e.target.value })}
					/>
				)}
			</ModalField>
			<OptionCards
				legend="For"
				value={draft.for}
				onChange={(next) => set({ for: next })}
				options={FOR_OPTIONS}
				columns={2}
				data-testid="connection-form-for"
			/>
			{draft.for === "engagement" ? (
				<EngagementPicker
					clientId={draft.clientId}
					engagementId={draft.engagementId}
					error={issues.engagementId}
					onClient={(clientId) => set({ clientId, engagementId: "" })}
					onEngagement={(engagementId) => set({ engagementId })}
				/>
			) : null}
			<OptionCards
				legend="Scope"
				value={draft.scopeType}
				onChange={(scopeType) => set({ scopeType })}
				options={SCOPE_OPTIONS}
				columns={2}
				data-testid="connection-form-scope-type"
			/>
			<ModalField
				name="scopeValue"
				label={draft.scopeType === "owner" ? "Owner" : "Repository"}
				hint={draft.scopeType === "owner" ? "owner" : "owner/repo"}
				error={issues.scopeValue}
				testid="connection-form-scope-value"
			>
				{(props) => (
					<Input
						{...props}
						required
						maxLength={200}
						spellCheck={false}
						autoComplete="off"
						className="type-mono"
						placeholder={
							draft.scopeType === "owner" ? "meridian-co" : "meridian-co/app"
						}
						value={draft.scopeValue}
						onChange={(e) => set({ scopeValue: e.target.value })}
					/>
				)}
			</ModalField>
			<ModalField
				name="credentialRef"
				label="Token variable"
				hint="The name of the environment variable on the server that holds the token. Never the token itself."
				error={issues.credentialRef}
				testid="connection-form-credential"
			>
				{(props) => (
					<Input
						{...props}
						required
						maxLength={128}
						spellCheck={false}
						autoComplete="off"
						className="type-mono"
						placeholder="MERIDIAN_GITHUB_TOKEN"
						value={draft.credentialRef}
						// Sent as typed: changing the case would let a pasted
						// token through the check that refuses it.
						onChange={(e) => set({ credentialRef: e.target.value })}
					/>
				)}
			</ModalField>
			<ModalField
				name="expiresAt"
				label="Expires"
				hint="Optional"
				error={issues.expiresAt}
				testid="connection-form-expires"
			>
				{(props) => (
					<Input
						{...props}
						type="date"
						value={draft.expires}
						onChange={(e) => set({ expires: e.target.value })}
					/>
				)}
			</ModalField>
		</ActionModal>
	);
}

// Radix Select takes no empty value, so "" shows the placeholder instead.
const unset = (value: string) => (value === "" ? undefined : value);

/**
 * The engagement, chosen by its client first: an active client, then one of
 * its active engagements. A closed one cannot take a new connection.
 */
function EngagementPicker({
	clientId,
	engagementId,
	error,
	onClient,
	onEngagement,
}: {
	clientId: string;
	engagementId: string;
	error?: string;
	onClient: (clientId: string) => void;
	onEngagement: (engagementId: string) => void;
}) {
	const clients = useClients(undefined, "active");
	const engagements = useInfiniteQuery({
		...clientEngagementsQuery(useApiClient(), clientId, "active"),
		enabled: clientId !== "",
	});
	const clientRows = clients.data?.pages.flatMap((p) => p.data) ?? [];
	const engagementRows = engagements.data?.pages.flatMap((p) => p.data) ?? [];
	const noEngagements =
		clientId !== "" &&
		engagements.status === "success" &&
		engagementRows.length === 0;
	return (
		<div className="grid gap-4 sm:grid-cols-2">
			<ModalField
				name="clientId"
				label="Client"
				testid="connection-form-client"
			>
				{(props) => (
					<Select value={unset(clientId)} onValueChange={onClient}>
						<SelectTrigger
							{...props}
							className="w-full"
							disabledReason={
								clients.status === "error"
									? "Clients could not be read"
									: clients.status === "pending"
										? "Reading clients"
										: undefined
							}
						>
							<SelectValue
								placeholder={
									clients.status === "error"
										? "Clients could not be read"
										: clients.status === "pending"
											? "Reading clients"
											: "Choose a client"
								}
							/>
						</SelectTrigger>
						<SelectContent>
							{clientRows.map((c) => (
								<SelectItem key={c.id} value={c.id}>
									{c.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</ModalField>
			<ModalField
				name="engagementId"
				label="Engagement"
				error={
					error ??
					(noEngagements ? "This client has no active engagement." : undefined)
				}
				testid="connection-form-engagement"
			>
				{(props) => (
					<Select value={unset(engagementId)} onValueChange={onEngagement}>
						<SelectTrigger
							{...props}
							className="w-full"
							disabledReason={
								clientId === ""
									? "Choose a client first"
									: engagements.status === "error"
										? "Engagements could not be read"
										: engagements.status === "pending"
											? "Reading engagements"
											: undefined
							}
						>
							<SelectValue
								placeholder={
									clientId === ""
										? "Choose a client first"
										: engagements.status === "error"
											? "Engagements could not be read"
											: "Choose an engagement"
								}
							/>
						</SelectTrigger>
						<SelectContent>
							{engagementRows.map((e) => (
								<SelectItem key={e.id} value={e.id}>
									{e.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</ModalField>
		</div>
	);
}
