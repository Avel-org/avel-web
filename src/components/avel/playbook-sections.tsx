import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	type AgentTemplate,
	computeCoherence,
	earliestWave,
	type MissionDetail,
	type MissionListItem,
	type MissionPlan,
	type Playbook,
	type Preset,
	WAVES,
	type Wave,
} from "avel-server/contract";
import { BookOpen } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiClient } from "@/lib/api";
import { loadedRows, useAgentTemplates } from "@/lib/api/catalog";
import {
	presetCoherenceInput,
	templateQuery,
	verdictOf,
} from "@/lib/api/coherence";
import { missionPlanQuery } from "@/lib/api/mission-plans";
import { usePreset } from "@/lib/api/presets";
import { cn } from "@/lib/utils";
import { missionLabel } from "@/shell/command-search";
import { DetailModal } from "./action-modal";
import { MissionStatusPill } from "./mission-columns";
import { missionDetailQuery, rowsOf, useMissionList } from "./mission-data";
import { PanelFooter } from "./panel-footer";
import { blockCopy, useCoherence, warningCopy } from "./playbook-coherence";
import { GATE_DOCS, POLICY_DOCS, VOCABULARY_DOC } from "./playbook-gate-docs";
import { DELIVERABLE_LABEL, POLICY_LABEL } from "./playbook-list";
import type { PlaybookDraft } from "./playbook-pipeline";
import { SectionPanel } from "./section-panel";
import { StatusGlyph } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/*
 * The builder's sections below the canvas (ruling 36): the gates with what
 * the docs say they check, the waves with who can staff them, the inputs a
 * mission must carry, the default preset's fit, and the missions of this
 * type. Each reads the draft where an edit changes the answer, and says
 * "unknown" where the contract cannot answer, never a guess.
 */

export function PlaybookSections({
	playbook,
	draft,
}: {
	playbook: Playbook;
	draft: PlaybookDraft;
}) {
	return (
		<div data-testid="playbook-sections" className="flex flex-col gap-6">
			<GatesSection draft={draft} />
			<div className="grid items-start gap-6 xl:grid-cols-2">
				<WavesSection draft={draft} />
				<PresetFitSection playbook={playbook} draft={draft} />
			</div>
			<InputsSection draft={draft} />
			<MissionsSection playbook={playbook} draft={draft} />
		</div>
	);
}

// ---------------------------------------------------------------------------
// Gates.

function GatesSection({ draft }: { draft: PlaybookDraft }) {
	return (
		<SectionPanel
			title="Gates"
			description="Each gate this playbook declares, its policy, and what avel-server's docs say it checks."
			data-testid="playbook-section-gates"
		>
			{draft.gates.length === 0 ? (
				<p className="type-small text-text-subtle">No gates declared.</p>
			) : (
				<ul className="flex flex-col divide-y divide-border">
					{draft.gates.map(({ gate, policy }) => {
						const doc = GATE_DOCS[gate];
						return (
							<li
								key={gate}
								data-testid={`playbook-gate-row-${gate}`}
								className="grid gap-2 py-3 md:grid-cols-[10rem_7rem_minmax(0,1fr)]"
							>
								<span className="type-mono text-foreground">{gate}</span>
								<span>
									<Badge variant="outline">{POLICY_LABEL[policy]}</Badge>
								</span>
								{doc ? (
									<blockquote
										data-testid={`playbook-gate-doc-${gate}`}
										className="flex flex-col gap-1 border-l border-border-strong pl-3"
									>
										<p className="type-small text-foreground">{doc.text}</p>
										<cite className="type-caption not-italic text-text-subtle">
											{doc.source}
										</cite>
									</blockquote>
								) : (
									<Surface
										data-testid={`playbook-gate-doc-${gate}`}
										notBuilt={{
											title: "What this gate checks",
											what: "avel-server's docs don't define this gate yet. Module 9, the gate, will: its findings and decide() say what passes.",
											needs: [],
											compact: true,
										}}
									/>
								)}
							</li>
						);
					})}
				</ul>
			)}
			<GateDocsLink />
		</SectionPanel>
	);
}

/** The gate vocabulary, quoted from the docs, in a modal. */
export function GateDocsLink() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button
				variant="ghost"
				size="sm"
				className="mt-3 self-start"
				data-testid="playbook-gate-docs-open"
				onClick={() => setOpen(true)}
			>
				<BookOpen aria-hidden="true" />
				Read about gates
			</Button>
			<DetailModal
				open={open}
				onOpenChange={setOpen}
				title="Gates"
				description="What avel-server's docs say about the gate vocabulary and its policies."
				data-testid="playbook-gate-docs"
			>
				{[VOCABULARY_DOC, ...POLICY_DOCS].map((doc) => (
					<blockquote
						key={doc.source}
						className="flex flex-col gap-1 border-l border-border-strong pl-3"
					>
						<p className="type-body text-foreground">{doc.text}</p>
						<cite className="type-caption not-italic text-text-subtle">
							{doc.source}
						</cite>
					</blockquote>
				))}
			</DetailModal>
		</>
	);
}

