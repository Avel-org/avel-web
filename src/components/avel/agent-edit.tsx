import {
	type AgentTemplate,
	ROLE_LABELS,
	ROLE_RUNNER,
	ROLE_SIDE,
	ROLE_TEAM,
	ROLES,
	type Role,
	SIDE_LABELS,
	SIDES,
	type Side,
	TEAM_LABELS,
	TEAMS,
	type Team,
	type UpdateAgentTemplateBody,
} from "avel-server/contract";
import { Plus, X } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateAgentTemplate } from "@/lib/api/catalog";
import type { ApiError } from "@/lib/api/errors";
import { describeError } from "@/lib/error-map";
import { cn } from "@/lib/utils";
import { useIsPreview } from "@/shell/auth-gate";

/*
 * The agent editor (module 5, step 6): an agent's title, description, roles
 * and writable paths, each edited in place and saved on its own through
 * PATCH /api/agent-templates/:id. The agent page mounts these pieces
 * (agent-detail.tsx); nothing here knows where it sits.
 *
 * Every rule the server enforces is shown before saving: the counts, the
 * plain-words rule, roles held alone or on one side, at least one path. A
 * refusal still says what the server named. Each piece is a small stateful
 * wrapper around a form that takes its state as props, so every outcome can
 * be rendered in a test.
 */

// ---------------------------------------------------------------------------
// Rules, pure.

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 280;

/** The characters the catalog card refuses: markdown and the em dash. */
const FORBIDDEN = ["*", "_", "`", "#", "—"] as const;

/** Each forbidden character as the message names it. */
const FORBIDDEN_NAME: Record<(typeof FORBIDDEN)[number], string> = {
	"*": "*",
	_: "_",
	"`": "`",
	"#": "#",
	"—": "em dashes",
};

/**
 * What stops this text saving, or null. Checked as the server checks it:
 * trimmed, 1 to `max` characters, no forbidden character.
 */
export function plainWordsProblem(text: string, max: number): string | null {
	const trimmed = text.trim();
	if (trimmed.length === 0) return "Write at least one word, or clear it.";
	if (trimmed.length > max) {
		const over = trimmed.length - max;
		return `${over} ${over === 1 ? "character" : "characters"} over the ${max}-character limit.`;
	}
	const found = FORBIDDEN.filter((c) => trimmed.includes(c));
	if (found.length > 0)
		return `Use plain words: remove ${found.map((c) => FORBIDDEN_NAME[c]).join(", ")}.`;
	return null;
}

/** Roles an agent may hold: every role but the code ones, which are pipeline functions. */
export const OFFERED_ROLES: readonly Role[] = ROLES.filter(
	(role) => ROLE_RUNNER[role] !== "code",
);

/** The offered roles by team, in catalog order; a team with none is left out. */
export function rolesByTeam(): { team: Team; roles: Role[] }[] {
	return TEAMS.map((team) => ({
		team,
		roles: OFFERED_ROLES.filter((role) => ROLE_TEAM[role] === team),
	})).filter((group) => group.roles.length > 0);
}

/** Project setup is the operator's role, never held with another. */
const ALONE: Role = "foundations";

/**
 * Why this role's box can't be ticked now, or undefined. Project setup is
 * held alone: with it chosen nothing else can be, and the other way round.
 */
export function roleBlockedReason(
	chosen: readonly Role[],
	role: Role,
): string | undefined {
	if (chosen.includes(role)) return undefined;
	if (chosen.includes(ALONE))
		return `${ROLE_LABELS[ALONE]} is held alone. Untick it to choose other roles.`;
	if (role === ALONE && chosen.length > 0)
		return `${ROLE_LABELS[ALONE]} is held alone. Untick the other roles first.`;
	return undefined;
}

/**
 * The sides these roles span when they may not merge, or null when they
 * may: roles merge within one side only, and Expected results merges with
 * nothing (the server's mergeAllowed). In SIDES order.
 */
export function crossedSides(roles: readonly Role[]): Side[] | null {
	const present = new Set(roles.map((role) => ROLE_SIDE[role]));
	const sides = SIDES.filter((side) => present.has(side));
	if (sides.length > 1) return sides;
	if (roles.includes("fixture") && new Set(roles).size > 1) return sides;
	return null;
}

