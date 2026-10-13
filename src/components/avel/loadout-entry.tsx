import type { RosterEntry } from "avel-server/contract";
import { type ComponentProps, useId, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api";
import {
	CUT_LABEL,
	type PresetCut,
	presetIssueCopy,
	useCreatePreset,
} from "@/lib/api/presets";
import {
	type EntryDraft,
	type EntryField,
	entryDraftOf,
	entryFieldOf,
	entryName,
	entryPatchOf,
	entryProblems,
	presetBodyFromRoster,
	rosterIssueCopy,
	useRemoveRosterEntry,
	useUpdateRosterEntry,
} from "@/lib/api/roster";
import { ActionModal, ModalField } from "./action-modal";
import { useOpenGeneration } from "./use-open-generation";
import { type Change, fieldChanges, WhatChanges } from "./what-changes";

const LABEL: Record<EntryField, string> = {
	customizedMd: "Instructions for this mission",
	territory: "Territory",
	estimatedTokens: "Estimated tokens",
	tokenSoftCeiling: "Soft ceiling",
	tokenHardCeiling: "Hard ceiling",
};

/** What a save changes, field by field, against the loaded entry. */
function entryChanges(entry: RosterEntry, draft: EntryDraft): Change[] {
	const before = entryDraftOf(entry);
	return fieldChanges(before, draft, [
		{ key: "customizedMd", label: LABEL.customizedMd },
		{ key: "territory", label: LABEL.territory },
		{ key: "estimatedTokens", label: LABEL.estimatedTokens, mono: true },
		{ key: "tokenSoftCeiling", label: LABEL.tokenSoftCeiling, mono: true },
		{ key: "tokenHardCeiling", label: LABEL.tokenHardCeiling, mono: true },
	]).map((change) =>
		// Instructions are long: say that they changed, not what to.
		change.label === LABEL.customizedMd
			? { label: change.label, kind: change.kind }
			: change,
	);
}

/**
 * Edit one entry (Form): its mission instructions, territory and token
 * budget. Every rule is the contract's (updateRosterEntryBody, then
 * rosterEntryProblems over the entry as it would stand), shown on its field
 * before sending; a refusal's issues land on their fields by path.
 */
export function EntryEditorModal({
	missionId,
	entry,
	open,
	onOpenChange,
	readOnlyReason,
}: {
	missionId: string;
	entry: RosterEntry | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	readOnlyReason: string | null;
}) {
	const update = useUpdateRosterEntry(missionId);
	const generation = useOpenGeneration(open);
	if (entry === null) return null;
	return (
		<EntryEditor
			key={`${entry.id}:${generation}`}
			entry={entry}
			open={open}
			onOpenChange={(next) => {
				if (!next) update.reset();
				onOpenChange(next);
			}}
			readOnlyReason={readOnlyReason}
			pending={update.isPending}
			error={update.error}
			onSave={async (patch) => {
				try {
					const saved = await update.mutateAsync({ entryId: entry.id, patch });
					toast.success(`Saved ${entryName(saved)}.`);
					onOpenChange(false);
				} catch {
					// The refusal is on update.error, shown in the modal.
				}
			}}
		/>
	);
}

export function EntryEditor({
	entry,
	open = true,
	onOpenChange = () => {},
	readOnlyReason,
	pending,
	error,
	onSave,
}: {
	entry: RosterEntry;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	readOnlyReason: string | null;
	pending: boolean;
	error: ApiError | null;
	onSave: (patch: NonNullable<ReturnType<typeof entryPatchOf>>) => void;
}) {
	const [draft, setDraft] = useState(() => entryDraftOf(entry));
	const patch = entryPatchOf(entry, draft);
	const problems = entryProblems(entry, draft);
	const set = (field: EntryField) => (value: string) =>
		setDraft((d) => ({ ...d, [field]: value }));
	const reason =
		readOnlyReason ??
		(patch === null
			? "Change a field first."
			: Object.keys(problems).length > 0
				? "Fix the marked fields first."
				: undefined);
	const field = (
		name: EntryField,
		input: ComponentProps<typeof ModalField>["children"],
		hint?: string,
	) => (
		<ModalField
			name={name}
			label={LABEL[name]}
			hint={hint}
			error={problems[name]}
			testid={`loadout-entry-${name}`}
		>
			{input}
		</ModalField>
	);
	const number = (name: EntryField) => (props: { id: string }) => (
		<Input
			{...props}
			inputMode="numeric"
			className="tabular-nums"
			disabled={readOnlyReason !== null}
			value={draft[name]}
			onChange={(e) => set(name)(e.target.value)}
		/>
	);
	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="form"
			title={`Edit ${entry.agentTemplate.name}`}
			description={`${entryName(entry)} on this mission. The agent itself is unchanged; this copy is the mission's own.`}
			dirty={patch !== null}
			submitLabel="Save entry"
			submitDisabledReason={reason}
			onSubmit={() => {
				if (patch !== null) onSave(patch);
			}}
			pending={pending}
			error={error}
			fieldOf={entryFieldOf}
			describeIssue={rosterIssueCopy}
			changes={
				<WhatChanges
					data-testid="loadout-entry-changes"
					changes={entryChanges(entry, draft)}
				/>
			}
			data-testid="loadout-entry"
		>
			{field(
				"customizedMd",
				(props) => (
					<Textarea
						{...props}
						rows={6}
						className="type-mono-small"
						maxLength={20_000}
						disabled={readOnlyReason !== null}
						value={draft.customizedMd}
						onChange={(e) => set("customizedMd")(e.target.value)}
					/>
				),
				"Markdown. Empty keeps the agent's.",
			)}
			{field(
				"territory",
				(props) => (
					<Input
						{...props}
						maxLength={200}
						placeholder="Whole project"
						disabled={readOnlyReason !== null}
						value={draft.territory}
						onChange={(e) => set("territory")(e.target.value)}
					/>
				),
				"Optional",
			)}
			<div className="grid gap-3 sm:grid-cols-3">
				{field("estimatedTokens", number("estimatedTokens"), "Optional")}
				{field("tokenSoftCeiling", number("tokenSoftCeiling"))}
				{field("tokenHardCeiling", number("tokenHardCeiling"))}
			</div>
			<p className="type-caption text-text-subtle">
				The estimate is a planning default. Each ceiling is at least the
				estimate, and the hard ceiling at least the soft.
			</p>
		</ActionModal>
	);
}

