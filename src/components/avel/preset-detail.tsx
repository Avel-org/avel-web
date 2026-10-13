import { Link } from "@tanstack/react-router";
import type { AgentTemplate, Preset, PresetAgent } from "avel-server/contract";
import { ArrowLeft, Pencil } from "lucide-react";
import { useEffect, useId, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { ApiError } from "@/lib/api";
import { loadedRows, useAgentTemplates } from "@/lib/api/catalog";
import { isoDate } from "@/lib/api/clients";
import {
	agentCount,
	CUT_LABEL,
	type TemplateLabel,
	templateLabel,
	usePreset,
} from "@/lib/api/presets";
import { Wrap } from "./catalog-sample";
import { HiddenId } from "./short-hash";
import { ErrorState, type ErrorStateProps, Surface } from "./surface";

/**
 * The selected preset, fetched by id (contract.presets.get), so a selected
 * preset is a link whatever the list's search, cut or paging. A preset that
 * is gone answers NOT_FOUND, shown by ErrorState with a way back.
 */
export function PresetDetail({
	presetId,
	onEdit,
}: {
	presetId: string;
	onEdit: (preset: Preset) => void;
}) {
	const query = usePreset(presetId);
	return (
		<Surface
			data-testid="preset-detail-surface"
			query={query}
			// A preset is one record: it is either there or an error.
			isEmpty={() => false}
			loading={<PresetDetailSkeleton />}
			empty={null}
			error={DetailError}
		>
			{(preset) => <PresetDetailBody preset={preset} onEdit={onEdit} />}
		</Surface>
	);
}

/** The error, with the way back to the list (the filters are kept). */
function DetailError(props: ErrorStateProps<ApiError>) {
	return (
		<div data-testid="preset-detail-error" className="flex flex-col gap-3">
			<ErrorState {...props} />
			<BackToPresets />
		</div>
	);
}

function BackToPresets({ className }: { className?: string }) {
	return (
		<Button variant="outline" size="sm" className={className} asChild>
			<Link
				to="/presets"
				search={(prev) => ({ q: prev.q, cut: prev.cut })}
				data-testid="preset-back"
				className="self-start"
			>
				<ArrowLeft aria-hidden="true" />
				Back to teams
			</Link>
		</Button>
	);
}

/** The preset itself: header, description, and the squad it saves. */
function PresetDetailBody({
	preset,
	onEdit,
}: {
	preset: Preset;
	onEdit: (preset: Preset) => void;
}) {
	const titleId = useId();
	const agentsId = useId();
	return (
		<article
			aria-labelledby={titleId}
			data-testid="preset-detail"
			className="flex flex-col gap-6"
		>
			{/* Below lg the detail is the page; this is the way back to the list. */}
			<BackToPresets className="lg:hidden" />

			<header className="flex items-start gap-3">
				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<h2 id={titleId} className="type-h2 truncate text-foreground">
						{preset.name}
					</h2>
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
						<Badge variant="tag" data-testid="preset-detail-cut">
							{CUT_LABEL[preset.cut]}
						</Badge>
						<span
							data-testid="preset-detail-version"
							className="type-mono-small text-text-muted"
						>
							{`v${preset.version} · updated ${isoDate(preset.updatedAt)}`}
						</span>
					</div>
				</div>
				<Button
					variant="outline"
					size="sm"
					data-testid="preset-edit"
					onClick={() => onEdit(preset)}
				>
					<Pencil aria-hidden="true" />
					Edit
				</Button>
			</header>

			<p data-testid="preset-detail-description" className="type-body">
				{preset.description ?? (
					<span className="text-text-subtle">No description</span>
				)}
			</p>

			<section aria-labelledby={agentsId} className="flex flex-col gap-3">
				<div className="flex items-baseline justify-between gap-2">
					<h3 id={agentsId} className="type-panel-title text-foreground">
						Agents
					</h3>
					<span
						data-testid="preset-detail-agent-count"
						className="type-caption text-text-subtle tabular-nums"
					>
						{agentCount(preset.agents.length)}
					</span>
				</div>
				{preset.agents.length === 0 ? (
					<p
						data-testid="preset-agents-none"
						className="type-small text-text-muted"
					>
						This team saves no agents. Applying it adds nothing to a roster.
					</p>
				) : (
					<PresetAgentsTable agents={preset.agents} />
				)}
				<p className="type-caption text-text-subtle">
					Token estimates are defaults. Every mission estimates again before
					dispatch.
				</p>
			</section>
		</article>
	);
}

export type Names =
	| { status: "pending" }
	| { status: "error" }
	| {
			status: "success";
			byId: ReadonlyMap<string, Pick<AgentTemplate, "name" | "slug">>;
	  };

/** The whole template catalog, every page, or where reading it stands. */
export type AllTemplates =
	| { status: "pending" }
	| { status: "error" }
	| {
			status: "success";
			byId: ReadonlyMap<string, AgentTemplate>;
			list: AgentTemplate[];
	  };

/**
 * Every template in the catalog. Every page is fetched, and the result is
 * pending until the last one is in, so a template past the first page is
 * never mistaken for an unknown one or left out of a check.
 */
export function useAllTemplates(): AllTemplates {
	const templates = useAgentTemplates();
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = templates;
	useEffect(() => {
		if (hasNextPage && !isFetchingNextPage) fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const data = templates.data;
	const list = useMemo(() => (data ? loadedRows(data) : []), [data]);
	const byId = useMemo(() => new Map(list.map((t) => [t.id, t])), [list]);
	if (templates.status === "error") return { status: "error" };
	if (templates.status === "pending" || hasNextPage)
		return { status: "pending" };
	return { status: "success", byId, list };
}

/**
 * A PresetAgent carries only its template's id, so the names come from the
 * whole catalog (useAllTemplates).
 */
export function useTemplateNames(): Names {
	const all = useAllTemplates();
	return all.status === "success"
		? { status: "success", byId: all.byId }
		: { status: all.status };
}

function PresetAgentsTable({ agents }: { agents: PresetAgent[] }) {
	const names = useTemplateNames();
	return (
		<div className="flex flex-col gap-2">
			{names.status === "error" ? (
				<p
					data-testid="preset-names-error"
					className="type-small text-text-muted"
				>
					Agent names could not be loaded, so agents show their short id.
				</p>
			) : null}
			<Table data-testid="preset-agents">
				<TableHeader>
					<TableRow>
						{/* Prose headers and cells wrap so the table fits a lg pane
						    (728e777); mono values (waves, slugs, tokens) stay on one line. */}
						<TableHead>
							<Wrap>Agent</Wrap>
						</TableHead>
						<TableHead>Waves</TableHead>
						<TableHead>
							<Wrap>Territory</Wrap>
						</TableHead>
						<TableHead>
							<Wrap>Writable paths</Wrap>
						</TableHead>
						<TableHead className="text-right">
							<Wrap>Est. tokens</Wrap>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{agents.map((agent, i) => (
						<TableRow
							// A template sits at most once per territory (409 CONFLICT), so
							// the pair is unique.
							key={`${agent.agentTemplateId}:${agent.territory ?? ""}`}
							data-testid={`preset-agent-${i}`}
						>
							<TableCell>
								<TemplateCell id={agent.agentTemplateId} names={names} />
							</TableCell>
							<TableCell className="type-mono-small">
								{agent.waves.length === 0 ? (
									<Muted>None</Muted>
								) : (
									agent.waves.join(" · ")
								)}
							</TableCell>
							<TableCell
								className="type-small"
								data-testid={`preset-agent-territory-${i}`}
							>
								<Wrap>{agent.territory ?? <Muted>Whole project</Muted>}</Wrap>
							</TableCell>
							<TableCell
								className="type-mono-small"
								data-testid={`preset-agent-paths-${i}`}
							>
								{agent.writablePaths === null ? (
									<Wrap>
										<Muted>Agent's</Muted>
									</Wrap>
								) : (
									<span className="flex flex-col">
										{agent.writablePaths.map((path) => (
											<span key={path}>{path}</span>
										))}
									</span>
								)}
							</TableCell>
							<TableCell className="type-mono-small text-right tabular-nums">
								{agent.estimatedTokens === null ? (
									<Muted>Not set</Muted>
								) : (
									agent.estimatedTokens.toLocaleString("en-US")
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function TemplateCell({ id, names }: { id: string; names: Names }) {
	if (names.status === "pending") {
		return (
			<Skeleton data-testid="preset-template-loading" className="h-4 w-32" />
		);
	}
	const label: TemplateLabel =
		names.status === "success"
			? templateLabel(id, names.byId)
			: templateLabel(id, new Map());
	if (label.known) {
		return (
			<span className="flex flex-col">
				<span className="type-body text-foreground">
					<Wrap>{label.name}</Wrap>
				</span>
				<span className="type-mono-small text-text-subtle">{label.slug}</span>
			</span>
		);
	}
	return (
		<HiddenId
			id={label.id}
			label="the agent's id"
			data-testid="preset-template-unknown"
		>
			<span className="type-body text-text-muted">
				{names.status === "error" ? "Agent" : "Unknown agent"}
			</span>
		</HiddenId>
	);
}

function Muted({ children }: { children: string }) {
	return <span className="text-text-subtle">{children}</span>;
}

function PresetDetailSkeleton() {
	return (
		<div data-testid="preset-detail-skeleton" className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<Skeleton className="h-6 w-56" />
				<Skeleton className="h-4 w-40" />
			</div>
			<Skeleton className="h-4 w-full max-w-md" />
			<div className="flex flex-col gap-2">
				{[0, 1, 2].map((i) => (
					<Skeleton key={i} className="h-8 w-full" />
				))}
			</div>
		</div>
	);
}