/** The warning shown while the chosen roles cross sides, or null. */
export function crossSidesWarning(roles: readonly Role[]): string | null {
	const sides = crossedSides(roles);
	if (!sides) return null;
	if (sides.length <= 1)
		return `${ROLE_LABELS.fixture} stands alone: an agent with it holds no other role.`;
	return `These roles span ${sides.map((s) => SIDE_LABELS[s]).join(" and ")}, so this agent would check its own work. Keep them on one side.`;
}

/** What a save reports. A roles or paths change leaves the identity stale. */
export function savedMessage(agent: Pick<AgentTemplate, "identityStale">) {
	return agent.identityStale
		? "Saved. The identity is now out of date; regenerate it to apply."
		: "Saved.";
}

/**
 * What the server named in a refusal, in words: the roles it can't give an
 * agent (issues point into the roles sent), or the sides they span.
 */
export function refusalSpecifics(
	error: ApiError,
	sentRoles: readonly Role[] = [],
): string | null {
	const { failure } = error;
	if (failure.kind !== "contract" || failure.code !== "PRECONDITION_FAILED")
		return null;
	const { details } = failure;
	if (details.reason === "agent_role_not_assignable") {
		const labels = (details.issues ?? []).flatMap(({ path }) => {
			const i = path[0] === "roles" ? path[1] : undefined;
			const role = typeof i === "number" ? sentRoles[i] : undefined;
			return role ? [ROLE_LABELS[role]] : [];
		});
		return labels.length > 0
			? `Can't be given to an agent: ${labels.join(", ")}.`
			: null;
	}
	if (details.reason === "agent_roles_cross_sides") {
		const sides = details.sides ?? [];
		return sides.length > 0
			? `The roles span: ${sides.map((s) => SIDE_LABELS[s]).join(", ")}.`
			: null;
	}
	return null;
}

/** Why a path list can't be saved, or null: at least one, none blank. */
export function pathsProblem(paths: readonly string[]): string | null {
	if (paths.length === 0)
		return "An agent writes somewhere: keep at least one path.";
	if (paths.some((p) => p.trim() === ""))
		return "Fill in or remove the empty path.";
	return null;
}

const same = (a: readonly string[], b: readonly string[]) =>
	a.length === b.length && a.every((x, i) => x === b[i]);

// ---------------------------------------------------------------------------
// Shared pieces.

/** "Sign in to edit" in the preview, which the server refuses to write for. */
export function useEditBlocked(): string | undefined {
	return useIsPreview() ? "Sign in to edit" : undefined;
}

/** The last save's result: saved (with the template it returned) or refused. */
export type Outcome =
	| { kind: "idle" }
	| { kind: "saved"; agent: Pick<AgentTemplate, "identityStale"> }
	| { kind: "error"; error: ApiError; sentRoles?: readonly Role[] };

/** Saves one patch, keeping its outcome for the form to show. */
function useSave(agent: AgentTemplate) {
	const update = useUpdateAgentTemplate();
	const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
	const save = (patch: UpdateAgentTemplateBody, onSaved: () => void) => {
		setOutcome({ kind: "idle" });
		update.mutate(
			{ id: agent.id, patch },
			{
				onSuccess: (saved) => {
					setOutcome({ kind: "saved", agent: saved });
					onSaved();
				},
				onError: (error) =>
					setOutcome({ kind: "error", error, sentRoles: patch.roles }),
			},
		);
	};
	return { save, pending: update.isPending, outcome };
}

