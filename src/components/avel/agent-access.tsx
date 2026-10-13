import type {
	AccessRow,
	AgentAccess,
	AgentRosterEntry,
	AgentTemplate,
	GrantRow,
	MissionStatus,
} from "avel-server/contract";
import {
	CircleAlert,
	FolderGit2,
	KeyRound,
	Lock,
	type LucideIcon,
	Send,
	Wrench,
} from "lucide-react";
import { type ReactNode, useId } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	overridesOf,
	useEntryAccess,
	useSetAccessOverrides,
	useTemplateAccess,
	useTemplateRosterEntries,
	withRowMode,
} from "@/lib/api/access";
import type { ApiError } from "@/lib/api/errors";
import { rosterReadOnlyReason } from "@/lib/api/roster";
import { describeError } from "@/lib/error-map";
import { cn } from "@/lib/utils";
import { type DataColumn, DataTable } from "./data-table";
import { SectionPanel } from "./section-panel";
import { StatusPill } from "./status-pill";
import { ErrorState, Surface, type SurfaceQuery } from "./surface";

/*
 * The Tools and access tab (ruling 38, after the operator's reference): what
 * this agent may touch, row by row, from avel-server's accessFor. Without a
 * mission it shows the template's own access, from its roles alone, and
 * nothing can change. On a mission it shows that roster entry's access, and
 * each tool row can be narrowed while the mission is a draft. Nothing is
 * enforced until rooms land in module 7, and the panel says so.
 */

/** The words for each mode, as the operator's reference names them. */
export const MODE_LABEL = {
	none: "No access",
	read: "Read",
	write_held: "Write holds",
	send_after_approval: "Send after approval",
} as const satisfies Record<AccessRow["mode"], string>;

/** One sentence per mode, for its chip's title. */
export const MODE_MEANING = {
	none: "The agent can't use this tool on this mission.",
	read: "Reads only. It changes nothing.",
	write_held:
		"Writes are held: nothing reaches the client until the gate passes.",
	send_after_approval:
		"Agents never send. The operator delivers, after approving.",
} as const satisfies Record<AccessRow["mode"], string>;

const MODE_TONE: Record<AccessRow["mode"], string> = {
	none: "border-border bg-transparent text-text-subtle",
	read: "border-border-strong bg-app-raised text-text-muted",
	write_held: "border-gate-warn-line bg-gate-warn-soft text-gate-warn",
	send_after_approval: "border-gate-warn-line bg-gate-warn-soft text-gate-warn",
};

export const short = (id: string) => id.slice(0, 8);

/**
 * A mission as people read it: "template-booking, sprint 1 (draft)", with
 * the territory when the entry has one. The short id goes beside it, in
 * mono, as the secondary text. No route names a mission's client or
 * engagement by id yet, so neither is named here.
 */
export function entryLabel(entry: AgentRosterEntry): string {
	return `${[
		entry.mission.type,
		`sprint ${entry.mission.sprintN}`,
		...(entry.territory ? [entry.territory] : []),
	].join(", ")} (${entry.mission.status})`;
}

const TEMPLATE = "template";

export function AgentTools({
	agent,
	mission,
	onMission,
}: {
	agent: AgentTemplate;
	mission: string | undefined;
	onMission: (mission: string | undefined) => void;
}) {
	const entries = useTemplateRosterEntries(agent.id);
	const list = entries.data ?? [];
	const entry =
		mission === undefined
			? undefined
			: list.find((e) => e.missionId === mission);
	const head = (
		<>
			<ContextPicker
				entries={list}
				loading={entries.status === "pending"}
				value={entry?.missionId}
				onChange={onMission}
			/>
			{mission !== undefined && entries.status === "success" && !entry ? (
				<p
					data-testid="agent-access-not-on-mission"
					className="type-small text-text-muted"
				>
					{`${agent.name} isn't on mission ${short(mission)}. Showing its own access, from its roles.`}
				</p>
			) : null}
		</>
	);
	return entry ? (
		<EntryAccess agent={agent} entry={entry} head={head} />
	) : (
		<TemplateAccess agent={agent} head={head} />
	);
}

/**
 * The tab's layout: the tools table in its panel, and beside it the three
 * panels that read the same access (credentials, what the agent cannot see,
 * its access requests), as the operator's reference lays them out.
 */
