import { type AgentTemplate, type Preset, WAVES } from "avel-server/contract";
import { Plus, Trash2 } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api";
import {
	type AgentDraft,
	agentDraftOf,
	CUT_LABEL,
	changedPresetFields,
	createBodyOf,
	isRosterable,
	keyOf,
	nextVersion,
	type PresetCut,
	type PresetDraft,
	presetDiff,
	presetDraftOf,
	presetIssueCopy,
	presetProblems,
	shortId,
	useCreatePreset,
	useUpdatePreset,
} from "@/lib/api/presets";
import { ActionModal, ModalField, useFieldIssues } from "./action-modal";
import { agentName, fieldText } from "./preset-compare";
import { type Names, useAllTemplates, useTemplateNames } from "./preset-detail";
import { useOpenGeneration } from "./use-open-generation";
import { type Change, fieldChanges, WhatChanges } from "./what-changes";

/**
 * New preset and edit preset, in a Form modal (ruling 35). Every rule the
 * form checks is the contract's own createPresetBody, so it refuses what the
 * server would. Editing says which version the save makes: every update
 * adds 1.
 */
export function PresetFormModal({
	open,
	onOpenChange,
	preset,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Present when editing; absent when creating. */
	preset?: Preset;
	/** The saved preset, for the caller's landed highlight or selection. */
	onSaved?: (preset: Preset) => void;
}) {
	const create = useCreatePreset();
	const update = useUpdatePreset();
	const mutation = preset ? update : create;
	// Each opening starts from the preset's current values.
	const generation = useOpenGeneration(open);

	const submit = (draft: PresetDraft) => {
		if (preset) {
			const patch = changedPresetFields(preset, draft);
			if (patch === null) return;
			update.mutate(
				{ id: preset.id, patch },
				{
					onSuccess: (saved) => {
						toast.success(`Saved ${saved.name} as v${saved.version}.`);
						onOpenChange(false);
						onSaved?.(saved);
					},
				},
			);
		} else {
			create.mutate(createBodyOf(draft), {
				onSuccess: (saved) => {
					toast.success(`Added ${saved.name}.`);
					onOpenChange(false);
					onSaved?.(saved);
				},
			});
		}
	};

	return (
		<PresetForm
			key={`${preset?.id ?? "new"}:${generation}`}
			open={open}
			onOpenChange={(next) => {
				if (!next) mutation.reset();
				onOpenChange(next);
			}}
			preset={preset}
			pending={mutation.isPending}
			error={mutation.error}
			onSubmit={submit}
		/>
	);
}

/**
 * What saving does, for the WhatChanges strip: the preset's own fields, the
 * agents added, removed or set differently, and on an edit the version it
 * makes. Computed from the form against the loaded preset only.
 */
export function presetChanges(
	preset: Preset | undefined,
	draft: PresetDraft,
	names: Names,
): Change[] {
	const body = createBodyOf(draft);
	const shown = (p: {
		name: string;
		description: string | null;
		cut: PresetCut;
	}) => ({
		name: p.name,
		description: p.description ?? "",
		cut: CUT_LABEL[p.cut],
	});
	const changes = fieldChanges(
		preset ? shown(preset) : undefined,
		shown({ ...body, description: body.description ?? null }),
		[
			{ key: "name", label: "Name" },
			{ key: "description", label: "Description" },
			{ key: "cut", label: "Cut" },
		],
	);
	const agents = body.agents.map((a) => ({
		agentTemplateId: a.agentTemplateId,
		waves: a.waves,
		territory: a.territory,
		writablePaths: a.writablePaths,
		estimatedTokens: a.estimatedTokens,
	}));
	const diff = presetDiff(
		{ cut: preset?.cut ?? body.cut, agents: preset?.agents ?? [] },
		{ cut: body.cut, agents },
	);
	for (const agent of diff.onlyB) {
		if (agent.agentTemplateId === "") continue;
		changes.push({
			label: `Agent · ${agentName(agent, names)}`,
			kind: "add",
			to: fieldText(agent, "waves"),
			mono: true,
		});
	}
	for (const agent of diff.onlyA) {
		changes.push({
			label: `Agent · ${agentName(agent, names)}`,
			kind: "remove",
			from: fieldText(agent, "waves"),
			mono: true,
		});
	}
	for (const { a, b, fields } of diff.changed) {
		changes.push({
			label: `Agent · ${agentName(a, names)}`,
			kind: "change",
			from: fields.map((f) => fieldText(a, f)).join("; "),
			to: fields.map((f) => fieldText(b, f)).join("; "),
			mono: true,
		});
	}
	if (preset && changes.length > 0) {
		changes.push({
			label: "Version",
			kind: "change",
			from: `v${preset.version}`,
			to: `v${nextVersion(preset)}`,
			mono: true,
		});
	}
	return changes;
}

