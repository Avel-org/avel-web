import { Link } from "@tanstack/react-router";
import {
	type ActivityEntry,
	type AgentTemplate,
	computeCoherence,
	type Playbook,
	type Preset,
	type PresetAgent,
	WAVES,
} from "avel-server/contract";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isoDate } from "@/lib/api/clients";
import { presetCoherenceInput } from "@/lib/api/coherence";
import { usePlaybooks } from "@/lib/api/playbooks";
import {
	agentCount,
	CUT_LABEL,
	presetAgentKey,
	staleSince,
	usePresetActivity,
	usePresetApplications,
} from "@/lib/api/presets";
import { cn } from "@/lib/utils";
import { InlineExpand } from "./inline-expand";
import { CoherenceView } from "./playbook-coherence";
import { agentName, fieldText } from "./preset-compare";
import { type Names, useAllTemplates } from "./preset-detail";
import { HiddenId } from "./short-hash";
import { ErrorState, Surface } from "./surface";

/*
 * The expanded preset's sections, under its board: Overview, Coverage,
 * Agents, Used by and History. Everything shown is the contract's: coverage
 * is computeCoherence over the squad, never a rule of ours.
 */

export function PresetSections({
	preset,
	names,
}: {
	preset: Preset;
	names: Names;
}) {
	return (
		<Tabs defaultValue="overview" data-testid="preset-sections">
			<TabsList aria-label="Team sections">
				{(
					[
						["overview", "Overview"],
						["coverage", "Coverage"],
						["agents", "Agents"],
						["used-by", "Used by"],
						["history", "History"],
					] as const
				).map(([id, label]) => (
					<TabsTrigger key={id} value={id} data-testid={`preset-section-${id}`}>
						{label}
					</TabsTrigger>
				))}
			</TabsList>
			<TabsContent
				value="overview"
				forceMount
				className="pt-3 data-[state=inactive]:hidden"
			>
				<Overview preset={preset} />
			</TabsContent>
			<TabsContent
				value="coverage"
				forceMount
				className="pt-3 data-[state=inactive]:hidden"
			>
				<Coverage preset={preset} />
			</TabsContent>
			<TabsContent
				value="agents"
				forceMount
				className="pt-3 data-[state=inactive]:hidden"
			>
				<Agents preset={preset} names={names} />
			</TabsContent>
			<TabsContent
				value="used-by"
				forceMount
				className="pt-3 data-[state=inactive]:hidden"
			>
				<UsedBy preset={preset} />
			</TabsContent>
			<TabsContent
				value="history"
				forceMount
				className="pt-3 data-[state=inactive]:hidden"
			>
				<PresetHistory preset={preset} />
			</TabsContent>
		</Tabs>
	);
}

/** Which waves have at least one agent, A to E. */
export function waveCoverage(agents: readonly PresetAgent[]) {
	return WAVES.map((wave) => ({
		wave,
		covered: agents.some((a) => a.waves.includes(wave)),
	}));
}

/** The live playbooks whose default preset is this one. */
export function defaultFor<P extends Pick<Playbook, "defaultPresetId">>(
	playbooks: readonly P[],
	presetId: string,
): P[] {
	return playbooks.filter((p) => p.defaultPresetId === presetId);
}

function usePlaybookRows() {
	const playbooks = usePlaybooks();
	return {
		status: playbooks.status,
		rows: playbooks.data
			? playbooks.data.pages.flatMap((page) => page.data)
			: [],
	};
}

