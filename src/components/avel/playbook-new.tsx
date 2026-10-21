import { useNavigate } from "@tanstack/react-router";
import {
	type CreatePlaybookBody,
	createPlaybookBody,
	type Playbook,
	type Preset,
} from "avel-server/contract";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { preconditionReason } from "@/lib/api/clients";
import {
	loadedPlaybooks,
	useCreatePlaybook,
	usePlaybooks,
} from "@/lib/api/playbooks";
import { loadedPresets, usePresets } from "@/lib/api/presets";
import { describeError } from "@/lib/error-map";
import { ActionModal, type IssuePath, ModalField } from "./action-modal";
import { gateSummary } from "./playbook-list";
import { type NewPlaybookStart, newPlaybookBody } from "./playbook-pipeline";
import { useOpenGeneration } from "./use-open-generation";
import { fieldChanges, WhatChanges } from "./what-changes";

/*
 * A new playbook (ruling 35's Form): its mission type, name, where its
 * process starts and its default preset. POST /api/playbooks makes version
 * 1, and the operator lands on its builder.
 */

const BLANK = "blank";

/** The mission type as the contract checks it; null when it passes. */
export function missionTypeProblem(value: string): string | null {
	const parsed = createPlaybookBody.shape.missionType.safeParse(value.trim());
	return parsed.success
		? null
		: "Lowercase letters, digits and single hyphens, like template-booking.";
}

/** Which field a refusal belongs on, beyond its issue paths. */
export function refusalField(
	error: unknown,
): "missionType" | "defaultPresetId" | null {
	if (!(error instanceof ApiError) || error.failure.kind !== "contract")
		return null;
	if (error.failure.code === "CONFLICT") return "missionType";
	const reason = preconditionReason(error);
	return reason === "preset_misses_first_wave" || reason === "preset_not_found"
		? "defaultPresetId"
		: null;
}

/** The fields this form renders, by the body's names. */
const RENDERED = new Set(["missionType", "name", "defaultPresetId"]);

/**
 * An issue's field, only when the form renders it. The process (waves,
 * gates, deliverable, fields) has no field here, so its issues go to the
 * refusal row with their messages, never counted as marked.
 */
export function newPlaybookFieldOf(path: IssuePath): string | null {
	const head = path[0];
	return typeof head === "string" && RENDERED.has(head) ? head : null;
}