// ---------------------------------------------------------------------------
// Waves.

/** Each wave's templates, by the waves a template declares by default. */
export function templatesByWave(
	templates: readonly Pick<AgentTemplate, "slug" | "name" | "waveDefaults">[],
): Record<Wave, string[]> {
	const out = Object.fromEntries(
		WAVES.map((w) => [w, [] as string[]]),
	) as Record<Wave, string[]>;
	for (const t of templates) {
		for (const w of t.waveDefaults) out[w].push(t.name);
	}
	for (const w of WAVES) out[w].sort((a, b) => a.localeCompare(b));
	return out;
}

function WavesSection({ draft }: { draft: PlaybookDraft }) {
	const templates = useAgentTemplates();
	return (
		<SectionPanel
			title="Waves and who can staff them"
			description="Agents by the waves they declare. A wave this playbook runs needs one of them on the roster."
			data-testid="playbook-section-waves"
			footer={
				<PanelFooter
					data-testid="playbook-waves-read-age"
					queries={[templates]}
				/>
			}
		>
			<Surface
				data-testid="playbook-waves-templates"
				query={templates}
				loading={<Skeleton className="h-24 w-full" />}
				isEmpty={(data) => loadedRows(data).length === 0}
				empty={<p className="type-small text-text-subtle">No agents yet.</p>}
				error={ErrorState}
			>
				{(data) => {
					const byWave = templatesByWave(loadedRows(data));
					return (
						<ol className="grid grid-cols-5 gap-2">
							{WAVES.map((wave) => {
								const runs = draft.wavesApplicable.includes(wave);
								return (
									<li
										key={wave}
										data-testid={`playbook-wave-col-${wave}`}
										data-runs={runs}
										className={cn(
											"flex min-w-0 flex-col gap-1.5 rounded-control border p-2",
											runs
												? "border-border-strong bg-app-well"
												: "border-dashed border-border",
										)}
									>
										<span className="type-mono text-foreground">{wave}</span>
										{byWave[wave].length === 0 ? (
											<span className="type-caption text-text-subtle">
												None
											</span>
										) : (
											<ul className="flex flex-col gap-0.5">
												{byWave[wave].map((name) => (
													<li
														key={name}
														className="truncate type-caption text-text-muted"
														title={name}
													>
														{name}
													</li>
												))}
											</ul>
										)}
										{runs && byWave[wave].length === 0 ? (
											<span
												data-testid={`playbook-wave-unstaffable-${wave}`}
												className="inline-flex items-center gap-1 type-caption text-text-muted"
											>
												<StatusGlyph tone="warn" />
												No agent declares it
											</span>
										) : null}
									</li>
								);
							})}
						</ol>
					);
				}}
			</Surface>
		</SectionPanel>
	);
}

// ---------------------------------------------------------------------------
// Inputs: the deliverable and required fields.

export type FieldCheck = "met" | "missing" | "unknown";

/**
 * How a required field is checked against one mission, from what the
 * contract returns. Only the fields the mission or its plan can answer have
 * a check; every other field is unknown, never guessed.
 */
export const FIELD_RULES: Record<
	string,
	{
		rule: string;
		check: (m: MissionDetail, plan: MissionPlan | undefined) => FieldCheck;
	}
> = {
	brief: {
		rule: "The mission's plan has a brief in the contract's shape.",
		check: (_m, plan) =>
			plan === undefined ? "unknown" : plan.brief ? "met" : "missing",
	},
	repo_url: {
		rule: "The mission names a repository.",
		check: (m) => (m.repoUrl.trim() === "" ? "missing" : "met"),
	},
	repoUrl: {
		rule: "The mission names a repository.",
		check: (m) => (m.repoUrl.trim() === "" ? "missing" : "met"),
	},
};

export function fieldCheck(
	field: string,
	mission: MissionDetail,
	plan: MissionPlan | undefined,
): FieldCheck {
	return FIELD_RULES[field]?.check(mission, plan) ?? "unknown";
}