function Overview({ preset }: { preset: Preset }) {
	const playbooks = usePlaybookRows();
	const usedAsDefault = defaultFor(playbooks.rows, preset.id);
	return (
		<dl
			data-testid="preset-overview"
			className="grid gap-x-6 gap-y-3 md:grid-cols-[auto_1fr]"
		>
			<dt className="type-small text-text-subtle">Squad</dt>
			<dd className="flex flex-wrap items-center gap-2">
				<Badge variant="tag">{CUT_LABEL[preset.cut]}</Badge>
				<Badge variant="tag">{`v${preset.version}`}</Badge>
				<span className="type-mono-small text-text-muted">
					{agentCount(preset.agents.length)}
				</span>
			</dd>
			<dt className="type-small text-text-subtle">Waves covered</dt>
			<dd>
				<ol
					aria-label="Waves with at least one agent"
					data-testid="preset-wave-coverage"
					className="flex gap-1"
				>
					{waveCoverage(preset.agents).map(({ wave, covered }) => (
						<li
							key={wave}
							data-covered={covered}
							className={cn(
								"type-mono-small flex size-7 items-center justify-center rounded-xs border",
								covered
									? "border-gate-pass-line bg-gate-pass-soft text-foreground"
									: "border-dashed border-gate-pending-line text-text-subtle",
							)}
						>
							{wave}
							<span className="sr-only">
								{covered ? ", has agents" : ", none"}
							</span>
						</li>
					))}
				</ol>
			</dd>
			<dt className="type-small text-text-subtle">Default for</dt>
			<dd
				data-testid="preset-default-for"
				className="type-small text-foreground"
			>
				{playbooks.status === "pending" ? (
					<Skeleton className="h-4 w-40" />
				) : usedAsDefault.length === 0 ? (
					<span className="text-text-muted">
						No playbook uses it as its default.
					</span>
				) : (
					usedAsDefault.map((p) => p.name).join(", ")
				)}
			</dd>
			<dt className="type-small text-text-subtle">Last changed</dt>
			<dd className="type-mono-small text-text-muted">
				{isoDate(preset.updatedAt)}
			</dd>
		</dl>
	);
}

/**
 * What the squad covers, by the contract's own check: computeCoherence with
 * the preset's agents as a roster (active, their waves, kind and roles from
 * the catalog, resolved paths), against each playbook that defaults to it.
 */
function Coverage({ preset }: { preset: Preset }) {
	const templates = useAllTemplates();
	const playbooks = usePlaybookRows();
	if (templates.status === "pending" || playbooks.status === "pending") {
		return (
			<Skeleton data-testid="preset-coverage-loading" className="h-16 w-full" />
		);
	}
	const byId: ReadonlyMap<string, AgentTemplate> =
		templates.status === "success" ? templates.byId : new Map();
	const input = presetCoherenceInput(preset, byId);
	const roles = [
		...new Set(
			preset.agents.flatMap((a) => byId.get(a.agentTemplateId)?.roles ?? []),
		),
	];
	const usedAsDefault = defaultFor(playbooks.rows, preset.id);
	return (
		<div data-testid="preset-coverage" className="flex flex-col gap-4">
			<section className="flex flex-col gap-1.5">
				<h3 className="type-small font-medium text-foreground">Roles held</h3>
				{roles.length === 0 ? (
					<p className="type-small text-text-muted">None yet.</p>
				) : (
					<ul className="flex flex-wrap gap-1">
						{roles.map((r) => (
							<li key={r}>
								<Badge variant="tag">{r}</Badge>
							</li>
						))}
					</ul>
				)}
			</section>
			<section className="flex flex-col gap-2">
				<h3 className="type-small font-medium text-foreground">
					Fit for the playbooks that default to it
				</h3>
				<p className="type-caption text-text-subtle">
					Checked as if applied: applied agents start active.
				</p>
				{input === null ? (
					<p
						data-testid="preset-coverage-unknown"
						className="type-small text-text-muted"
					>
						An agent is not in All agents, so its roles cannot be read and
						coverage cannot be checked.
					</p>
				) : usedAsDefault.length === 0 ? (
					<p className="type-small text-text-muted">
						No playbook uses it as its default, so there is nothing to fit.
					</p>
				) : (
					<ul className="flex flex-col gap-3">
						{usedAsDefault.map((p) => {
							const result = computeCoherence(input, {
								wavesApplicable: p.wavesApplicable,
								gates: p.gates,
							});
							const fits = !result.block && result.warnings.length === 0;
							return (
								<li
									key={p.missionType}
									data-testid={`preset-fit-${p.missionType}`}
									data-fits={fits}
									className="flex flex-col gap-1.5"
								>
									<span className="flex items-center gap-2">
										<span className="type-small text-foreground">{p.name}</span>
										<Badge variant={fits ? "default" : "outline"}>
											{fits ? "Fits" : "Doesn't fit yet"}
										</Badge>
									</span>
									{fits ? null : <CoherenceView result={result} />}
								</li>
							);
						})}
					</ul>
				)}
			</section>
		</div>
	);
}

