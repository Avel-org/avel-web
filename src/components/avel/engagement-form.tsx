import type { Client } from "avel-server/contract";
import { type FormEvent, useState } from "react";
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
import type { ApiError } from "@/lib/api";
import {
	type CreateEngagementBody,
	dateInputToIso,
	fieldErrors,
	useCreateEngagement,
} from "@/lib/api/clients";
import { Field, FormError } from "./client-form";

/** A new engagement for one client, in a sheet. */
export function EngagementFormSheet({
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
	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!next) create.reset();
				onOpenChange(next);
			}}
		>
			<SheetContent side="right" data-testid="engagement-form-sheet">
				<SheetHeader>
					<SheetTitle>New engagement</SheetTitle>
					<SheetDescription>
						{client
							? `For ${client.name}. An engagement groups the missions, connections and knowledge for one body of work.`
							: ""}
					</SheetDescription>
				</SheetHeader>
				{client ? (
					<EngagementForm
						key={client.id}
						clientId={client.id}
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
				) : null}
			</SheetContent>
		</Sheet>
	);
}

/** The form itself; presentational, so it tests directly. */
export function EngagementForm({
	clientId,
	today,
	pending,
	error,
	onSubmit,
}: {
	clientId: string;
	today: string;
	pending: boolean;
	error: ApiError | null;
	onSubmit: (body: CreateEngagementBody) => void;
}) {
	const [name, setName] = useState("");
	const [scope, setScope] = useState("");
	const [started, setStarted] = useState(today);
	const [nameMissing, setNameMissing] = useState(false);
	const serverErrors = fieldErrors(error);
	const errors: Record<string, string> = {
		...serverErrors,
		...(nameMissing ? { name: "Give it a name of 1 to 200 characters." } : {}),
	};

	const submit = (event: FormEvent) => {
		event.preventDefault();
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
		<form
			data-testid="engagement-form"
			noValidate
			onSubmit={submit}
			className="flex flex-1 flex-col gap-4 px-4 pb-4"
		>
			<Field label="Name" error={errors.name} testid="engagement-form-name">
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
			</Field>
			<Field
				label="Scope"
				hint="Optional"
				error={errors.scopeMd}
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
			</Field>
			<Field
				label="Started"
				error={errors.startedAt}
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
			</Field>
			<FormError
				error={error}
				hasFieldErrors={Object.keys(serverErrors).length > 0}
			/>
			<div className="mt-auto flex justify-end gap-2">
				<Button
					type="submit"
					data-testid="engagement-form-submit"
					disabled={pending}
				>
					{pending ? "Starting" : "Start engagement"}
				</Button>
			</div>
		</form>
	);
}
