import {
	type Brief,
	type CreateDispatchBody,
	DEFAULT_WALL_CLOCK_MINUTES,
	MAX_WALL_CLOCK_MINUTES,
	type MissionDetail,
	type RosterEntry,
} from "avel-server/contract";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	attemptFor,
	type DispatchAttempt,
	useCreateDispatch,
} from "@/lib/api/dispatches";
import type { ApiError } from "@/lib/api/errors";
import { useMissionPlan } from "@/lib/api/mission-plans";
import { entryName, useRoster } from "@/lib/api/roster";
import { useIsPreview } from "@/shell/auth-gate";
import {
	ActionModal,
	type FieldIssue,
	type IssuePath,
	ModalField,
} from "./action-modal";
import { useOpenGeneration } from "./use-open-generation";

/*
 * Queueing a dispatch (module 6): one active roster entry, on one module of
 * the plan and the requirements chosen from it, with its token estimate and
 * ceilings (prefilled from the roster entry) and a wall-clock limit.
 */

/** The form as typed: numbers stay text until they are sent. */
export type DispatchDraft = {
	rosterEntryId: string;
	moduleId: string;
	requirementIds: string[];
	estimatedTokens: string;
	tokenSoftCeiling: string;
	tokenHardCeiling: string;
	wallClockMinutes: string;
};

export type DispatchField = keyof DispatchDraft;

type Module = Brief["modules"][number];

const text = (n: number | null | undefined) =>
	n === null || n === undefined ? "" : String(n);

/** The token fields from a roster entry: its estimate and ceilings, or blank. */
export function tokensFrom(
	entry: RosterEntry | undefined,
): Pick<
	DispatchDraft,
	"estimatedTokens" | "tokenSoftCeiling" | "tokenHardCeiling"
> {
	return {
		estimatedTokens: text(entry?.estimatedTokens),
		tokenSoftCeiling: text(entry?.tokenSoftCeiling),
		tokenHardCeiling: text(entry?.tokenHardCeiling),
	};
}

/** A fresh form: the first active agent and the first module, all its requirements. */
export function initialDraft(
	entries: readonly RosterEntry[],
	modules: readonly Module[],
): DispatchDraft {
	const entry = entries[0];
	const module = modules[0];
	return {
		rosterEntryId: entry?.id ?? "",
		moduleId: module?.id ?? "",
		requirementIds: module ? [...module.requirementIds] : [],
		...tokensFrom(entry),
		wallClockMinutes: String(DEFAULT_WALL_CLOCK_MINUTES),
	};
}

const WHOLE = /^\d+$/;

/** A positive whole number, or null when blank (the server's default). */
function count(value: string): number | null | "bad" {
	const v = value.trim();
	if (v === "") return null;
	if (!WHOLE.test(v)) return "bad";
	const n = Number(v);
	return n > 0 && Number.isSafeInteger(n) ? n : "bad";
}

const NUMBER_FIELDS = [
	"estimatedTokens",
	"tokenSoftCeiling",
	"tokenHardCeiling",
	"wallClockMinutes",
] as const;

/** What stops the form being sent, per field, checked before sending. */
export function draftProblems(
	draft: DispatchDraft,
): Partial<Record<DispatchField, string>> {
	const problems: Partial<Record<DispatchField, string>> = {};
	if (draft.rosterEntryId === "")
		problems.rosterEntryId = "Choose an agent on the roster.";
	if (draft.moduleId === "") problems.moduleId = "Choose a module of the plan.";
	else if (draft.requirementIds.length === 0)
		problems.requirementIds = "Choose at least one requirement.";
	for (const field of NUMBER_FIELDS) {
		if (count(draft[field]) === "bad")
			problems[field] = "Enter a whole number above zero.";
	}
	const minutes = count(draft.wallClockMinutes);
	if (typeof minutes === "number" && minutes > MAX_WALL_CLOCK_MINUTES)
		problems.wallClockMinutes = `At most ${MAX_WALL_CLOCK_MINUTES} minutes.`;
	const soft = count(draft.tokenSoftCeiling);
	const hard = count(draft.tokenHardCeiling);
	if (typeof soft === "number" && typeof hard === "number" && soft > hard)
		problems.tokenSoftCeiling = "The soft limit can't be above the hard limit.";
	return problems;
}