/** Remove one entry (Confirm, destructive: there is no undo). */
export function RemoveEntryModal({
	missionId,
	entry,
	open,
	onOpenChange,
}: {
	missionId: string;
	entry: RosterEntry | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const remove = useRemoveRosterEntry(missionId);
	if (entry === null) return null;
	return (
		<RemoveEntryConfirm
			entry={entry}
			open={open}
			onOpenChange={(next) => {
				if (!next) remove.reset();
				onOpenChange(next);
			}}
			pending={remove.isPending}
			error={remove.error}
			onRemove={async () => {
				try {
					await remove.mutateAsync(entry.id);
					toast.success(`Removed ${entryName(entry)}.`);
					onOpenChange(false);
				} catch {
					// The refusal is on remove.error, shown in the modal.
				}
			}}
		/>
	);
}

function RemoveEntryConfirm({
	entry,
	open = true,
	onOpenChange = () => {},
	pending,
	error,
	onRemove,
}: {
	entry: RosterEntry;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	pending: boolean;
	error: ApiError | null;
	onRemove: () => void;
}) {
	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="confirm"
			title="Remove agent"
			description={`${entryName(entry)} leaves this mission's roster, with its instructions and budget. The agent stays in All agents.`}
			dirty={false}
			destructive
			submitLabel="Remove agent"
			pendingLabel="Removing"
			onSubmit={onRemove}
			pending={pending}
			error={error}
			changes={
				<WhatChanges
					data-testid="loadout-remove-changes"
					changes={[
						{
							label: `Agent · ${entryName(entry)}`,
							kind: "remove",
							from: entry.waves.join(" · "),
							mono: true,
						},
					]}
				/>
			}
			data-testid="loadout-remove"
		/>
	);
}