function Agents({ preset, names }: { preset: Preset; names: Names }) {
	const templates = useAllTemplates();
	const byId: ReadonlyMap<string, AgentTemplate> =
		templates.status === "success" ? templates.byId : new Map();
	if (preset.agents.length === 0) {
		return (
			<p className="type-small text-text-muted">This team saves no agents.</p>
		);
	}
	return (
		<InlineExpand
			data-testid="preset-agent-rows"
			items={preset.agents}
			visible={4}
			noun="agents"
			getKey={presetAgentKey}
			render={(agent) => {
				const inherited =
					agent.writablePaths === null
						? byId.get(agent.agentTemplateId)?.writablePaths
						: undefined;
				return (
					<div
						data-testid={`preset-agent-row-${presetAgentKey(agent)}`}
						className="grid gap-x-4 gap-y-0.5 border-b border-border py-2 last:border-b-0 md:grid-cols-[minmax(0,12rem)_auto_minmax(0,1fr)_auto]"
					>
						<span className="type-small text-foreground">
							{agentName(agent, names)}
						</span>
						<span className="type-mono-small text-text-muted">
							{fieldText(agent, "waves")}
						</span>
						<span className="type-mono-small break-words text-text-muted">
							{agent.writablePaths !== null ? (
								<>
									{agent.writablePaths.join(", ")}
									<span className="ml-1 text-text-subtle">overridden</span>
								</>
							) : inherited ? (
								<>
									{inherited.join(", ") || "none"}
									<span className="ml-1 text-text-subtle">inherited</span>
								</>
							) : (
								<span className="text-text-subtle">The agent's</span>
							)}
						</span>
						<span className="type-mono-small tabular-nums text-text-muted">
							{fieldText(agent, "estimatedTokens")}
						</span>
					</div>
				);
			}}
		/>
	);
}

/** payload.fields, when it is a list of names. The contract types payload loosely. */
export function changedFieldsOf(
	entry: Pick<ActivityEntry, "payload">,
): string[] {
	const fields = entry.payload.fields;
	return Array.isArray(fields) && fields.every((f) => typeof f === "string")
		? fields
		: [];
}

/**
 * Each entry's version, when the whole history is loaded: created is v1 and
 * every update adds 1. Unknown (null) when older entries are not loaded.
 */
export function versionsOf(
	entries: readonly Pick<ActivityEntry, "action">[],
	total: number,
): Array<number | null> {
	if (entries.length < total) return entries.map(() => null);
	let version = 0;
	const oldestFirst = [...entries].reverse().map((e) => {
		if (e.action === "preset.created") version = 1;
		else if (e.action === "preset.updated") version += 1;
		return version === 0 ? null : version;
	});
	return oldestFirst.reverse();
}