/** The outcome in words: a polite status once saved, an alert when refused. */
export function OutcomeLine({
	outcome,
	testId,
}: {
	outcome: Outcome;
	testId: string;
}) {
	if (outcome.kind === "saved")
		return (
			// <output> is a polite status region by default.
			<output
				data-testid={`${testId}-saved`}
				className={cn(
					"block type-small",
					outcome.agent.identityStale ? "text-gate-warn" : "text-text-muted",
				)}
			>
				{savedMessage(outcome.agent)}
			</output>
		);
	if (outcome.kind === "error") {
		const copy = describeError(outcome.error);
		const specifics = refusalSpecifics(outcome.error, outcome.sentRoles);
		return (
			<div
				role="alert"
				data-testid={`${testId}-error`}
				className="flex flex-col gap-1"
			>
				<p className="type-small text-destructive">{copy.what}</p>
				{specifics ? (
					<p
						data-testid={`${testId}-error-specifics`}
						className="type-small text-foreground"
					>
						{specifics}
					</p>
				) : null}
				<p className="type-caption text-text-muted">{copy.next}</p>
			</div>
		);
	}
	return null;
}

/** A field's heading row: its name, and Edit while it is not being edited. */
function FieldHead({
	label,
	labelId,
	editing,
	blocked,
	onEdit,
	testId,
}: {
	label: string;
	labelId: string;
	editing: boolean;
	blocked: string | undefined;
	onEdit: () => void;
	testId: string;
}) {
	return (
		<div className="flex items-center justify-between gap-2">
			<h3 id={labelId} className="type-caption text-text-subtle">
				{label}
			</h3>
			{editing ? null : (
				<Button
					variant="ghost"
					size="sm"
					data-testid={`${testId}-edit`}
					disabledReason={blocked}
					onClick={onEdit}
				>
					Edit
				</Button>
			)}
		</div>
	);
}