/** An agent row with a key of its own: the form adds and removes rows. */
type Row = { uid: number; draft: AgentDraft };

/**
 * The form in its modal. It holds the draft and reports a submit; the caller
 * owns the request. Problems show once a submit was tried, then follow every
 * change. Edit mode sends only what changed, so Save holds, saying why,
 * until something did.
 */
export function PresetForm({
	open = true,
	onOpenChange = () => {},
	preset,
	pending,
	error,
	onSubmit,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	preset?: Preset;
	pending: boolean;
	error: ApiError | null;
	onSubmit: (draft: PresetDraft) => void;
}) {
	const initial = presetDraftOf(preset);
	const nextUid = useRef(initial.agents.length);
	const names = useTemplateNames();
	const [fields, setFields] = useState(() => ({
		name: initial.name,
		description: initial.description,
		cut: initial.cut,
	}));
	const [rows, setRows] = useState<Row[]>(() =>
		initial.agents.map((draft, uid) => ({ uid, draft })),
	);
	const [tried, setTried] = useState(false);

	const draft: PresetDraft = { ...fields, agents: rows.map((r) => r.draft) };
	const problems = tried ? presetProblems(draft) : {};
	const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
	const unchanged =
		preset !== undefined && changedPresetFields(preset, draft) === null;

	const setRow = (uid: number, change: Partial<AgentDraft>) =>
		setRows((current) =>
			current.map((row) =>
				row.uid === uid ? { uid, draft: { ...row.draft, ...change } } : row,
			),
		);
	const addRow = () => {
		const uid = nextUid.current++;
		setRows((current) => [...current, { uid, draft: agentDraftOf() }]);
	};
	const removeRow = (uid: number) =>
		setRows((current) => current.filter((row) => row.uid !== uid));

	const submit = () => {
		setTried(true);
		if (Object.keys(presetProblems(draft)).length > 0) return;
		onSubmit(draft);
	};

	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="form"
			title={preset ? "Edit team" : "New team"}
			description={
				preset
					? `${preset.name}, v${preset.version}. Missions that already applied it keep their copy.`
					: "Save a squad once. Applying it copies these agents into a mission's roster."
			}
			dirty={dirty}
			submitLabel={preset ? `Save as v${nextVersion(preset)}` : "Add team"}
			onSubmit={submit}
			pending={pending}
			submitDisabledReason={unchanged ? "Nothing has changed yet." : undefined}
			error={error}
			fieldOf={keyOf}
			describeIssue={presetIssueCopy}
			changes={
				<WhatChanges
					data-testid="preset-form-changes"
					changes={presetChanges(preset, draft, names)}
				/>
			}
			data-testid="preset-form"
		>
			<ModalField
				name="name"
				label="Name"
				error={problems.name}
				testid="preset-form-name"
			>
				{(props) => (
					<Input
						{...props}
						required
						maxLength={200}
						autoFocus
						value={fields.name}
						onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
					/>
				)}
			</ModalField>
			<ModalField
				name="description"
				label="Description"
				hint="Optional"
				error={problems.description}
				testid="preset-form-description"
			>
				{(props) => (
					<Textarea
						{...props}
						rows={2}
						maxLength={500}
						value={fields.description}
						onChange={(e) =>
							setFields((f) => ({ ...f, description: e.target.value }))
						}
					/>
				)}
			</ModalField>
			<CutField
				value={fields.cut}
				onChange={(cut) => setFields((f) => ({ ...f, cut }))}
			/>

			<AgentRows
				rows={rows}
				problems={problems}
				onChange={setRow}
				onRemove={removeRow}
			/>
			<Button
				type="button"
				variant="outline"
				size="sm"
				data-testid="preset-form-add-agent"
				onClick={addRow}
				className="self-start"
			>
				<Plus aria-hidden="true" />
				Add agent
			</Button>
		</ActionModal>
	);
}