/**
 * Save the roster as a new preset (Form): a name, a description and the
 * cut, defaulting to the mission's. The squad is the active entries as they
 * stand; idle ones are named and left out.
 */
export function SaveRosterPresetModal({
	roster,
	cut,
	open,
	onOpenChange,
}: {
	roster: readonly RosterEntry[];
	cut: PresetCut;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const create = useCreatePreset();
	const generation = useOpenGeneration(open);
	return (
		<SaveRosterPresetForm
			key={generation}
			roster={roster}
			cut={cut}
			open={open}
			onOpenChange={(next) => {
				if (!next) create.reset();
				onOpenChange(next);
			}}
			pending={create.isPending}
			error={create.error}
			onSave={async (fields) => {
				try {
					const saved = await create.mutateAsync(
						presetBodyFromRoster(roster, fields),
					);
					toast.success(`Saved ${saved.name} as a team.`);
					onOpenChange(false);
				} catch {
					// The refusal is on create.error, shown in the modal.
				}
			}}
		/>
	);
}

export function SaveRosterPresetForm({
	roster,
	cut: missionCut,
	open = true,
	onOpenChange = () => {},
	pending,
	error,
	onSave,
}: {
	roster: readonly RosterEntry[];
	cut: PresetCut;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	pending: boolean;
	error: ApiError | null;
	onSave: (fields: {
		name: string;
		description: string;
		cut: PresetCut;
	}) => void;
}) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [cut, setCut] = useState<PresetCut>(missionCut);
	const cutId = useId();
	const active = roster.filter((e) => e.active);
	const idle = roster.filter((e) => !e.active);
	const reason =
		active.length === 0
			? "No agent is active: a team needs at least one to save."
			: name.trim() === ""
				? "Give the team a name."
				: undefined;
	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="form"
			title="Save as team"
			description="A copy of this squad, to apply to other draft missions. The mission keeps its roster."
			dirty={name !== "" || description !== ""}
			submitLabel={`Save ${active.length} ${active.length === 1 ? "agent" : "agents"} as a team`}
			submitDisabledReason={reason}
			onSubmit={() => onSave({ name, description, cut })}
			pending={pending}
			error={error}
			// The squad itself is not a field here: its issues go to the row.
			fieldOf={(path) =>
				path[0] === "name" || path[0] === "description"
					? (path[0] as string)
					: null
			}
			describeIssue={presetIssueCopy}
			changes={
				<WhatChanges
					data-testid="loadout-save-preset-changes"
					changes={active.map((e) => ({
						label: `Agent · ${entryName(e)}`,
						kind: "add" as const,
						to: e.waves.join(" · "),
						mono: true,
					}))}
				/>
			}
			data-testid="loadout-save-preset"
		>
			<ModalField name="name" label="Name" testid="loadout-save-preset-name">
				{(props) => (
					<Input
						{...props}
						maxLength={200}
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				)}
			</ModalField>
			<ModalField
				name="description"
				label="Description"
				hint="Optional"
				testid="loadout-save-preset-description"
			>
				{(props) => (
					<Textarea
						{...props}
						rows={2}
						maxLength={500}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				)}
			</ModalField>
			<fieldset className="flex flex-col gap-1.5">
				<legend className="type-small font-medium text-foreground">Cut</legend>
				<RadioGroup
					value={cut}
					onValueChange={(next) => setCut(next as PresetCut)}
					className="flex gap-4"
				>
					{(Object.keys(CUT_LABEL) as PresetCut[]).map((c) => (
						<label
							key={c}
							htmlFor={`${cutId}-${c}`}
							className="type-small flex items-center gap-2 text-foreground"
						>
							<RadioGroupItem
								id={`${cutId}-${c}`}
								value={c}
								data-testid={`loadout-save-preset-cut-${c}`}
							/>
							{CUT_LABEL[c]}
						</label>
					))}
				</RadioGroup>
			</fieldset>
			{idle.length > 0 ? (
				<p
					data-testid="loadout-save-preset-idle"
					className="type-small text-text-muted"
				>
					{`Left out, being idle: ${idle.map(entryName).join(", ")}. Applying a team makes every agent active.`}
				</p>
			) : null}
		</ActionModal>
	);
}