function ToolsLayout({
	agent,
	head,
	query,
	children,
}: {
	agent: AgentTemplate;
	head: ReactNode;
	query: ReturnType<typeof useTemplateAccess>;
	children: (access: AgentAccess) => ReactNode;
}) {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 min-[90rem]:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
			<SectionPanel
				title={`Tools ${agent.name} can use`}
				description="Each row is worked out by avel-server from the agent's skills, paths and the gate."
				actions={
					<StatusPill
						tone="pending"
						attested
						label="Recorded, not enforced"
						data-testid="agent-access-enforced"
					/>
				}
				data-testid="agent-tools-panel"
			>
				<div className="flex flex-col gap-4">
					{head}
					<AccessSurface query={query}>{children}</AccessSurface>
					<p className="type-caption text-text-subtle">
						Nothing here is enforced until each agent works in its own room
						(module 7). Until then it is the record of what the agent may do.
						When each tool was last used comes with completion reports (module
						8).
					</p>
				</div>
			</SectionPanel>
			{/* Beside the table from 1440px, where the table still fits; a row
			    of three under it below that, so the table never scrolls. */}
			<div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-3 min-[90rem]:grid-cols-[minmax(0,1fr)]">
				<Credentials access={query.data} />
				<CannotSee agent={agent} access={query.data} />
				<AccessRequests />
			</div>
		</div>
	);
}