function PresetHistory({ preset }: { preset: Preset }) {
	const query = usePresetActivity(preset.id);
	return (
		<Surface
			data-testid="preset-history"
			query={query}
			isEmpty={(page) => page.data.length === 0}
			loading={<Skeleton className="h-16 w-full" />}
			empty={
				<p className="type-small text-text-muted">
					Nothing recorded for this team yet.
				</p>
			}
			error={ErrorState}
		>
			{(page) => {
				const versions = versionsOf(page.data, page.meta.total ?? Infinity);
				return (
					<ol aria-label="Versions" className="flex flex-col gap-2">
						{page.data.map((entry, i) => {
							const fields = changedFieldsOf(entry);
							return (
								<li
									key={entry.id}
									data-testid={`preset-history-${entry.id}`}
									className="flex items-baseline gap-3"
								>
									<History
										aria-hidden="true"
										className="size-3.5 shrink-0 translate-y-0.5 text-text-subtle"
									/>
									<span className="type-mono-small w-10 shrink-0 text-foreground">
										{versions[i] === null ? "" : `v${versions[i]}`}
									</span>
									<span className="type-small min-w-0 flex-1 text-foreground">
										{entry.action === "preset.created" ? "Created" : "Updated"}
										{fields.length > 0 ? (
											<span className="text-text-muted">{`: ${fields.join(", ")}`}</span>
										) : null}
									</span>
									<span className="type-caption shrink-0 text-text-subtle">
										{`${entry.actor.display} · ${isoDate(entry.at)}`}
									</span>
								</li>
							);
						})}
					</ol>
				);
			}}
		</Surface>
	);
}

/**
 * Where the preset was applied, newest first (contract.presets.applications):
 * the mission, or "Deleted mission" when it is gone; the version applied,
 * marked when the preset has moved on since; who applied it, and the entries
 * it added and removed.
 */
function UsedBy({ preset }: { preset: Preset }) {
	const query = usePresetApplications(preset.id);
	return (
		<Surface
			data-testid="preset-used-by"
			query={query}
			isEmpty={(data) => data.pages.every((page) => page.data.length === 0)}
			loading={<Skeleton className="h-16 w-full" />}
			empty={
				<p
					data-testid="preset-used-by-none"
					className="type-small text-text-muted"
				>
					No mission has applied this team yet.
				</p>
			}
			error={ErrorState}
		>
			{(data) => {
				const rows = data.pages.flatMap((page) => page.data);
				const total = data.pages[0]?.meta.total;
				return (
					<div className="flex flex-col gap-2">
						<ul className="flex flex-col divide-y divide-border">
							{rows.map((app) => {
								const stale = staleSince(app, preset);
								return (
									<li
										key={`${app.missionId}@${app.appliedAt}`}
										data-testid={`preset-application-${app.missionId}`}
										className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2"
									>
										<span className="type-small min-w-0 flex-1">
											{app.mission ? (
												<Link
													to="/missions/$id"
													params={{ id: app.missionId }}
													data-testid={`preset-application-link-${app.missionId}`}
													className="text-foreground underline-offset-4 hover:underline"
												>
													{`${app.mission.type} · ${app.mission.status}`}
												</Link>
											) : (
												<HiddenId
													id={app.missionId}
													label="the deleted mission's id"
												>
													<span className="text-text-muted">
														Deleted mission
													</span>
												</HiddenId>
											)}
										</span>
										<span className="type-mono-small text-foreground">
											{`v${app.presetVersion}`}
											{stale !== null ? (
												<span
													data-testid={`preset-application-stale-${app.missionId}`}
													className="ml-1 text-gate-warn"
												>
													{`now v${stale}`}
												</span>
											) : null}
										</span>
										<span className="type-mono-small tabular-nums text-text-muted">
											{`+${app.added} −${app.removed}`}
											<span className="sr-only">
												{` (${app.added} added, ${app.removed} removed)`}
											</span>
										</span>
										<span className="type-caption text-text-subtle">
											{`${app.actor.display} · ${isoDate(app.appliedAt)}`}
										</span>
									</li>
								);
							})}
						</ul>
						{total !== undefined || query.hasNextPage ? (
							<div className="flex items-center justify-between gap-2">
								<p className="type-caption text-text-subtle tabular-nums">
									{total === undefined
										? ""
										: `Showing ${rows.length} of ${total}`}
								</p>
								{query.hasNextPage ? (
									<Button
										variant="ghost"
										size="sm"
										data-testid="preset-used-by-more"
										disabled={query.isFetchingNextPage}
										onClick={() => query.fetchNextPage()}
									>
										{query.isFetchingNextPage ? "Loading" : "Load more"}
									</Button>
								) : null}
							</div>
						) : null}
					</div>
				);
			}}
		</Surface>
	);
}
