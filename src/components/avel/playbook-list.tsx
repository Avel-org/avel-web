import { Link } from "@tanstack/react-router";
import type {
	Deliverable,
	GatePolicy,
	Playbook,
	PlaybookGate,
} from "avel-server/contract";
import { WAVES } from "avel-server/contract";
import { Rows3, SquareKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { catalogTotal } from "@/lib/api/catalog";
import { loadedPlaybooks, type usePlaybooks } from "@/lib/api/playbooks";
import { cn } from "@/lib/utils";
import { linkFor } from "@/shell/nav";
import { type DataColumn, DataTable } from "./data-table";
import { EmptyState } from "./empty-state";
import { ErrorState, Surface } from "./surface";
import type { ViewOption } from "./view-toggle";

/*
 * Playbooks, /playbooks: the process each mission type follows (ROUTES.md,
 * DATA-CONTRACTS-V2.md Playbook), read live from playbooks.list. Read-only:
 * playbook writes are not specced, so the page has no write controls.
 */

/** Each deliverable in words. Keyed on the contract's enum. */
export const DELIVERABLE_LABEL = {
	pr: "Pull request",
	report: "Report",
	recommendation: "Recommendation",
} as const satisfies Record<Deliverable, string>;

/** Each gate policy in words, as stored. Keyed on the contract's enum. */
export const POLICY_LABEL = {
	mandatory: "Mandatory",
	warn: "Warn",
} as const satisfies Record<GatePolicy, string>;

/** "4 mandatory, 2 warn"; a policy no gate has is left out. */
export function gateSummary(gates: readonly PlaybookGate[]): string {
	if (gates.length === 0) return "No gates";
	const count = (policy: GatePolicy) =>
		gates.filter((g) => g.policy === policy).length;
	return (["mandatory", "warn"] as const)
		.filter((policy) => count(policy) > 0)
		.map((policy) => `${count(policy)} ${policy}`)
		.join(", ");
}

/** The top bar's count: "1 playbook", "3 playbooks". */
export function playbookCountLabel(total: number): string {
	return total === 1 ? "1 playbook" : `${total} playbooks`;
}

const COLUMNS: DataColumn<Playbook>[] = [
	{
		id: "name",
		header: "Playbook",
		cell: (row) => (
			<Link
				to="/playbooks/$missionType"
				params={{ missionType: row.missionType }}
				data-testid={`playbook-row-link-${row.missionType}`}
				className="font-medium text-foreground underline-offset-4 hover:underline"
			>
				{row.name}
			</Link>
		),
	},
	{
		id: "missionType",
		header: "Mission type",
		mono: true,
		cell: (row) => row.missionType,
	},
	{
		id: "deliverable",
		header: "Deliverable",
		width: "10rem",
		cell: (row) => DELIVERABLE_LABEL[row.deliverable],
	},
	{
		id: "waves",
		header: "Waves",
		width: "8rem",
		mono: true,
		cell: (row) =>
			row.wavesApplicable.length > 0 ? (
				row.wavesApplicable.join(" ")
			) : (
				<span className="font-sans text-text-subtle">None</span>
			),
	},
	{
		id: "gates",
		header: "Gates",
		width: "11rem",
		cell: (row) => (
			<span data-testid="playbook-gate-summary" className="text-text-muted">
				{gateSummary(row.gates)}
			</span>
		),
	},
	{
		id: "version",
		header: "Version",
		width: "5rem",
		align: "end",
		mono: true,
		cell: (row) => `v${row.version}`,
	},
];

/** Board (cards, the default) or Table (the rows), as the URL's `view` says. */
export type PlaybookView = "board" | "table";

/** Board, then Table: the options for the shared view switch. */
export const PLAYBOOK_VIEWS = [
	{ id: "board", label: "Board", icon: SquareKanban },
	{ id: "table", label: "Table", icon: Rows3 },
] as const satisfies readonly ViewOption<PlaybookView>[];

/** The list, a page at a time. The route owns the query; this renders it. */
export function PlaybookList({
	query,
	view = "board",
}: {
	query: ReturnType<typeof usePlaybooks>;
	view?: PlaybookView;
}) {
	return (
		<div data-testid="playbooks" className="flex flex-col gap-4 pb-6">
			<Surface
				data-testid="playbook-list"
				query={query}
				isEmpty={(data) => loadedPlaybooks(data).length === 0}
				loading={<PlaybookListSkeleton />}
				empty={
					<EmptyState
						data-testid="playbooks-empty"
						icon={linkFor("/playbooks").icon}
						title="No playbooks yet"
						description="A playbook sets the waves, gates and deliverable for one kind of mission. A mission whose type has no playbook shows none."
					/>
				}
				error={ErrorState}
			>
				{(data) => {
					const rows = loadedPlaybooks(data);
					const total = catalogTotal(data);
					return (
						<div className="flex flex-col gap-2">
							{view === "table" ? (
								<DataTable
									label="Playbooks"
									data-testid="playbook-table"
									columns={COLUMNS}
									rows={rows}
									getRowId={(row) => row.id}
								/>
							) : (
								<PlaybookBoard playbooks={rows} />
							)}
							{total !== undefined || query.hasNextPage ? (
								<div className="flex items-center justify-between gap-2 px-3">
									{total === undefined ? (
										<span />
									) : (
										<p
											data-testid="playbooks-showing"
											className="type-caption text-text-subtle tabular-nums"
										>
											{`Showing ${rows.length} of ${total}`}
										</p>
									)}
									{query.hasNextPage ? (
										<Button
											variant="ghost"
											size="sm"
											data-testid="playbooks-load-more"
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
		</div>
	);
}

/** Three rows in the table's shape: few, so it does not promise many. */
function PlaybookListSkeleton() {
	return (
		<div data-testid="playbook-list-skeleton" className="flex flex-col gap-3">
			{[0, 1, 2].map((i) => (
				<div key={i} className="flex items-center gap-6 px-3 py-2">
					<Skeleton className="h-4 w-40" />
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-4 w-20" />
					<Skeleton className="ml-auto h-4 w-10" />
				</div>
			))}
		</div>
	);
}

/**
 * The board: a card per playbook, each a link to its builder. A strip of the
 * five waves (the ones it runs filled), its gate count by policy and its
 * deliverable, so the shape of the process reads before opening it.
 */
export function PlaybookBoard({
	playbooks,
}: {
	playbooks: readonly Playbook[];
}) {
	return (
		<ul
			data-testid="playbook-board"
			className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
		>
			{playbooks.map((playbook) => {
				const runs = new Set<string>(playbook.wavesApplicable);
				return (
					<li key={playbook.id}>
						<Link
							to="/playbooks/$missionType"
							params={{ missionType: playbook.missionType }}
							data-testid={`playbook-card-${playbook.missionType}`}
							className="plate plate-interactive flex h-full flex-col gap-3 rounded-md p-4"
						>
							<span className="flex items-baseline justify-between gap-2">
								<span className="type-body font-medium text-foreground">
									{playbook.name}
								</span>
								<span className="type-mono-small text-text-subtle">
									{`v${playbook.version}`}
								</span>
							</span>
							<span className="type-mono-small text-text-muted">
								{playbook.missionType}
							</span>
							<span
								data-testid={`playbook-card-waves-${playbook.missionType}`}
								className="flex gap-1"
							>
								{WAVES.map((wave) => (
									<span
										key={wave}
										data-wave={wave}
										data-runs={runs.has(wave)}
										className={cn(
											"flex h-6 flex-1 items-center justify-center rounded-xs border type-mono-small",
											runs.has(wave)
												? "border-accent bg-accent-soft text-foreground"
												: "border-dashed border-border text-text-subtle",
										)}
									>
										{wave}
									</span>
								))}
								<span className="sr-only">
									{runs.size === 0
										? "Runs no waves."
										: `Runs waves ${playbook.wavesApplicable.join(", ")}.`}
								</span>
							</span>
							<span className="mt-auto flex flex-wrap items-center justify-between gap-2 type-small text-text-muted">
								<span data-testid="playbook-card-gates">
									{gateSummary(playbook.gates)}
								</span>
								<span>{DELIVERABLE_LABEL[playbook.deliverable]}</span>
							</span>
						</Link>
					</li>
				);
			})}
		</ul>
	);
}