/** Template defaults, or one of the missions this agent is on. */
function ContextPicker({
	entries,
	loading,
	value,
	onChange,
}: {
	entries: readonly AgentRosterEntry[];
	loading: boolean;
	value: string | undefined;
	onChange: (mission: string | undefined) => void;
}) {
	const id = useId();
	return (
		<div className="flex flex-wrap items-center gap-2">
			<label htmlFor={id} className="type-small text-text-muted">
				Showing
			</label>
			<Select
				value={value ?? TEMPLATE}
				onValueChange={(next) => onChange(next === TEMPLATE ? undefined : next)}
				disabled={loading}
			>
				<SelectTrigger
					id={id}
					size="sm"
					data-testid="agent-access-context"
					className="w-80 max-w-full"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={TEMPLATE}>Its own access, from roles</SelectItem>
					{entries.map((entry) => (
						<SelectItem key={entry.entryId} value={entry.missionId}>
							<span className="truncate">{entryLabel(entry)}</span>
							<span
								data-testid="agent-access-context-id"
								className="type-mono-small text-text-subtle"
							>
								{short(entry.missionId)}
							</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{!loading && entries.length === 0 ? (
				<span className="type-caption text-text-subtle">
					Not on any mission yet.
				</span>
			) : null}
		</div>
	);
}

function TemplateAccess({
	agent,
	head,
}: {
	agent: AgentTemplate;
	head: ReactNode;
}) {
	const query = useTemplateAccess(agent.id);
	return (
		<ToolsLayout agent={agent} head={head} query={query}>
			{(access) => (
				<AccessTable
					access={access}
					readOnly="An agent's own access comes from its roles. Choose a mission to change access there."
					onRowMode={() => {}}
				/>
			)}
		</ToolsLayout>
	);
}

function EntryAccess({
	agent,
	entry,
	head,
}: {
	agent: AgentTemplate;
	entry: AgentRosterEntry;
	head: ReactNode;
}) {
	const query = useEntryAccess(entry.missionId, entry.entryId);
	const write = useSetAccessOverrides(entry.missionId);
	const readOnly = entryReadOnlyReason(entry.mission.status, entry.active);
	return (
		<ToolsLayout agent={agent} head={head} query={query}>
			{(access) => (
				<div className="flex flex-col gap-3">
					{access.staleOverrides.length > 0 ? (
						<StaleOverrides
							agent={agent}
							count={access.staleOverrides.length}
							disabledReason={readOnly ?? undefined}
							onClear={() => write.set(entry.entryId, overridesOf(access))}
						/>
					) : null}
					<AccessTable
						access={access}
						readOnly={readOnly}
						pending={write.isPending}
						onRowMode={(row, mode) =>
							write.set(
								entry.entryId,
								withRowMode(overridesOf(access), row, mode),
							)
						}
					/>
					{write.error ? <WriteFailure error={write.error} /> : null}
				</div>
			)}
		</ToolsLayout>
	);
}

/** Why an entry's access can't change now, or null when it can. */
export function entryReadOnlyReason(
	status: MissionStatus,
	active: boolean,
): string | null {
	const notDraft = rosterReadOnlyReason(status);
	if (notDraft) return notDraft;
	if (!active)
		return "This entry is off the mission. Turn it on in the loadout first.";
	return null;
}

function AccessSurface({
	query,
	children,
}: {
	query: SurfaceQuery<AgentAccess, ApiError>;
	children: (access: AgentAccess) => ReactNode;
}) {
	return (
		<Surface
			data-testid="agent-access-surface"
			query={query}
			isEmpty={() => false}
			loading={
				<div
					data-testid="agent-access-skeleton"
					className="flex flex-col gap-2"
				>
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-12 w-full" />
				</div>
			}
			empty={null}
			error={ErrorState}
		>
			{children}
		</Surface>
	);
}

/** Overrides that no longer match a tool: said out loud, never dropped silently. */
function StaleOverrides({
	agent,
	count,
	disabledReason,
	onClear,
}: {
	agent: AgentTemplate;
	count: number;
	disabledReason: string | undefined;
	onClear: () => void;
}) {
	return (
		<div
			data-testid="agent-access-stale"
			className="flex flex-wrap items-start gap-3 rounded-sm border border-gate-warn-line bg-gate-warn-soft p-3"
		>
			<CircleAlert
				aria-hidden="true"
				className="mt-0.5 size-4 text-gate-warn"
			/>
			<p className="min-w-0 flex-1 type-small text-foreground">
				{count === 1
					? `One limit set on ${agent.name} no longer matches a tool. Its skill left the mission, or its grant was renamed, so it limits nothing.`
					: `${count} limits set on ${agent.name} no longer match a tool. Their skills left the mission, or their grants were renamed, so they limit nothing.`}
			</p>
			<Button
				size="sm"
				variant="outline"
				data-testid="agent-access-stale-clear"
				disabledReason={disabledReason}
				onClick={onClear}
			>
				Clear
			</Button>
		</div>
	);
}

type Row = AccessRow & { key: string };

/** Repository first, then tools by skill and grant, then delivery: as served. */
export function rowsOf(access: AgentAccess): Row[] {
	return access.rows.map((row) => ({
		...row,
		key: row.kind === "grant" ? `grant:${row.skillId}:${row.grant}` : row.kind,
	}));
}

const ICON: Record<AccessRow["kind"], LucideIcon> = {
	repository: FolderGit2,
	grant: Wrench,
	delivery: Send,
};

function SystemCell({ row }: { row: Row }) {
	const Icon = ICON[row.kind];
	const [name, detail] =
		row.kind === "repository"
			? ["Repository", "The client's code"]
			: row.kind === "delivery"
				? ["Delivery", "To the client"]
				: [row.system, `${row.skillSlug} · ${row.grant}`];
	return (
		<span className="flex items-center gap-3">
			<span
				aria-hidden="true"
				className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-app-raised text-text-muted"
			>
				<Icon className="size-4" />
			</span>
			<span className="flex min-w-0 flex-col">
				<span className="type-small font-medium text-foreground">{name}</span>
				<span className="type-caption truncate text-text-subtle">{detail}</span>
			</span>
		</span>
	);
}

export function ModeChip({ mode }: { mode: AccessRow["mode"] }) {
	return (
		<span
			data-testid="agent-access-mode"
			data-mode={mode}
			title={MODE_MEANING[mode]}
			className={cn(
				"inline-flex h-6 items-center rounded-full border px-2 type-caption font-medium whitespace-nowrap",
				MODE_TONE[mode],
			)}
		>
			{MODE_LABEL[mode]}
		</span>
	);
}

function AccessCell({ row }: { row: Row }) {
	if (row.kind !== "grant" || row.mode === row.derivedMode)
		return <ModeChip mode={row.mode} />;
	// Narrowed: the mode in force, then what the facts alone would give.
	return (
		<span className="flex flex-wrap items-center gap-1.5">
			<ModeChip mode={row.mode} />
			<span
				data-testid="agent-access-narrowed"
				className="type-caption text-text-subtle"
			>
				{`limited from ${MODE_LABEL[row.derivedMode]}`}
			</span>
		</span>
	);
}

function ScopeCell({ row }: { row: Row }) {
	if (row.kind === "repository")
		return row.scope.length === 0 ? (
			<span className="type-small whitespace-normal text-text-muted">
				Writes nothing
			</span>
		) : (
			<span className="flex flex-col type-mono-small text-foreground">
				{row.scope.map((glob) => (
					<span key={glob}>{glob}</span>
				))}
			</span>
		);
	if (row.kind === "delivery")
		return (
			<span className="type-small whitespace-normal text-text-muted">
				You deliver. Agents never send.
			</span>
		);
	return (
		<span className="type-small whitespace-normal text-text-muted">
			{row.derivedMode === "read" ? "Reads only" : "Held at the gate"}
		</span>
	);
}

/** Why the repository and delivery rows have no switch. */
export const FIXED_REASON = {
	repository: {
		short: "Set by paths",
		why: "Set by its writable paths. Change the paths to change it.",
	},
	delivery: {
		short: "Always",
		why: "Always on: you deliver, after approving. Agents never send.",
	},
} as const;

/**
 * A lock for a row no switch changes, its reason in a tooltip, and the same
 * words for screen readers. Focusable, so the tooltip opens from the keyboard.
 */
function FixedCell({ kind }: { kind: "repository" | "delivery" }) {
	const reason = FIXED_REASON[kind];
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				{/* Relative, so its screen-reader text stays inside the table's
				    scroll frame instead of widening the page. */}
				<span
					// biome-ignore lint/a11y/noNoninteractiveTabindex: focus opens the tooltip that says why the row is fixed
					tabIndex={0}
					data-testid={`agent-access-fixed-${kind}`}
					className="focus-inset relative inline-flex size-8 items-center justify-center rounded-sm text-text-subtle"
				>
					<Lock aria-hidden="true" className="size-4" />
					<span className="sr-only">{reason.short}</span>
				</span>
			</TooltipTrigger>
			<TooltipContent>{reason.why}</TooltipContent>
		</Tooltip>
	);
}

function ControlCell({
	row,
	readOnly,
	pending,
	onRowMode,
}: {
	row: Row;
	readOnly: string | null;
	pending: boolean;
	onRowMode: (row: GrantRow, mode: GrantRow["mode"]) => void;
}) {
	if (row.kind !== "grant") return <FixedCell kind={row.kind} />;
	const on = row.mode !== "none";
	const label = `${row.system}, ${row.grant}`;
	return (
		// Relative, so the disabled reason read to screen readers stays inside
		// the table's scroll frame instead of widening the page.
		<span className="relative flex items-center justify-end gap-2">
			{on && row.derivedMode === "write_held" ? (
				<Select
					value={row.mode}
					onValueChange={(next) => onRowMode(row, next as GrantRow["mode"])}
					disabled={readOnly !== null || pending}
				>
					<SelectTrigger
						size="sm"
						aria-label={`Access to ${label}`}
						data-testid={`agent-access-level-${row.skillId}-${row.grant}`}
						className="w-32"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="write_held">{MODE_LABEL.write_held}</SelectItem>
						<SelectItem value="read">{MODE_LABEL.read}</SelectItem>
					</SelectContent>
				</Select>
			) : null}
			<Switch
				checked={on}
				aria-label={`${on ? "Turn off" : "Turn on"} ${label}`}
				data-testid={`agent-access-toggle-${row.skillId}-${row.grant}`}
				disabled={pending}
				disabledReason={readOnly ?? undefined}
				onCheckedChange={(next) =>
					onRowMode(row, next ? row.derivedMode : "none")
				}
			/>
		</span>
	);
}

export function AccessTable({
	access,
	readOnly,
	pending = false,
	onRowMode,
}: {
	access: AgentAccess;
	/** Why nothing can change, or null when tool rows can. */
	readOnly: string | null;
	pending?: boolean;
	onRowMode: (row: GrantRow, mode: GrantRow["mode"]) => void;
}) {
	const columns: DataColumn<Row>[] = [
		{
			id: "system",
			header: "System",
			cell: (row) => <SystemCell row={row} />,
		},
		{
			id: "access",
			header: "Access",
			width: "9rem",
			cell: (row) => <AccessCell row={row} />,
		},
		{
			id: "scope",
			header: "Scope",
			cell: (row) => <ScopeCell row={row} />,
		},
		{
			id: "control",
			header: "Allowed",
			width: "11rem",
			align: "end",
			cell: (row) => (
				<ControlCell
					row={row}
					readOnly={readOnly}
					pending={pending}
					onRowMode={onRowMode}
				/>
			),
		},
	];
	return (
		<DataTable
			label="What this agent may touch"
			data-testid="agent-access-table"
			columns={columns}
			rows={rowsOf(access)}
			getRowId={(row) => row.key}
			stickyHeader={false}
		/>
	);
}

/** A list row in a side panel: an icon, a name, and a quiet fact at the end. */
function PanelRow({
	icon: Icon,
	name,
	fact,
	"data-testid": testId,
}: {
	icon: LucideIcon;
	name: string;
	fact: string;
	"data-testid": string;
}) {
	return (
		<li
			data-testid={testId}
			className="flex items-center gap-2.5 border-b border-border py-2.5 last:border-b-0"
		>
			<Icon aria-hidden="true" className="size-4 shrink-0 text-text-subtle" />
			<span className="min-w-0 flex-1 truncate type-small font-medium text-foreground">
				{name}
			</span>
			<span className="shrink-0 type-caption text-text-subtle">{fact}</span>
		</li>
	);
}

function PanelSkeleton() {
	return (
		<div className="flex flex-col gap-2">
			<Skeleton className="h-6 w-full" />
			<Skeleton className="h-6 w-full" />
		</div>
	);
}

/**
 * The systems an agent holds a credential for: the repository when it may
 * write there, and each tool it may use. Delivery is the operator's.
 */
export function credentialSystems(access: AgentAccess): string[] {
	const systems = access.rows.flatMap((row) =>
		row.kind === "repository" && row.scope.length > 0
			? ["Repository"]
			: row.kind === "grant" && row.mode !== "none"
				? [row.system]
				: [],
	);
	return [...new Set(systems)];
}

/**
 * Credentials: one per system the agent may touch, from its access. A run's
 * token lives only while the run does and is never shown; none is issued
 * until dispatch runs agents (module 6), and each row says so.
 */
function Credentials({ access }: { access: AgentAccess | undefined }) {
	return (
		<SectionPanel
			title="Credentials"
			description="Scoped tokens, one per run, never shown."
			data-testid="agent-credentials"
		>
			{access === undefined ? (
				<PanelSkeleton />
			) : (
				<div className="flex flex-col gap-3">
					<ul className="flex flex-col">
						{credentialSystems(access).map((system) => (
							<PanelRow
								key={system}
								icon={KeyRound}
								name={system}
								fact="No token yet"
								data-testid={`agent-credential-${system}`}
							/>
						))}
					</ul>
					<p className="type-caption text-text-subtle">
						Tokens are issued when dispatch runs agents (module 6). Delivery
						needs none: you deliver.
					</p>
				</div>
			)}
		</SectionPanel>
	);
}

/** The tools turned off on this mission: what the agent is kept from. */
export function hiddenTools(access: AgentAccess): GrantRow[] {
	return access.rows.filter(
		(row): row is GrantRow => row.kind === "grant" && row.mode === "none",
	);
}

/**
 * What the agent cannot see: the tools turned off for it, from its access,
 * and what each room leaves out once rooms land (module 7).
 */
function CannotSee({
	agent,
	access,
}: {
	agent: AgentTemplate;
	access: AgentAccess | undefined;
}) {
	const hidden = access ? hiddenTools(access) : [];
	return (
		<SectionPanel
			title={`What ${agent.name} cannot see`}
			description="Kept from it, even where a tool has the data."
			data-testid="agent-cannot-see"
		>
			{access === undefined ? (
				<PanelSkeleton />
			) : (
				<div className="flex flex-col gap-3">
					{hidden.length > 0 ? (
						<ul className="flex flex-col">
							{hidden.map((row) => (
								<PanelRow
									key={`${row.skillId}:${row.grant}`}
									icon={Lock}
									name={`${row.system} · ${row.grant}`}
									fact="Turned off"
									data-testid={`agent-hidden-${row.grant}`}
								/>
							))}
						</ul>
					) : (
						<p className="type-small text-text-muted">
							No tool is turned off here.
						</p>
					)}
					<p className="type-caption text-text-subtle">
						What each room leaves out, such as the render kept from the
						fixture's author, comes with rooms (module 7).
					</p>
				</div>
			)}
		</SectionPanel>
	);
}

/** Access requests: blockers filed for missing access, once reports land (module 8). */
function AccessRequests() {
	return (
		<SectionPanel
			title="Access requests"
			description="What it asked for, and what you decided."
			data-testid="agent-access-requests"
		>
			<div className="flex flex-col gap-2">
				<p className="type-small text-text-muted">None recorded.</p>
				<p className="type-caption text-text-subtle">
					An agent asks by filing a blocker. Requests and your answers show here
					with completion reports (module 8).
				</p>
			</div>
		</SectionPanel>
	);
}

/** A refused change: the table is back as the server has it, and this says why. */
function WriteFailure({ error }: { error: ApiError }) {
	const copy = describeError(error);
	return (
		<p
			role="alert"
			data-testid="agent-access-failure"
			className="rounded-md border border-gate-block-line bg-gate-block-soft px-3 py-2 type-small text-foreground"
		>
			{`${copy.what} ${copy.next}`}
		</p>
	);
}