/** The request body: blank numbers left out, so the server's defaults apply. */
export function bodyOf(draft: DispatchDraft): CreateDispatchBody {
	const body: CreateDispatchBody = {
		rosterEntryId: draft.rosterEntryId,
		briefRef: {
			moduleId: draft.moduleId,
			requirementIds: [...draft.requirementIds],
		},
	};
	for (const field of NUMBER_FIELDS) {
		const n = count(draft[field]);
		if (typeof n === "number") body[field] = n;
	}
	return body;
}

/** A refused body's issue path, as the field it belongs on. */
export function dispatchFieldOf(path: IssuePath): DispatchField | null {
	const [head, sub] = path;
	if (head === "rosterEntryId") return "rosterEntryId";
	if (head === "briefRef")
		return sub === "requirementIds" ? "requirementIds" : "moduleId";
	if (
		head === "estimatedTokens" ||
		head === "tokenSoftCeiling" ||
		head === "tokenHardCeiling" ||
		head === "wallClockMinutes"
	)
		return head;
	return null;
}

/** Our words for a refused field; the server's message is for logs. */
export function describeDispatchIssue(issue: FieldIssue): string {
	switch (dispatchFieldOf(issue.path)) {
		case "rosterEntryId":
			return "Choose an agent on the roster.";
		case "moduleId":
			return "Choose a module of the plan.";
		case "requirementIds":
			return "Choose requirements of that module.";
		case "wallClockMinutes":
			return `A whole number of minutes, up to ${MAX_WALL_CLOCK_MINUTES}.`;
		case "estimatedTokens":
		case "tokenSoftCeiling":
		case "tokenHardCeiling":
			return "Enter a whole number above zero.";
		default:
			return "Something in the form wasn't accepted. Check each field.";
	}
}

/**
 * A 422 that names roster entries, with each agent named: the line under
 * the agent field, so the refusal says who it was about. Null otherwise.
 */
export function refusedAgentsLine(
	error: ApiError | null,
	roster: readonly RosterEntry[] | undefined,
): string | null {
	const failure = error?.failure;
	if (failure?.kind !== "contract" || failure.code !== "PRECONDITION_FAILED")
		return null;
	const ids = failure.details.rosterEntryIds ?? [];
	if (ids.length === 0) return null;
	const names = ids.map((id) => {
		const entry = roster?.find((e) => e.id === id);
		return entry ? entryName(entry) : "an agent no longer on the roster";
	});
	const who = names.join(", ");
	switch (failure.details.reason) {
		case "roster_entry_inactive":
			return `${who}: not active on the roster.`;
		case "agent_identity_missing":
			return `${who}: no generated identity yet.`;
		case "estimate_missing":
			return `${who}: no token estimate.`;
		case "roster_entry_not_found":
			return `${who}: not on this mission's roster.`;
		default:
			return `About ${who}.`;
	}
}

// ---------------------------------------------------------------------------

const intProps = { inputMode: "numeric" as const, autoComplete: "off" };