function InputsSection({ draft }: { draft: PlaybookDraft }) {
	return (
		<SectionPanel
			title="Deliverable and required fields"
			description="What a mission of this type produces, and what it must carry before it runs."
			data-testid="playbook-section-inputs"
		>
			<dl className="flex flex-col gap-3">
				<div className="flex flex-col gap-0.5">
					<dt className="type-caption text-text-subtle">Delivers</dt>
					<dd className="type-small text-foreground">
						{DELIVERABLE_LABEL[draft.deliverable]}
					</dd>
				</div>
				<div className="flex flex-col gap-1.5">
					<dt className="type-caption text-text-subtle">Required fields</dt>
					{draft.requiredFields.length === 0 ? (
						<dd className="type-small text-text-subtle">None required.</dd>
					) : (
						draft.requiredFields.map((field) => (
							<dd
								key={field}
								data-testid={`playbook-field-rule-${field}`}
								className="flex flex-wrap items-baseline gap-2"
							>
								<Badge variant="tag">{field}</Badge>
								<span className="type-small text-text-muted">
									{FIELD_RULES[field]?.rule ??
										"Unknown: the contract can't answer this for a mission yet."}
								</span>
							</dd>
						))
					)}
				</div>
			</dl>
		</SectionPanel>
	);
}

// ---------------------------------------------------------------------------
// The default preset's fit.

function PresetFitSection({
	playbook,
	draft,
}: {
	playbook: Playbook;
	draft: PlaybookDraft;
}) {
	const preset = usePreset(playbook.defaultPresetId);
	return (
		<SectionPanel
			title="Default team"
			description="The squad a mission of this type starts from, run through coherence against this playbook."
			data-testid="playbook-section-preset"
			footer={
				<PanelFooter
					data-testid="playbook-preset-read-age"
					queries={[preset]}
				/>
			}
		>
			<Surface
				data-testid="playbook-preset-fit"
				query={preset}
				loading={<Skeleton className="h-20 w-full" />}
				empty={null}
				isEmpty={() => false}
				error={ErrorState}
			>
				{(data) => <PresetFit preset={data} draft={draft} />}
			</Surface>
		</SectionPanel>
	);
}