/** Save and Cancel, Save naming why it can't act. */
function SaveRow({
	testId,
	saveBlocked,
	pending,
	onSave,
	onCancel,
	children,
}: {
	testId: string;
	saveBlocked: string | undefined;
	pending: boolean;
	onSave: () => void;
	onCancel: () => void;
	children?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button
				size="sm"
				data-testid={`${testId}-save`}
				disabledReason={pending ? "Saving" : saveBlocked}
				onClick={onSave}
			>
				{pending ? "Saving" : "Save"}
			</Button>
			<Button
				variant="ghost"
				size="sm"
				data-testid={`${testId}-cancel`}
				disabled={pending}
				onClick={onCancel}
			>
				Cancel
			</Button>
			{children}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Title and description.

type TextField = "title" | "description";

const TEXT = {
	title: { label: "Title", max: TITLE_MAX, empty: "No title yet" },
	description: {
		label: "Description",
		max: DESCRIPTION_MAX,
		empty: "No description yet",
	},
} as const satisfies Record<
	TextField,
	{ label: string; max: number; empty: string }
>;

/** The text form: the draft, its live count and problem, Save, Cancel and Clear. */
export function TextEditForm({
	field,
	draft,
	current,
	pending,
	onDraft,
	onSave,
	onCancel,
	onClear,
	labelId,
}: {
	field: TextField;
	draft: string;
	/** The saved value, so Save waits for a change and Clear for something to clear. */
	current: string | null;
	pending: boolean;
	onDraft: (text: string) => void;
	onSave: () => void;
	onCancel: () => void;
	onClear: () => void;
	labelId: string;
}) {
	const { max } = TEXT[field];
	const testId = `agent-edit-${field}`;
	const countId = useId();
	const problemId = useId();
	const length = draft.trim().length;
	const problem = plainWordsProblem(draft, max);
	const unchanged = draft.trim() === (current ?? "");
	const control = {
		value: draft,
		onChange: (
			event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
		) => onDraft(event.target.value),
		"aria-labelledby": labelId,
		"aria-describedby": problem ? `${countId} ${problemId}` : countId,
		"aria-invalid": problem ? true : undefined,
		"data-testid": `${testId}-input`,
	};
	return (
		<div className="flex flex-col gap-2">
			{field === "title" ? (
				<Input {...control} />
			) : (
				<Textarea rows={3} {...control} />
			)}
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<p
					id={problemId}
					data-testid={`${testId}-problem`}
					className="type-caption text-destructive"
				>
					{problem && length > 0 ? problem : null}
				</p>
				<p
					id={countId}
					aria-live="polite"
					data-testid={`${testId}-count`}
					className={cn(
						"type-mono tabular-nums",
						length > max ? "text-destructive" : "text-text-subtle",
					)}
				>
					{`${length} / ${max}`}
				</p>
			</div>
			<SaveRow
				testId={testId}
				saveBlocked={problem ?? (unchanged ? "Nothing has changed" : undefined)}
				pending={pending}
				onSave={onSave}
				onCancel={onCancel}
			>
				<Button
					variant="ghost"
					size="sm"
					data-testid={`${testId}-clear`}
					disabledReason={
						pending
							? "Saving"
							: current === null
								? `It has no ${TEXT[field].label.toLowerCase()} to clear`
								: undefined
					}
					onClick={onClear}
				>
					Clear
				</Button>
			</SaveRow>
		</div>
	);
}

function TextEdit({
	agent,
	field,
}: {
	agent: AgentTemplate;
	field: TextField;
}) {
	const blocked = useEditBlocked();
	const labelId = useId();
	const current = agent[field];
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(current ?? "");
	const { save, pending, outcome } = useSave(agent);
	const testId = `agent-edit-${field}`;
	const done = () => setEditing(false);
	return (
		<section
			aria-labelledby={labelId}
			data-testid={testId}
			className="flex flex-col gap-2"
		>
			<FieldHead
				label={TEXT[field].label}
				labelId={labelId}
				editing={editing}
				blocked={blocked}
				onEdit={() => {
					setDraft(current ?? "");
					setEditing(true);
				}}
				testId={testId}
			/>
			{editing ? (
				<TextEditForm
					field={field}
					draft={draft}
					current={current}
					pending={pending}
					onDraft={setDraft}
					onSave={() => save({ [field]: draft.trim() }, done)}
					onCancel={done}
					onClear={() => save({ [field]: null }, done)}
					labelId={labelId}
				/>
			) : (
				<p
					data-testid={`${testId}-value`}
					className={cn(
						"type-body",
						current ? "text-foreground" : "text-text-subtle",
					)}
				>
					{current ?? TEXT[field].empty}
				</p>
			)}
			<OutcomeLine outcome={outcome} testId={testId} />
		</section>
	);
}

/** An agent's title, "Frontend engineer", edited in place: 1 to 60 plain characters. */
export function AgentTitleEdit({ agent }: { agent: AgentTemplate }) {
	return <TextEdit agent={agent} field="title" />;
}

/** An agent's catalog description, edited in place: 1 to 280 plain characters. */
export function AgentDescriptionEdit({ agent }: { agent: AgentTemplate }) {
	return <TextEdit agent={agent} field="description" />;
}

// ---------------------------------------------------------------------------
// Roles.

/** The roles form: a box per offered role, grouped by team, and the warnings. */
export function RolesEditForm({
	chosen,
	current,
	pending,
	onToggle,
	onSave,
	onCancel,
}: {
	chosen: readonly Role[];
	current: readonly Role[];
	pending: boolean;
	onToggle: (role: Role, on: boolean) => void;
	onSave: () => void;
	onCancel: () => void;
}) {
	const warning = crossSidesWarning(chosen);
	const aloneNote = chosen.includes(ALONE)
		? roleBlockedReason(chosen, OFFERED_ROLES.find((r) => r !== ALONE) ?? ALONE)
		: undefined;
	const unchanged = same([...chosen].sort(), [...current].sort());
	return (
		<div className="flex flex-col gap-3">
			<div className="grid gap-3 sm:grid-cols-2">
				{rolesByTeam().map(({ team, roles }) => (
					<fieldset
						key={team}
						data-testid={`agent-edit-roles-team-${team}`}
						className="flex min-w-0 flex-col gap-1.5"
					>
						<legend className="type-small font-medium text-foreground">
							{TEAM_LABELS[team].label}
						</legend>
						<p className="type-caption text-text-subtle">
							{TEAM_LABELS[team].meaning}
						</p>
						{roles.map((role) => {
							const reason = roleBlockedReason(chosen, role);
							return (
								<RoleBox
									key={role}
									role={role}
									checked={chosen.includes(role)}
									reason={pending ? "Saving" : reason}
									onToggle={onToggle}
								/>
							);
						})}
					</fieldset>
				))}
			</div>
			{aloneNote ? (
				<p
					data-testid="agent-edit-roles-alone"
					className="type-caption text-text-muted"
				>
					{aloneNote}
				</p>
			) : null}
			{warning ? (
				<p
					role="alert"
					data-testid="agent-edit-roles-warning"
					className="type-small text-gate-warn"
				>
					{warning}
				</p>
			) : null}
			<p className="type-caption text-text-subtle">
				Changing its roles leaves the identity out of date until it is
				regenerated.
			</p>
			<SaveRow
				testId="agent-edit-roles"
				saveBlocked={
					chosen.length === 0
						? "Choose at least one role"
						: warning
							? "Its roles cross sides"
							: unchanged
								? "Nothing has changed"
								: undefined
				}
				pending={pending}
				onSave={onSave}
				onCancel={onCancel}
			/>
		</div>
	);
}

function RoleBox({
	role,
	checked,
	reason,
	onToggle,
}: {
	role: Role;
	checked: boolean;
	reason: string | undefined;
	onToggle: (role: Role, on: boolean) => void;
}) {
	const id = useId();
	return (
		<div className="flex items-center gap-2">
			<Checkbox
				id={id}
				checked={checked}
				disabled={reason !== undefined}
				data-testid={`agent-edit-role-${role}`}
				onCheckedChange={(on) => onToggle(role, on === true)}
			/>
			<label
				htmlFor={id}
				title={reason}
				className={cn(
					"type-small",
					reason ? "text-text-subtle" : "text-foreground",
				)}
			>
				{ROLE_LABELS[role]}
			</label>
		</div>
	);
}

/** An agent's roles, chosen by team. Saving one changes the identity's inputs. */
export function AgentRolesEdit({ agent }: { agent: AgentTemplate }) {
	const blocked = useEditBlocked();
	const labelId = useId();
	const [editing, setEditing] = useState(false);
	const [chosen, setChosen] = useState<Role[]>(agent.roles);
	const { save, pending, outcome } = useSave(agent);
	const done = () => setEditing(false);
	return (
		<section
			aria-labelledby={labelId}
			data-testid="agent-edit-roles"
			className="flex flex-col gap-2"
		>
			<FieldHead
				label="Roles"
				labelId={labelId}
				editing={editing}
				blocked={blocked}
				onEdit={() => {
					setChosen(agent.roles);
					setEditing(true);
				}}
				testId="agent-edit-roles"
			/>
			{editing ? (
				<RolesEditForm
					chosen={chosen}
					current={agent.roles}
					pending={pending}
					onToggle={(role, on) =>
						setChosen((roles) =>
							on
								? ROLES.filter((r) => r === role || roles.includes(r))
								: roles.filter((r) => r !== role),
						)
					}
					onSave={() => save({ roles: chosen }, done)}
					onCancel={done}
				/>
			) : (
				<ul
					data-testid="agent-edit-roles-value"
					className="flex flex-wrap gap-1.5"
				>
					{agent.roles.map((role) => (
						<li
							key={role}
							className="inline-flex h-[22px] items-center rounded-sm bg-gate-pending-soft px-2 type-caption text-gate-pending"
						>
							{ROLE_LABELS[role]}
						</li>
					))}
				</ul>
			)}
			<OutcomeLine outcome={outcome} testId="agent-edit-roles" />
		</section>
	);
}

// ---------------------------------------------------------------------------
// Writable paths.

/** The paths form: one row per glob with Remove, and a row to add one. */
export function PathsEditForm({
	paths,
	current,
	adding,
	pending,
	onPath,
	onRemove,
	onAdding,
	onAdd,
	onSave,
	onCancel,
}: {
	paths: readonly string[];
	current: readonly string[];
	adding: string;
	pending: boolean;
	onPath: (index: number, value: string) => void;
	onRemove: (index: number) => void;
	onAdding: (value: string) => void;
	onAdd: () => void;
	onSave: () => void;
	onCancel: () => void;
}) {
	const problem = pathsProblem(paths);
	const unchanged = same(paths, current);
	return (
		<div className="flex flex-col gap-2">
			<ul aria-label="Writable paths" className="flex flex-col gap-1.5">
				{paths.map((path, i) => (
					<li
						// Paths can repeat while typed; the row's place is its identity.
						// biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
						key={i}
						data-testid={`agent-edit-path-${i}`}
						className="flex items-center gap-2"
					>
						<Input
							value={path}
							aria-label={`Path ${i + 1}`}
							className="font-mono"
							onChange={(event) => onPath(i, event.target.value)}
						/>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={`Remove ${path || `path ${i + 1}`}`}
							data-testid={`agent-edit-path-${i}-remove`}
							disabledReason={
								pending
									? "Saving"
									: paths.length === 1
										? "An agent keeps at least one path"
										: undefined
							}
							onClick={() => onRemove(i)}
						>
							<X aria-hidden="true" />
						</Button>
					</li>
				))}
			</ul>
			<div className="flex items-center gap-2">
				<Input
					value={adding}
					placeholder="src/features/booking/**"
					aria-label="New path"
					data-testid="agent-edit-path-new"
					className="font-mono"
					onChange={(event) => onAdding(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && adding.trim() !== "") {
							event.preventDefault();
							onAdd();
						}
					}}
				/>
				<Button
					variant="outline"
					size="sm"
					data-testid="agent-edit-path-add"
					disabledReason={
						adding.trim() === ""
							? "Type a path to add"
							: paths.includes(adding.trim())
								? "It already has this path"
								: undefined
					}
					onClick={onAdd}
				>
					<Plus aria-hidden="true" />
					Add
				</Button>
			</div>
			{problem ? (
				<p
					data-testid="agent-edit-paths-problem"
					className="type-caption text-destructive"
				>
					{problem}
				</p>
			) : null}
			<p className="type-caption text-text-subtle">
				Changing its paths leaves the identity out of date until it is
				regenerated.
			</p>
			<SaveRow
				testId="agent-edit-paths"
				saveBlocked={problem ?? (unchanged ? "Nothing has changed" : undefined)}
				pending={pending}
				onSave={onSave}
				onCancel={onCancel}
			/>
		</div>
	);
}

/** The globs this agent may change. Saving one changes the identity's inputs. */
export function AgentPathsEdit({ agent }: { agent: AgentTemplate }) {
	const blocked = useEditBlocked();
	const labelId = useId();
	const [editing, setEditing] = useState(false);
	const [paths, setPaths] = useState<string[]>(agent.writablePaths);
	const [adding, setAdding] = useState("");
	const { save, pending, outcome } = useSave(agent);
	const done = () => setEditing(false);
	return (
		<section
			aria-labelledby={labelId}
			data-testid="agent-edit-paths"
			className="flex flex-col gap-2"
		>
			<FieldHead
				label="Writable paths"
				labelId={labelId}
				editing={editing}
				blocked={blocked}
				onEdit={() => {
					setPaths(agent.writablePaths);
					setAdding("");
					setEditing(true);
				}}
				testId="agent-edit-paths"
			/>
			{editing ? (
				<PathsEditForm
					paths={paths}
					current={agent.writablePaths}
					adding={adding}
					pending={pending}
					onPath={(index, value) =>
						setPaths((list) => list.map((p, i) => (i === index ? value : p)))
					}
					onRemove={(index) =>
						setPaths((list) => list.filter((_, i) => i !== index))
					}
					onAdding={setAdding}
					onAdd={() => {
						setPaths((list) => [...list, adding.trim()]);
						setAdding("");
					}}
					onSave={() =>
						save({ writablePaths: paths.map((p) => p.trim()) }, done)
					}
					onCancel={done}
				/>
			) : (
				<ul
					data-testid="agent-edit-paths-value"
					className="flex flex-col gap-0.5 type-mono text-foreground"
				>
					{agent.writablePaths.map((path) => (
						<li key={path} className="break-all">
							{path}
						</li>
					))}
				</ul>
			)}
			<OutcomeLine outcome={outcome} testId="agent-edit-paths" />
		</section>
	);
}
