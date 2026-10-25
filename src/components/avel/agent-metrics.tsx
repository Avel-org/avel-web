import type { AgentMetrics } from "avel-server/contract";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { tabsListVariants } from "@/components/ui/tabs";
import { useEngagement } from "@/lib/api/clients";
import { useAgentMetrics } from "@/lib/api/dispatches";
import { formatTokens, formatUsd } from "./dispatch-budget";
import { PanelFooter } from "./panel-footer";
import { SectionPanel } from "./section-panel";
import { ErrorState, Surface } from "./surface";

/*
 * An agent's measures (module 12, GET /api/agent-templates/:id/metrics).
 * Client and internal work are never combined: one origin at a time.
 * Discipline counts every territory and engagement under the agent's name;
 * outcome is one row per territory, template and engagement, and rows are
 * never added up. A measure nothing records yet reads "Not measured", never
 * 0. Runs whose version was reconstructed are left out by the server.
 */

type Origin = AgentMetrics["origin"];

const ORIGINS = [
	{ id: "client", label: "Client work" },
	{ id: "internal", label: "Internal work" },
] as const satisfies readonly { id: Origin; label: string }[];

type DisciplineKey = Exclude<keyof AgentMetrics["discipline"], "notRecorded">;

const DISCIPLINE: readonly {
	id: DisciplineKey;
	label: string;
	means: string;
}[] = [
	{
		id: "dispatches",
		label: "Runs",
		means: "Closed runs with a recorded report.",
	},
	{
		id: "blockersFiled",
		label: "Blockers filed",
		means: "Blockers the agent raised instead of working around.",
	},
	{
		id: "blockedReports",
		label: "Blocked reports",
		means: "Runs that ended reporting they were blocked.",
	},
	{
		id: "edgeMismatches",
		label: "Handoff mismatches",
		means:
			"Files whose hash differed from what the agent before it handed over.",
	},
	{
		id: "testFileWritesCaught",
		label: "Test-file writes caught",
		means: "Writes to test files the exit checkpoint stopped.",
	},
];

/** Measures nothing records yet, in words. */
const NOT_RECORDED_LABEL = {
	boundary_violations: "Boundary violations",
	blockers_absorbed: "Blockers absorbed",
} as const satisfies Record<
	AgentMetrics["discipline"]["notRecorded"][number],
	string
>;

export function AgentMeasures({ agentId }: { agentId: string }) {
	const [origin, setOrigin] = useState<Origin>("client");
	const metrics = useAgentMetrics(agentId, origin);
	return (
		<SectionPanel
			title="Measures"
			description="How the agent keeps to its rules, and how each territory and template went."
			data-testid="agent-measures"
			actions={
				<fieldset
					data-testid="agent-measures-origin"
					className={tabsListVariants({ variant: "default" })}
				>
					<legend className="sr-only">Work</legend>
					{ORIGINS.map((o) => (
						<Button
							key={o.id}
							type="button"
							variant="segment"
							aria-pressed={o.id === origin}
							data-testid={`agent-measures-origin-${o.id}`}
							onClick={() => setOrigin(o.id)}
						>
							{o.label}
						</Button>
					))}
				</fieldset>
			}
			footer={
				<PanelFooter
					data-testid="agent-measures-read-age"
					queries={[metrics]}
				/>
			}
		>
			<Surface
				data-testid="agent-measures-surface"
				query={metrics}
				isEmpty={(m) => m.discipline.dispatches === 0 && m.outcome.length === 0}
				loading={
					<div className="flex flex-col gap-3">
						<Skeleton className="h-20 w-full" />
						<Skeleton className="h-24 w-full" />
					</div>
				}
				empty={
					<p
						data-testid="agent-measures-empty"
						className="type-small text-text-subtle"
					>
						{origin === "client"
							? "No recorded client runs yet."
							: "No recorded internal runs yet."}
					</p>
				}
				error={ErrorState}
			>
				{(m) => <MeasuresView metrics={m} />}
			</Surface>
		</SectionPanel>
	);
}