function CutField({
	value,
	onChange,
}: {
	value: PresetCut;
	onChange: (cut: PresetCut) => void;
}) {
	const id = useId();
	return (
		<fieldset className="flex flex-col gap-1.5">
			<legend className="type-small font-medium text-foreground">Cut</legend>
			<RadioGroup
				data-testid="preset-form-cut"
				value={value}
				onValueChange={(next) => onChange(next as PresetCut)}
				className="flex gap-4"
			>
				{(Object.keys(CUT_LABEL) as PresetCut[]).map((cut) => (
					<label
						key={cut}
						htmlFor={`${id}-${cut}`}
						className="type-small flex items-center gap-2 text-foreground"
					>
						<RadioGroupItem
							id={`${id}-${cut}`}
							value={cut}
							data-testid={`preset-form-cut-${cut}`}
						/>
						{CUT_LABEL[cut]}
					</label>
				))}
			</RadioGroup>
		</fieldset>
	);
}

/**
 * The squad, one block per agent. The template list is the catalog's, less
 * the Firm templates no roster accepts. A saved template the catalog no
 * longer offers stays chosen, named by its short id.
 */
function AgentRows({
	rows,
	problems,
	onChange,
	onRemove,
}: {
	rows: Row[];
	problems: Record<string, string>;
	onChange: (uid: number, change: Partial<AgentDraft>) => void;
	onRemove: (uid: number) => void;
}) {
	const templates = useAllTemplates();
	const choices = useMemo(
		() =>
			templates.status === "success" ? templates.list.filter(isRosterable) : [],
		[templates],
	);

	if (rows.length === 0) {
		return (
			<p
				data-testid="preset-form-no-agents"
				className="type-small text-text-muted"
			>
				No agents yet. A team with none applies nothing.
			</p>
		);
	}
	return (
		<ol data-testid="preset-form-agents" className="flex flex-col gap-3">
			{rows.map((row, i) => {
				const at = (field: string) => `agents.${i}.${field}`;
				return (
					<li
						key={row.uid}
						data-testid={`preset-form-agent-${i}`}
						className="flex flex-col gap-3 rounded-md border border-border p-3"
					>
						<div className="flex items-center justify-between gap-2">
							<span className="type-panel-title text-foreground">
								{`Agent ${i + 1}`}
							</span>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								aria-label={`Remove agent ${i + 1}`}
								data-testid={`preset-form-remove-${i}`}
								onClick={() => onRemove(row.uid)}
							>
								<Trash2 aria-hidden="true" />
							</Button>
						</div>
						<TemplateField
							name={at("agentTemplateId")}
							value={row.draft.agentTemplateId}
							choices={choices}
							loading={templates.status === "pending"}
							error={problems[at("agentTemplateId")]}
							testid={`preset-form-template-${i}`}
							onChange={(agentTemplateId) =>
								onChange(row.uid, { agentTemplateId })
							}
						/>
						<WavesField
							name={at("waves")}
							value={row.draft.waves}
							error={problems[at("waves")]}
							testid={`preset-form-waves-${i}`}
							onChange={(waves) => onChange(row.uid, { waves })}
						/>
						<ModalField
							name={at("territory")}
							label="Territory"
							hint="Optional"
							error={problems[at("territory")]}
							testid={`preset-form-territory-${i}`}
						>
							{(props) => (
								<Input
									{...props}
									maxLength={200}
									placeholder="Whole project"
									value={row.draft.territory}
									onChange={(e) =>
										onChange(row.uid, { territory: e.target.value })
									}
								/>
							)}
						</ModalField>
						<ModalField
							name={at("writablePaths")}
							label="Writable paths"
							hint="One per line. Empty keeps the agent's."
							error={problems[at("writablePaths")]}
							testid={`preset-form-paths-${i}`}
						>
							{(props) => (
								<Textarea
									{...props}
									rows={2}
									className="type-mono-small"
									value={row.draft.writablePaths}
									onChange={(e) =>
										onChange(row.uid, { writablePaths: e.target.value })
									}
								/>
							)}
						</ModalField>
						<ModalField
							name={at("estimatedTokens")}
							label="Estimated tokens"
							hint="Optional. A default; every mission estimates again."
							error={problems[at("estimatedTokens")]}
							testid={`preset-form-tokens-${i}`}
						>
							{(props) => (
								<Input
									{...props}
									inputMode="numeric"
									className="tabular-nums"
									value={row.draft.estimatedTokens}
									onChange={(e) =>
										onChange(row.uid, { estimatedTokens: e.target.value })
									}
								/>
							)}
						</ModalField>
					</li>
				);
			})}
		</ol>
	);
}

