import { type AgentTemplate, type Preset, WAVES } from "avel-server/contract";
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useId, useMemo, useRef, useState } from "react";
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
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api";
import { loadedRows, useAgentTemplates } from "@/lib/api/catalog";
import {
	type AgentDraft,
	agentDraftOf,
	CUT_LABEL,
	changedPresetFields,
	createBodyOf,
	isRosterable,
	nextVersion,
	type PresetCut,
	type PresetDraft,
	presetDraftOf,
	presetFieldErrors,
	presetProblems,
	shortId,
	useCreatePreset,
	useUpdatePreset,
} from "@/lib/api/presets";
import { Field, FormError } from "./client-form";

/**
 * New preset and edit preset, in a sheet. Every rule the form checks is the
 * contract's own createPresetBody, so it refuses what the server would.
 * Editing says which version the save makes, since every update adds 1.
 */
export function PresetFormSheet({
	open,
	onOpenChange,
	preset,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Present when editing; absent when creating. */
	preset?: Preset;
	/** Selects the new preset, so it opens where it was made. */
	onCreated?: (preset: Preset) => void;
}) {
	const create = useCreatePreset();
	const update = useUpdatePreset();
	const mutation = preset ? update : create;

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
					},
				},
			);
		} else {
			create.mutate(createBodyOf(draft), {
				onSuccess: (saved) => {
					toast.success(`Added ${saved.name}.`);
					onOpenChange(false);
					onCreated?.(saved);
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
			<SheetContent
				side="right"
				data-testid="preset-form-sheet"
				className="sm:max-w-xl"
			>
				<SheetHeader>
					<SheetTitle>
						{preset ? `Edit ${preset.name}` : "New preset"}
					</SheetTitle>
					<SheetDescription>
						{preset
							? "Change the squad. Missions that already applied it keep their copy."
							: "Save a squad once. Applying it copies these agents into a mission's roster."}
					</SheetDescription>
				</SheetHeader>
				{/* Keyed by the preset and its version, so reopening starts from what is saved. */}
				<PresetForm
					key={preset ? `${preset.id}@${preset.version}` : "new"}
					preset={preset}
					pending={mutation.isPending}
					error={mutation.error}
					onSubmit={submit}
				/>
			</SheetContent>
		</Sheet>
	);
}

/** An agent row with a key of its own: the form adds and removes rows. */
type Row = { uid: number; draft: AgentDraft };

/**
 * The form itself. Presentational: it holds the draft and reports a submit;
 * the sheet owns the request. Problems show once a submit was tried, then
 * follow every change. Edit mode sends only what changed, so Save is
 * disabled until something did.
 */
export function PresetForm({
	preset,
	pending,
	error,
	onSubmit,
}: {
	preset?: Preset;
	pending: boolean;
	error: ApiError | null;
	onSubmit: (draft: PresetDraft) => void;
}) {
	const initial = presetDraftOf(preset);
	const nextUid = useRef(initial.agents.length);
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
	const serverErrors = presetFieldErrors(error);
	const errors = { ...serverErrors, ...problems };
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

	const submit = (event: FormEvent) => {
		event.preventDefault();
		setTried(true);
		if (Object.keys(presetProblems(draft)).length > 0) return;
		onSubmit(draft);
	};

	return (
		<form
			data-testid="preset-form"
			noValidate
			onSubmit={submit}
			className="app-scroll flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
		>
			<Field label="Name" error={errors.name} testid="preset-form-name">
				{(props) => (
					<Input
						{...props}
						required
						maxLength={200}
						value={fields.name}
						onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
					/>
				)}
			</Field>
			<Field
				label="Description"
				hint="Optional"
				error={errors.description}
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
			</Field>
			<CutField
				value={fields.cut}
				onChange={(cut) => setFields((f) => ({ ...f, cut }))}
			/>

			<AgentRows
				rows={rows}
				errors={errors}
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

			<FormError
				error={error}
				hasFieldErrors={Object.keys(serverErrors).length > 0}
			/>
			<div className="mt-auto flex items-center justify-end gap-3">
				{preset ? (
					<p
						data-testid="preset-form-version"
						className="type-caption text-text-subtle tabular-nums"
					>
						{`v${preset.version} → v${nextVersion(preset)}`}
					</p>
				) : null}
				<Button
					type="submit"
					data-testid="preset-form-submit"
					disabled={pending}
					disabledReason={unchanged ? "Nothing has changed yet." : undefined}
				>
					{pending
						? "Saving"
						: preset
							? `Save as v${nextVersion(preset)}`
							: "Add preset"}
				</Button>
			</div>
		</form>
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
	errors,
	onChange,
	onRemove,
}: {
	rows: Row[];
	errors: Record<string, string>;
	onChange: (uid: number, change: Partial<AgentDraft>) => void;
	onRemove: (uid: number) => void;
}) {
	const templates = useAgentTemplates();
	const choices = useMemo(
		() =>
			(templates.data ? loadedRows(templates.data) : []).filter(isRosterable),
		[templates.data],
	);

	if (rows.length === 0) {
		return (
			<p
				data-testid="preset-form-no-agents"
				className="type-small text-text-muted"
			>
				No agents yet. A preset with none applies nothing.
			</p>
		);
	}
	return (
		<ol data-testid="preset-form-agents" className="flex flex-col gap-3">
			{rows.map((row, i) => (
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
						value={row.draft.agentTemplateId}
						choices={choices}
						loading={templates.status === "pending"}
						error={errors[`agents.${i}.agentTemplateId`]}
						testid={`preset-form-template-${i}`}
						onChange={(agentTemplateId) =>
							onChange(row.uid, { agentTemplateId })
						}
					/>
					<WavesField
						value={row.draft.waves}
						error={errors[`agents.${i}.waves`]}
						testid={`preset-form-waves-${i}`}
						onChange={(waves) => onChange(row.uid, { waves })}
					/>
					<Field
						label="Territory"
						hint="Optional"
						error={errors[`agents.${i}.territory`]}
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
					</Field>
					<Field
						label="Writable paths"
						hint="One per line. Empty keeps the template's."
						error={errors[`agents.${i}.writablePaths`]}
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
					</Field>
					<Field
						label="Estimated tokens"
						hint="Optional. A default; every mission estimates again."
						error={errors[`agents.${i}.estimatedTokens`]}
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
					</Field>
				</li>
			))}
		</ol>
	);
}

function TemplateField({
	value,
	choices,
	loading,
	error,
	testid,
	onChange,
}: {
	value: string;
	choices: AgentTemplate[];
	loading: boolean;
	error: string | undefined;
	testid: string;
	onChange: (id: string) => void;
}) {
	const offered = choices.some((t) => t.id === value);
	return (
		<Field label="Template" error={error} testid={testid}>
			{({ id, ...props }) => (
				<Select
					value={value === "" ? undefined : value}
					onValueChange={onChange}
				>
					<SelectTrigger id={id} {...props} className="w-full">
						<SelectValue
							placeholder={loading ? "Loading templates" : "Choose a template"}
						/>
					</SelectTrigger>
					<SelectContent>
						{value !== "" && !offered ? (
							<SelectItem value={value}>
								{`Unknown template · ${shortId(value)}`}
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
		</Field>
	);
}

/** A to E, any number pressed; at least one is required. */
function WavesField({
	value,
	error,
	testid,
	onChange,
}: {
	value: AgentDraft["waves"];
	error: string | undefined;
	testid: string;
	onChange: (waves: AgentDraft["waves"]) => void;
}) {
	const errorId = useId();
	return (
		<fieldset
			data-testid={testid}
			aria-describedby={error ? errorId : undefined}
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
			{error ? (
				<p
					id={errorId}
					data-testid={`${testid}-error`}
					className="type-small text-gate-block"
				>
					{error}
				</p>
			) : null}
		</fieldset>
	);
}
