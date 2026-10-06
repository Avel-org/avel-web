import type { Client } from "avel-server/contract";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
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

/**
 * New client and edit client, in a sheet.
 *
 * This is step 1 of ROUTES.md's /clients/new onboarding (the client record:
 * name and contact). The six-step wizard, with engagement, repository, the
 * repository read, RepoPolicy and Canon's brief, comes later; this form is
 * the part that exists in the contract today.
 */
export function ClientFormSheet({
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
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!next) mutation.reset();
				onOpenChange(next);
			}}
		>
			<SheetContent side="right" data-testid="client-form-sheet">
				<SheetHeader>
					<SheetTitle>
						{client ? `Edit ${client.name}` : "New client"}
					</SheetTitle>
					<SheetDescription>
						{client
							? "Change the client's name, contact or notes."
							: "The client record. Engagements and repositories are added after."}
					</SheetDescription>
				</SheetHeader>
				{/* Keyed by the client, so reopening starts from its current values. */}
				<ClientForm
					key={client?.id ?? "new"}
					client={client}
					pending={mutation.isPending}
					error={mutation.error}
					onSubmit={submit}
				/>
			</SheetContent>
		</Sheet>
	);
}

/**
 * The form itself. Presentational: it holds the draft and reports a submit;
 * the sheet owns the request. Edit mode compares the draft with the client,
 * so Save is disabled until something changed and never sends an empty patch.
 */
export function ClientForm({
	client,
	pending,
	error,
	onSubmit,
}: {
	client?: Client;
	pending: boolean;
	error: ApiError | null;
	onSubmit: (draft: ClientDraft) => void;
}) {
	const [draft, setDraft] = useState<ClientDraft>(() => draftOf(client));
	const [nameMissing, setNameMissing] = useState(false);
	const serverErrors = fieldErrors(error);
	const errors: Record<string, string> = {
		...serverErrors,
		...(nameMissing ? { name: "Give it a name of 1 to 200 characters." } : {}),
	};
	const unchanged =
		client !== undefined && changedFields(client, draft) === null;

	const set = (field: keyof ClientDraft) => (value: string) => {
		setDraft((current) => ({ ...current, [field]: value }));
		if (field === "name") setNameMissing(false);
	};

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (draft.name.trim() === "") {
			setNameMissing(true);
			return;
		}
		onSubmit(draft);
	};

	return (
		<form
			data-testid="client-form"
			noValidate
			onSubmit={submit}
			className="flex flex-1 flex-col gap-4 px-4 pb-4"
		>
			<Field label="Name" error={errors.name} testid="client-form-name">
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
			</Field>
			<Field
				label="Primary contact"
				hint="Optional"
				error={errors.primaryContact}
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
			</Field>
			<Field
				label="Notes"
				hint="Optional"
				error={errors.notesMd}
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
			</Field>
			<FormError
				error={error}
				hasFieldErrors={Object.keys(serverErrors).length > 0}
			/>
			<div className="mt-auto flex justify-end gap-2">
				<Button
					type="submit"
					data-testid="client-form-submit"
					disabled={pending}
					disabledReason={unchanged ? "Nothing has changed yet." : undefined}
				>
					{pending ? "Saving" : client ? "Save changes" : "Add client"}
				</Button>
			</div>
		</form>
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