export function NewPlaybookModal({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const navigate = useNavigate();
	const create = useCreatePlaybook({
		onSaved: (saved) => {
			toast.success(`Created ${saved.missionType} v${saved.version}.`);
			onOpenChange(false);
			navigate({
				to: "/presets/playbooks/$missionType",
				params: { missionType: saved.missionType },
				search: { landed: true },
			});
		},
	});
	const generation = useOpenGeneration(open);
	const playbooks = usePlaybooks();
	const presets = usePresets();
	return (
		<NewPlaybookForm
			key={generation}
			open={open}
			onOpenChange={(next) => {
				if (!next) create.reset();
				onOpenChange(next);
			}}
			playbooks={playbooks.data ? loadedPlaybooks(playbooks.data) : []}
			presets={presets.data ? loadedPresets(presets.data) : []}
			pending={create.isPending}
			error={create.error}
			onSubmit={(body) => create.mutate(body)}
		/>
	);
}

/** The form in its modal; the caller owns the request, so it tests directly. */
export function NewPlaybookForm({
	open,
	onOpenChange,
	playbooks,
	presets,
	pending,
	error,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	playbooks: readonly Playbook[];
	presets: readonly Preset[];
	pending: boolean;
	error: ApiError | null;
	onSubmit: (body: CreatePlaybookBody) => void;
}) {
	const [missionType, setMissionType] = useState("");
	const [name, setName] = useState("");
	const [startId, setStartId] = useState(BLANK);
	const [presetId, setPresetId] = useState("");
	const [checked, setChecked] = useState(false);

	const from = playbooks.find((p) => p.id === startId);
	const start: NewPlaybookStart = from
		? { kind: "copy", from }
		: { kind: "blank" };
	const body = newPlaybookBody(missionType, name, presetId, start);
	const typeProblem =
		missionType.trim() === ""
			? "Give it a mission type."
			: missionTypeProblem(missionType);
	const nameProblem = name.trim() === "" ? "Give it a name." : null;
	const presetProblem =
		presetId === "" ? "Choose the team a mission starts from." : null;
	const refusedOn = refusalField(error);
	const refusal = error && refusedOn ? describeError(error).what : undefined;
	const presetName = presets.find((p) => p.id === presetId)?.name;
	/** A field's message: our own check once submitted, else the refusal's. */
	const shown = (problem: string | null, field: string): string | undefined => {
		if (checked && problem !== null) return problem;
		return refusedOn === field ? refusal : undefined;
	};

	const changes = fieldChanges(
		undefined,
		{
			missionType: body.missionType,
			name: body.name,
			waves: body.wavesApplicable,
			gates: body.gates.length === 0 ? [] : [gateSummary(body.gates)],
			deliverable: body.deliverable,
			preset: presetName ?? "",
		},
		[
			{ key: "missionType", label: "Mission type", mono: true },
			{ key: "name", label: "Name" },
			{ key: "waves", label: "Waves", mono: true },
			{ key: "gates", label: "Gates" },
			{ key: "deliverable", label: "Deliverable", mono: true },
			{ key: "preset", label: "Default team" },
		],
	);

	const submit = () => {
		setChecked(true);
		if (typeProblem || nameProblem || presetProblem) return;
		onSubmit(body);
	};

	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="form"
			title="New playbook"
			description="Version 1 of the process for one kind of mission. You can change it in its builder after."
			dirty={
				missionType !== "" ||
				name !== "" ||
				startId !== BLANK ||
				presetId !== ""
			}
			submitLabel="Create playbook"
			pendingLabel="Creating"
			pending={pending}
			error={error}
			fieldOf={newPlaybookFieldOf}
			onSubmit={submit}
			changes={
				<WhatChanges changes={changes} data-testid="playbook-new-changes" />
			}
			data-testid="playbook-new"
		>
			<ModalField
				name="missionType"
				label="Mission type"
				hint="Set once; it never changes"
				error={shown(typeProblem, "missionType")}
				testid="playbook-new-type"
			>
				{(props) => (
					<Input
						{...props}
						className="type-mono"
						placeholder="template-booking"
						autoComplete="off"
						value={missionType}
						onChange={(e) => setMissionType(e.target.value)}
					/>
				)}
			</ModalField>
			<ModalField
				name="name"
				label="Name"
				error={checked ? (nameProblem ?? undefined) : undefined}
				testid="playbook-new-name"
			>
				{(props) => (
					<Input
						{...props}
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				)}
			</ModalField>
			<ModalField name="start" label="Start from" testid="playbook-new-start">
				{(props) => (
					<Select value={startId} onValueChange={setStartId}>
						<SelectTrigger {...props} className="w-full">
							<SelectValue>
								{from
									? `A copy of ${from.name}`
									: "Blank: wave A, no gates, a pull request"}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={BLANK}>
								Blank: wave A, no gates, a pull request
							</SelectItem>
							{playbooks.map((p) => (
								<SelectItem key={p.id} value={p.id}>
									{`A copy of ${p.name}`}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</ModalField>
			<ModalField
				name="defaultPresetId"
				label="Default team"
				error={shown(presetProblem, "defaultPresetId")}
				testid="playbook-new-preset"
			>
				{(props) => (
					<Select value={presetId} onValueChange={setPresetId}>
						<SelectTrigger {...props} className="w-full">
							<SelectValue placeholder="Choose a team">
								{presetName}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{presets.map((p) => (
								<SelectItem key={p.id} value={p.id}>
									{p.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</ModalField>
		</ActionModal>
	);
}