function TemplateField({
	name,
	value,
	choices,
	loading,
	error,
	testid,
	onChange,
}: {
	name: string;
	value: string;
	choices: AgentTemplate[];
	loading: boolean;
	error: string | undefined;
	testid: string;
	onChange: (id: string) => void;
}) {
	const offered = choices.some((t) => t.id === value);
	return (
		<ModalField name={name} label="Template" error={error} testid={testid}>
			{({ id, ...props }) => (
				<Select
					value={value === "" ? undefined : value}
					onValueChange={onChange}
				>
					<SelectTrigger id={id} {...props} className="w-full">
						<SelectValue
							placeholder={loading ? "Loading agents" : "Choose an agent"}
						/>
					</SelectTrigger>
					<SelectContent>
						{value !== "" && !offered ? (
							<SelectItem value={value}>
								{`Unknown agent · ${shortId(value)}`}
							</SelectItem>
						) : null}
						{choices.map((t) => (
							<SelectItem key={t.id} value={t.id}>
								{t.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
		</ModalField>
	);
}

/** A to E, any number pressed; at least one is required. */
function WavesField({
	name,
	value,
	error,
	testid,
	onChange,
}: {
	name: string;
	value: AgentDraft["waves"];
	error: string | undefined;
	testid: string;
	onChange: (waves: AgentDraft["waves"]) => void;
}) {
	const errorId = useId();
	// A custom control: the refusal's messages for it come from the modal.
	const messages = [
		...new Set([...(error ? [error] : []), ...useFieldIssues(name)]),
	];
	return (
		<fieldset
			data-testid={testid}
			data-field={name}
			aria-describedby={messages.length > 0 ? errorId : undefined}
			className="flex flex-col gap-1.5"
		>
			<legend className="type-small font-medium text-foreground">Waves</legend>
			<div className="flex gap-1">
				{WAVES.map((wave) => {
					const on = value.includes(wave);
					return (
						<Button
							key={wave}
							type="button"
							variant="outline"
							size="sm"
							aria-pressed={on}
							data-testid={`${testid}-${wave}`}
							onClick={() =>
								onChange(
									on
										? value.filter((w) => w !== wave)
										: WAVES.filter((w) => w === wave || value.includes(w)),
								)
							}
							className="type-mono-small aria-pressed:bg-state-selected"
						>
							{wave}
						</Button>
					);
				})}
			</div>
			{messages.length > 0 ? (
				<p
					id={errorId}
					data-testid={`${testid}-error`}
					className="type-small text-gate-block"
				>
					{messages.join(" ")}
				</p>
			) : null}
		</fieldset>
	);
}