/** The measures given their data: rendered alone in tests. */
export function MeasuresView({ metrics }: { metrics: AgentMetrics }) {
	const { discipline, outcome } = metrics;
	return (
		<div data-testid="agent-measures-view" className="flex flex-col gap-5">
			<section
				aria-labelledby="agent-discipline"
				className="flex flex-col gap-2"
			>
				<h3 id="agent-discipline" className="type-eyebrow">
					Discipline, across all its work
				</h3>
				<dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{DISCIPLINE.map((d) => (
						<div
							key={d.id}
							data-testid={`agent-discipline-${d.id}`}
							title={d.means}
							className="flex flex-col gap-0.5 rounded-control border border-border px-3 py-2"
						>
							<dt className="type-caption text-text-muted">{d.label}</dt>
							<dd className="type-metric tabular-nums text-text">
								{discipline[d.id].toLocaleString("en-US")}
							</dd>
						</div>
					))}
					{discipline.notRecorded.map((id) => (
						<div
							key={id}
							data-testid={`agent-discipline-${id}`}
							data-recorded="false"
							className="flex flex-col gap-0.5 rounded-control border border-dashed border-border px-3 py-2"
						>
							<dt className="type-caption text-text-muted">
								{NOT_RECORDED_LABEL[id]}
							</dt>
							<dd className="type-small text-text-subtle">Not measured</dd>
						</div>
					))}
				</dl>
			</section>
			<section aria-labelledby="agent-outcome" className="flex flex-col gap-2">
				<h3 id="agent-outcome" className="type-eyebrow">
					Outcome, one territory and template a row
				</h3>
				{outcome.length === 0 ? (
					<p className="type-small text-text-subtle">
						No run has an outcome to measure yet.
					</p>
				) : (
					<ul className="flex flex-col divide-y divide-border rounded-card border border-border">
						{outcome.map((row) => (
							<OutcomeRow
								key={`${row.territory ?? ""}:${row.templateRef ?? ""}:${row.engagementId ?? ""}`}
								row={row}
							/>
						))}
					</ul>
				)}
				<p className="type-caption text-text-subtle">
					Each row stands alone: a territory on one template and engagement is
					never added to another.
				</p>
			</section>
		</div>
	);
}

/** "2 of 3 verified first time", or that none were gated. */
export function firstPassLabel(gated: number, verified: number): string {
	if (gated === 0) return "No mission gated yet";
	return `${verified} of ${gated} verified first time`;
}

function OutcomeRow({ row }: { row: AgentMetrics["outcome"][number] }) {
	const engagement = useEngagement(row.engagementId);
	const perRun = (n: number) => (row.dispatches === 0 ? 0 : n / row.dispatches);
	return (
		<li
			data-testid="agent-outcome-row"
			className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3 py-2.5"
		>
			<span className="flex min-w-48 flex-1 flex-col">
				<span className="type-small font-medium text-text">
					{row.territory ?? "Whole project"}
				</span>
				<span className="flex flex-wrap gap-x-3 type-caption text-text-subtle">
					<span className="type-mono">{row.templateRef ?? "No template"}</span>
					<span>
						{row.engagementId === null
							? "Internal"
							: (engagement.data?.name ?? "An engagement")}
					</span>
				</span>
			</span>
			<span className="type-caption tabular-nums text-text-muted">
				{`${row.dispatches} ${row.dispatches === 1 ? "run" : "runs"}`}
			</span>
			<span className="type-caption tabular-nums text-text-muted">
				{`${formatTokens(Math.round(perRun(row.tokensUsed)))} tokens a run`}
			</span>
			<span className="type-caption tabular-nums text-text-muted">
				{`${formatUsd(perRun(row.spendUsd))} a run`}
			</span>
			<span
				data-testid="agent-outcome-first-pass"
				className="type-caption tabular-nums text-text"
			>
				{firstPassLabel(row.missionsGated, row.firstPassVerified)}
			</span>
		</li>
	);
}