function PresetFit({
	preset,
	draft,
}: {
	preset: Preset;
	draft: PlaybookDraft;
}) {
	const api = useApiClient();
	const ids = [...new Set(preset.agents.map((a) => a.agentTemplateId))];
	const templates = useQueries({
		queries: ids.map((id) => templateQuery(api, id)),
	});
	const loaded = new Map<string, AgentTemplate>();
	for (const t of templates) if (t.data) loaded.set(t.data.id, t.data);
	const input = presetCoherenceInput(preset, loaded);
	const result = input ? computeCoherence(input, draft) : null;
	const first = earliestWave(draft);
	const perWave = Object.fromEntries(
		WAVES.map((w) => [
			w,
			preset.agents.filter((a) => a.waves.includes(w)).length,
		]),
	) as Record<Wave, number>;
	return (
		<div className="flex flex-col gap-3">
			<p className="flex flex-wrap items-baseline gap-2">
				<span className="type-small font-medium text-foreground">
					{preset.name}
				</span>
				<span className="type-mono text-text-subtle">{`v${preset.version}`}</span>
				<Link
					to="/presets"
					search={{ preset: preset.id }}
					data-testid="playbook-preset-open"
					className="py-1.5 -my-1.5 ml-auto type-small text-accent-text underline-offset-4 hover:underline"
				>
					Open team
				</Link>
			</p>
			<ol
				data-testid="playbook-preset-board"
				className="grid grid-cols-5 gap-1"
			>
				{WAVES.map((wave) => (
					<li
						key={wave}
						data-wave={wave}
						data-agents={perWave[wave]}
						className={cn(
							"flex flex-col items-center gap-0.5 rounded-xs border py-1",
							draft.wavesApplicable.includes(wave)
								? "border-border-strong bg-app-well"
								: "border-dashed border-border",
						)}
					>
						<span className="type-mono text-foreground">{wave}</span>
						<span className="type-caption text-text-muted">
							{perWave[wave]}
						</span>
					</li>
				))}
			</ol>
			{result === null ? (
				<Skeleton className="h-4 w-48" />
			) : (
				<div
					data-testid="playbook-preset-verdict"
					data-verdict={verdictOf(result)}
					className="flex flex-col gap-1.5"
				>
					{result.block ? (
						<p className="inline-flex items-start gap-1.5 type-small text-foreground">
							<StatusGlyph tone="block" className="mt-1" />
							{blockCopy(result.block)}
						</p>
					) : (
						<p className="inline-flex items-center gap-1.5 type-small text-foreground">
							<StatusGlyph tone="pass" />
							{`Staffs wave ${first}, the first this playbook runs.`}
						</p>
					)}
					{result.warnings.map((w) => (
						<p
							key={w.code}
							className="inline-flex items-start gap-1.5 type-small text-text-muted"
						>
							<StatusGlyph tone="warn" className="mt-1" />
							{warningCopy(w)}
						</p>
					))}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Missions of this type.

/** A list item is of this type only on an exact match: `q` is a substring. */
export const ofType = (rows: readonly MissionListItem[], missionType: string) =>
	rows.filter((m) => m.type === missionType);

function MissionsSection({
	playbook,
	draft,
}: {
	playbook: Playbook;
	draft: PlaybookDraft;
}) {
	const base = {
		q: playbook.missionType,
		sort: "lastActivity",
		includeArchived: false,
	} as const;
	const client = useMissionList({ ...base, origin: "client" });
	const internal = useMissionList({ ...base, origin: "internal" });
	const missions = [
		...ofType(rowsOf(client), playbook.missionType),
		...ofType(rowsOf(internal), playbook.missionType),
	];
	const pending = client.status === "pending" || internal.status === "pending";
	const failed =
		client.status === "error"
			? client
			: internal.status === "error"
				? internal
				: null;
	return (
		<SectionPanel
			title="Missions of this type"
			description="Each one's status, the required fields it carries, and its coherence against the stored playbook."
			data-testid="playbook-section-missions"
			footer={
				<PanelFooter
					data-testid="playbook-missions-read-age"
					queries={[client, internal]}
				/>
			}
		>
			{failed?.error ? (
				<ErrorState
					error={failed.error}
					retry={() => failed.refetch()}
					retrying={failed.isFetching}
				/>
			) : pending ? (
				<Skeleton className="h-16 w-full" />
			) : missions.length === 0 ? (
				<p className="type-small text-text-subtle">
					No missions of this type yet.
				</p>
			) : (
				<table className="w-full text-left">
					<caption className="sr-only">
						Missions of type {playbook.missionType}
					</caption>
					<thead>
						<tr className="type-caption text-text-subtle">
							<th className="py-1.5 font-normal">Mission</th>
							<th className="py-1.5 font-normal">Status</th>
							{draft.requiredFields.map((f) => (
								<th key={f} className="py-1.5 font-mono font-normal">
									{f}
								</th>
							))}
							<th className="py-1.5 font-normal">Coherence</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						{missions.map((m) => (
							<MissionRow key={m.id} item={m} fields={draft.requiredFields} />
						))}
					</tbody>
				</table>
			)}
		</SectionPanel>
	);
}

const CHECK_TONE = { met: "pass", missing: "block", unknown: "stale" } as const;
const CHECK_WORD = {
	met: "Met",
	missing: "Missing",
	unknown: "Unknown",
} as const;
const VERDICT_TONE = { clear: "pass", warn: "warn", block: "block" } as const;
const VERDICT_WORD = {
	clear: "Clear",
	warn: "Warns",
	block: "Blocked",
} as const;

function MissionRow({
	item,
	fields,
}: {
	item: MissionListItem;
	fields: readonly string[];
}) {
	const api = useApiClient();
	const detail = useQuery(missionDetailQuery(api, item.id));
	const plan = useQuery(missionPlanQuery(api, item.id));
	return (
		<tr data-testid={`playbook-mission-${item.id}`}>
			<td className="py-2">
				<Link
					to="/missions/$id/playbook"
					params={{ id: item.id }}
					className="py-1.5 -my-1.5 type-small text-accent-text underline-offset-4 hover:underline"
				>
					{missionLabel(item)}
				</Link>
			</td>
			<td className="py-2">
				<MissionStatusPill status={item.status} />
			</td>
			{fields.map((f) => {
				const check: FieldCheck = detail.data
					? fieldCheck(f, detail.data, plan.data)
					: "unknown";
				return (
					<td key={f} className="py-2" data-check={check} data-field={f}>
						<span className="inline-flex items-center gap-1 type-caption text-text-muted">
							<StatusGlyph tone={CHECK_TONE[check]} />
							{CHECK_WORD[check]}
						</span>
					</td>
				);
			})}
			<td className="py-2">
				<MissionVerdict item={item} />
			</td>
		</tr>
	);
}

function MissionVerdict({ item }: { item: MissionListItem }) {
	const result = useCoherence(item, item.type);
	if (result.status === "pending") return <Skeleton className="h-4 w-16" />;
	if (result.status === "error")
		return <span className="type-caption text-text-subtle">Unknown</span>;
	const verdict = verdictOf(result.data);
	return (
		<span
			data-verdict={verdict}
			className="inline-flex items-center gap-1 type-caption text-text-muted"
		>
			<StatusGlyph tone={VERDICT_TONE[verdict]} />
			{VERDICT_WORD[verdict]}
		</span>
	);
}