/** The form itself, given its roster and modules: rendered alone in tests. */
export function NewDispatchForm({
	open = true,
	onOpenChange = () => {},
	entries,
	roster,
	brief,
	initial,
	pending,
	error,
	onSubmit,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	/** Active roster entries: the agents that can be dispatched. */
	entries: readonly RosterEntry[];
	/** The whole roster, to name agents a refusal points at. */
	roster?: readonly RosterEntry[];
	brief: Brief | null;
	initial?: DispatchDraft;
	pending: boolean;
	error: ApiError | null;
	onSubmit: (body: CreateDispatchBody) => void;
}) {
	const modules = brief?.modules ?? [];
	const [draft, setDraft] = useState<DispatchDraft>(
		() => initial ?? initialDraft(entries, modules),
	);
	const [tried, setTried] = useState(false);
	const problems = draftProblems(draft);
	const shown = tried ? problems : {};
	const module = modules.find((m) => m.id === draft.moduleId);
	const requirementText = new Map(
		(brief?.requirements ?? []).map((r) => [r.id, r.text]),
	);

	const set = (patch: Partial<DispatchDraft>) =>
		setDraft((d) => ({ ...d, ...patch }));
	const chooseEntry = (id: string) =>
		set({
			rosterEntryId: id,
			...tokensFrom(entries.find((e) => e.id === id)),
		});
	const chooseModule = (id: string) =>
		set({
			moduleId: id,
			requirementIds: [
				...(modules.find((m) => m.id === id)?.requirementIds ?? []),
			],
		});
	const toggleRequirement = (id: string, on: boolean) =>
		set({
			requirementIds: on
				? (module?.requirementIds ?? []).filter(
						(r) => r === id || draft.requirementIds.includes(r),
					)
				: draft.requirementIds.filter((r) => r !== id),
		});

	const submit = () => {
		setTried(true);
		if (Object.keys(problems).length === 0) onSubmit(bodyOf(draft));
	};

	const blocked =
		entries.length === 0
			? "No active agent on the roster to dispatch"
			: modules.length === 0
				? "The plan has no modules to dispatch on"
				: undefined;
	const agentsLine = refusedAgentsLine(error, roster ?? entries);

	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="form"
			title="New dispatch"
			description="Queue one agent on one module of the plan. It starts when a room is free."
			dirty={tried}
			submitLabel="Queue the dispatch"
			pendingLabel="Queueing"
			onSubmit={submit}
			pending={pending}
			submitDisabledReason={blocked}
			error={error}
			fieldOf={dispatchFieldOf}
			describeIssue={describeDispatchIssue}
			data-testid="dispatch-new-modal"
		>
			<ModalField
				name="rosterEntryId"
				label="Agent"
				error={shown.rosterEntryId ?? agentsLine ?? undefined}
				testid="dispatch-new-agent"
			>
				{(props) => (
					<Select
						value={draft.rosterEntryId}
						onValueChange={chooseEntry}
						disabled={entries.length === 0}
					>
						<SelectTrigger {...props} className="w-full">
							<SelectValue placeholder="No active agent" />
						</SelectTrigger>
						<SelectContent>
							{entries.map((e) => (
								<SelectItem key={e.id} value={e.id}>
									{entryName(e)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</ModalField>

			<ModalField
				name="moduleId"
				label="Module"
				error={shown.moduleId}
				testid="dispatch-new-module"
			>
				{(props) => (
					<Select
						value={draft.moduleId}
						onValueChange={chooseModule}
						disabled={modules.length === 0}
					>
						<SelectTrigger {...props} className="w-full">
							<SelectValue placeholder="The plan has no modules" />
						</SelectTrigger>
						<SelectContent>
							{modules.map((m) => (
								<SelectItem key={m.id} value={m.id}>
									<span className="type-mono-small">{m.id}</span> {m.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</ModalField>

			{module ? (
				<ModalField
					name="requirementIds"
					label="Requirements"
					hint="From the module"
					error={shown.requirementIds}
					testid="dispatch-new-requirements"
				>
					{(props) => (
						<fieldset
							data-testid={props["data-testid"]}
							aria-invalid={props["aria-invalid"]}
							aria-describedby={props["aria-describedby"]}
							className="flex flex-col gap-1.5"
						>
							{module.requirementIds.map((id) => (
								<div key={id} className="flex items-start gap-2">
									<Checkbox
										id={`${props.id}-${id}`}
										checked={draft.requirementIds.includes(id)}
										onCheckedChange={(on) => toggleRequirement(id, on === true)}
										data-testid={`dispatch-new-requirement-${id}`}
									/>
									<label
										htmlFor={`${props.id}-${id}`}
										className="flex min-w-0 gap-2 type-small text-foreground"
									>
										<span className="type-mono-small text-text-muted">
											{id}
										</span>
										<span className="min-w-0">
											{requirementText.get(id) ?? ""}
										</span>
									</label>
								</div>
							))}
						</fieldset>
					)}
				</ModalField>
			) : null}

			<div className="grid gap-4 sm:grid-cols-2">
				<ModalField
					name="estimatedTokens"
					label="Estimated tokens"
					hint="From the roster"
					error={shown.estimatedTokens}
					testid="dispatch-new-estimate"
				>
					{(props) => (
						<Input
							{...props}
							{...intProps}
							value={draft.estimatedTokens}
							onChange={(e) => set({ estimatedTokens: e.target.value })}
						/>
					)}
				</ModalField>
				<ModalField
					name="wallClockMinutes"
					label="Time limit, minutes"
					hint={`Up to ${MAX_WALL_CLOCK_MINUTES}`}
					error={shown.wallClockMinutes}
					testid="dispatch-new-minutes"
				>
					{(props) => (
						<Input
							{...props}
							{...intProps}
							value={draft.wallClockMinutes}
							onChange={(e) => set({ wallClockMinutes: e.target.value })}
						/>
					)}
				</ModalField>
				<ModalField
					name="tokenSoftCeiling"
					label="Soft token limit"
					error={shown.tokenSoftCeiling}
					testid="dispatch-new-soft"
				>
					{(props) => (
						<Input
							{...props}
							{...intProps}
							value={draft.tokenSoftCeiling}
							onChange={(e) => set({ tokenSoftCeiling: e.target.value })}
						/>
					)}
				</ModalField>
				<ModalField
					name="tokenHardCeiling"
					label="Hard token limit"
					error={shown.tokenHardCeiling}
					testid="dispatch-new-hard"
				>
					{(props) => (
						<Input
							{...props}
							{...intProps}
							value={draft.tokenHardCeiling}
							onChange={(e) => set({ tokenHardCeiling: e.target.value })}
						/>
					)}
				</ModalField>
			</div>
		</ActionModal>
	);
}

/**
 * New dispatch, for an active mission: the button and its modal, wired to
 * avel-server. Each submit is an attempt with its own Idempotency-Key; a
 * send of the same body after a failure retries that attempt with its key.
 */
export function NewDispatch({
	mission,
}: {
	mission: Pick<MissionDetail, "id" | "status">;
}) {
	// Only an active mission takes dispatches, so only it reads for the form.
	return mission.status === "active" ? (
		<NewDispatchActive missionId={mission.id} />
	) : null;
}

function NewDispatchActive({ missionId }: { missionId: string }) {
	const preview = useIsPreview();
	const [open, setOpen] = useState(false);
	const generation = useOpenGeneration(open);
	const [last, setLast] = useState<DispatchAttempt | null>(null);
	const create = useCreateDispatch(missionId);
	const roster = useRoster(missionId);
	const plan = useMissionPlan(missionId);

	const entries = (roster.data ?? []).filter((e) => e.active);
	const loading = roster.status === "pending" || plan.status === "pending";

	const onOpenChange = (next: boolean) => {
		setOpen(next);
		if (!next) {
			create.reset();
			setLast(null);
		}
	};
	const submit = (body: CreateDispatchBody) => {
		const attempt = attemptFor(last, body);
		setLast(attempt);
		create.mutate(attempt, {
			onSuccess: () => {
				setLast(null);
				setOpen(false);
				create.reset();
			},
		});
	};

	return (
		<>
			<Button
				size="sm"
				onClick={() => setOpen(true)}
				disabledReason={
					preview
						? "Sign in to dispatch"
						: loading
							? "Reading the roster and plan"
							: undefined
				}
				data-testid="dispatch-new-button"
			>
				<Plus aria-hidden="true" />
				New dispatch
			</Button>
			{open ? (
				<NewDispatchForm
					key={generation}
					open={open}
					onOpenChange={onOpenChange}
					entries={entries}
					roster={roster.data}
					brief={plan.data?.brief ?? null}
					pending={create.isPending}
					error={create.error}
					onSubmit={submit}
				/>
			) : null}
		</>
	);
}
