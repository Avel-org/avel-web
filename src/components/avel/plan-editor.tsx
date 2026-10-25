import type { Brief, MissionPlan } from "avel-server/contract";
import { ListChecks, Lock, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api";
import {
	type ApprovedLocks,
	approvedChangeIssues,
	type BriefDraft,
	type CheckIssue,
	type IssueTarget,
	issuesByTarget,
	locksOf,
	type MissionPlanBody,
	nextId,
	occurrenceKeys,
	type PlanDraft,
	planAnchor,
	planBodyOf,
	planDraftOf,
	planShapeProblems,
	planValidationIssues,
} from "@/lib/api/mission-plans";
import { cn } from "@/lib/utils";
import { Field, FormError } from "./client-form";
import { CodeView } from "./code-view";
import { EmptyState } from "./empty-state";
import { groupBrief, type RequirementGroup } from "./mission-details";
import { SectionPanel } from "./section-panel";
import { StatusGlyph, StatusPill } from "./status-pill";
import { LatestCommit, TemplatePicker } from "./template-picker";

/**
 * The plan anchor a Resolve link landed on, taken out of the URL so it is
 * used once: the editor remounts after every save, and focus must not jump
 * back to it then. Null when the hash is not a plan anchor.
 */
export function consumePlanHash(
	location: Pick<Location, "hash" | "pathname" | "search">,
	history: Pick<History, "replaceState">,
): string | null {
	const id = location.hash.slice(1);
	if (!id.startsWith("plan-")) return null;
	history.replaceState(null, "", `${location.pathname}${location.search}`);
	return id;
}

/**
 * Where a Resolve link landed (audit F4): the item a plan-check issue points
 * at is marked data-landed="issue", and every anchored item draws a warn ring
 * while it carries that mark, so the operator sees which field the issue is
 * about, not only where the page scrolled to. The mark stays until the
 * editor remounts, after the next save.
 */
export const LANDED_RING =
	"data-[landed=issue]:outline-2 data-[landed=issue]:outline-offset-2 data-[landed=issue]:outline-gate-warn-solid";

/** Mark the landed item, bring it into view and focus its first control. */
export function landOn(item: HTMLElement): void {
	item.dataset.landed = "issue";
	item.scrollIntoView({ block: "center" });
	const control = item.querySelector<HTMLElement>(
		"textarea, input, button:not([disabled])",
	);
	control?.focus();
}

/** Why an approved item cannot be edited, shown beside its lock. */
export const APPROVED_LOCK_REASON =
	"Approved at intake. It cannot change or be removed; add a new one instead.";

/**
 * The plan editor: summary, requirements with their criteria, modules with
 * the requirements they own, and the template. Presentational: the sheet
 * owns the request. What is locked comes from the plan's approvedBrief.
 *
 * The plan check (check.issues) is the server's, run on the saved plan. It
 * shows as a to-do list, each issue also on its field, and never blocks a
 * save. Only the body's shape, the contract's own schema, is checked before
 * sending, because the server would refuse it with a 400 anyway.
 */
export function PlanEditor({
	plan,
	readOnlyReason,
	onStartPlan,
	landed = false,
	pending,
	error,
	onSave,
}: {
	/** Its approvedBrief's summary, requirements and criteria are locked. */
	plan: MissionPlan;
	/** Set when nothing can change, with the reason shown. */
	readOnlyReason: string | null;
	pending: boolean;
	error: ApiError | null;
	onSave: (body: MissionPlanBody) => void;
	/** Offered on a brief that predates the shape, when a plan may be started. */
	onStartPlan?: () => void;
	/** The plan was just started: highlight it, and put focus on Add requirement. */
	landed?: boolean;
}) {
	const initial = planDraftOf(plan);
	const [draft, setDraft] = useState<PlanDraft | null>(initial);
	const [tried, setTried] = useState(false);
	// The body the last save sent: a refusal's paths are positions in it.
	const [sent, setSent] = useState<MissionPlanBody | null>(null);
	const locks = useMemo(
		() => locksOf(plan.approvedBrief),
		[plan.approvedBrief],
	);

	// A Resolve link lands on /plan#<anchor>: bring that item into view and
	// put focus on the first thing in it that can be edited.
	useEffect(() => {
		const id = consumePlanHash(window.location, window.history);
		if (id === null) return;
		const item = document.getElementById(id);
		if (item) landOn(item);
	}, []);

	if (draft === null || initial === null) {
		return (
			<div className="flex flex-col gap-6">
				<EmptyState
					data-testid="plan-no-brief"
					icon={ListChecks}
					title="No plan yet"
					description={
						onStartPlan
							? "This mission's brief was stored before plans had their current shape. Start a plan to turn it into one you can edit."
							: "This mission's brief was stored before plans had their current shape, so it can't be edited here."
					}
					action={
						onStartPlan ? (
							<Button data-testid="plan-start" onClick={onStartPlan}>
								<Plus aria-hidden="true" />
								Start a plan
							</Button>
						) : readOnlyReason ? (
							// Why no plan can be started: the mission is past draft.
							<p
								data-testid="plan-no-brief-reason"
								className="max-w-md type-caption text-text-subtle"
							>
								{readOnlyReason}
							</p>
						) : null
					}
				/>
				{/* The check still says what the stored brief lacks. */}
				<PlanCheck plan={plan} />
			</div>
		);
	}

	const readOnly = readOnlyReason !== null;
	const shape = tried ? planShapeProblems(draft) : new Map<string, string[]>();
	const refused = [
		...approvedChangeIssues(error),
		...planValidationIssues(error),
	];
	// Positions in the body that was refused; the draft until one was sent.
	const refusedAt = issuesByTarget(refused, sent?.brief ?? draft.brief);
	const checkAt = issuesByTarget(plan.check.issues, plan.brief);
	const at = (target: IssueTarget) => [
		...(shape.get(target) ?? []),
		...(refusedAt.get(target) ?? []),
	];
	const unchanged =
		JSON.stringify(planBodyOf(draft)) === JSON.stringify(planBodyOf(initial));

	const setBrief = (change: (brief: BriefDraft) => BriefDraft) =>
		setDraft((d) => (d ? { ...d, brief: change(d.brief) } : d));

	const save = () => {
		setTried(true);
		if (planShapeProblems(draft).size > 0) return;
		const body = planBodyOf(draft);
		setSent(body);
		onSave(body);
	};

	return (
		<form
			data-testid="plan-editor"
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				save();
			}}
			// ⌘S or Ctrl+S saves from any field, as an editor's save does.
			onKeyDown={(event) => {
				if (
					event.key === "s" &&
					(event.metaKey || event.ctrlKey) &&
					!readOnly
				) {
					event.preventDefault();
					if (!unchanged && !pending) save();
				}
			}}
			// The intake page's two stacks: the plan (8), and its check with
			// Save beside it (4), the rail held in view while the plan scrolls.
			// Stacked below lg.
			className={cn(
				"flex min-w-0 flex-col gap-4 pb-4 lg:grid lg:grid-cols-12 lg:items-start",
				landed && "landed",
			)}
		>
			<div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
				{readOnly ? (
					<p
						data-testid="plan-read-only"
						className="type-small flex items-start gap-2 rounded-control border border-border bg-app-hollow px-3 py-2 text-text-muted"
					>
						<Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
						{readOnlyReason}
					</p>
				) : null}

				<SectionPanel title="Plan" data-testid="plan-panel">
					<Tabs
						defaultValue="fields"
						data-testid="plan-inspector"
						className="flex flex-col gap-4"
					>
						<TabsList aria-label="Plan views">
							<TabsTrigger value="fields" data-testid="plan-inspector-fields">
								Fields
							</TabsTrigger>
							<TabsTrigger value="json" data-testid="plan-inspector-json">
								JSON
							</TabsTrigger>
							<TabsTrigger value="request" data-testid="plan-inspector-request">
								Request
							</TabsTrigger>
						</TabsList>
						<TabsContent
							value="fields"
							forceMount
							className="flex flex-col gap-6 data-[state=inactive]:hidden"
						>
							<SummaryField
								value={draft.brief.summary}
								locked={locks.summary}
								readOnly={readOnly}
								errors={at("summary")}
								checks={checkAt.get("summary") ?? []}
								onChange={(summary) => setBrief((b) => ({ ...b, summary }))}
							/>

							<Requirements
								focusAdd={landed}
								brief={draft.brief}
								locks={locks}
								readOnly={readOnly}
								errorsAt={at}
								checkAt={checkAt}
								onChange={setBrief}
							/>

							<Modules
								brief={draft.brief}
								readOnly={readOnly}
								errorsAt={at}
								checkAt={checkAt}
								onChange={setBrief}
							/>

							<TemplateFields
								draft={draft}
								readOnly={readOnly}
								errorsAt={at}
								onChange={(change) =>
									setDraft((d) => (d ? { ...d, ...change } : d))
								}
							/>
						</TabsContent>
						<TabsContent
							value="json"
							forceMount
							className="data-[state=inactive]:hidden"
						>
							<CodeView
								data-testid="plan-json"
								label="The plan as the contract serves it"
								text={JSON.stringify(plan, null, 2)}
							/>
						</TabsContent>
						<TabsContent
							value="request"
							forceMount
							className="flex flex-col gap-2 data-[state=inactive]:hidden"
						>
							<p className="type-mono text-text-subtle">
								{`PUT /api/missions/${plan.missionId}/plan`}
							</p>
							<p className="type-caption text-text-subtle">
								{unchanged
									? "The whole plan, as a save would send it. Nothing has changed yet."
									: "The whole plan, as a save will send it: PUT replaces the stored plan."}
							</p>
							<CodeView
								data-testid="plan-request"
								label="The request body a save will send"
								text={JSON.stringify(planBodyOf(draft), null, 2)}
							/>
						</TabsContent>
					</Tabs>
				</SectionPanel>
			</div>

			<div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--topbar-height)+1rem)] lg:col-span-4">
				<PlanCheck plan={plan}>
					<FormError error={error} hasFieldErrors={refused.length > 0} />
					{refused.length > 0 ? (
						<IssueList
							data-testid="plan-refused-issues"
							title="What the save changed or got wrong"
							issues={refused}
						/>
					) : null}
					{readOnly ? null : (
						<div className="flex flex-col gap-1.5 border-t border-border pt-3">
							<Button
								type="submit"
								data-testid="plan-save"
								className="w-full"
								disabled={pending}
								disabledReason={
									unchanged ? "Nothing has changed yet." : undefined
								}
							>
								{pending ? "Saving" : "Save plan"}
							</Button>
							<p className="type-caption text-text-subtle">
								Saving replaces the stored plan; the check runs on what is
								saved.
							</p>
						</div>
					)}
				</PlanCheck>
			</div>
		</form>
	);
}

/**
 * The stored plan's check, as a to-do list. The messages are the server's,
 * shown as given. Saving does not need it to pass, so this is guidance.
 */
function PlanCheck({
	plan,
	children,
}: {
	plan: MissionPlan;
	/** What acts on the plan, under its check: errors and Save. */
	children?: ReactNode;
}) {
	const { passed, issues } = plan.check;
	return (
		<SectionPanel
			title="Plan check"
			data-testid="plan-check"
			actions={
				<StatusPill
					size="sm"
					tone={passed ? "pass" : "warn"}
					label={
						passed
							? "Passes"
							: issues.length === 1
								? "1 to do"
								: `${issues.length} to do`
					}
					data-testid="plan-check-status"
				/>
			}
		>
			<div className="flex flex-col gap-3">
				<p className="type-caption text-text-subtle">
					Checked on the saved plan. A plan can be saved before it passes.
				</p>
				{issues.length > 0 ? (
					<ul data-testid="plan-check-issues" className="flex flex-col gap-1">
						{issues.map((issue, i) => (
							<li
								key={occurrenceKeys(issues, (x) => x.message)[i]}
								data-testid="plan-check-issue"
								className="type-small flex gap-2 text-foreground"
							>
								<StatusGlyph tone="warn" className="mt-1 text-gate-warn" />
								{issue.message}
							</li>
						))}
					</ul>
				) : null}
				{children}
			</div>
		</SectionPanel>
	);
}

function IssueList({
	title,
	issues,
	"data-testid": testId,
}: {
	title: string;
	issues: CheckIssue[];
	"data-testid": string;
}) {
	return (
		<section data-testid={testId} className="flex flex-col gap-1">
			<h3 className="type-small font-medium text-foreground">{title}</h3>
			<ul className="flex flex-col gap-1">
				{issues.map((issue, i) => (
					<li
						key={occurrenceKeys(issues, (x) => x.message)[i]}
						className="type-small text-gate-block"
					>
						{issue.message}
					</li>
				))}
			</ul>
		</section>
	);
}

/** Messages under a field: refusals and shape problems in the block tone, check issues muted. */
function Notes({
	errors,
	checks,
	testid,
}: {
	errors: string[];
	checks: string[];
	testid: string;
}) {
	if (errors.length === 0 && checks.length === 0) return null;
	return (
		<ul data-testid={testid} className="flex flex-col gap-0.5">
			{errors.map((m, i) => (
				<li
					key={occurrenceKeys(errors, (x) => x)[i]}
					data-testid={`${testid}-error`}
					className="type-small text-gate-block"
				>
					{m}
				</li>
			))}
			{checks.map((m, i) => (
				<li
					key={occurrenceKeys(checks, (x) => x)[i]}
					data-testid={`${testid}-check`}
					className="type-small text-text-muted"
				>
					{m}
				</li>
			))}
		</ul>
	);
}

function Locked({ testid }: { testid: string }) {
	return (
		<span
			data-testid={testid}
			title={APPROVED_LOCK_REASON}
			className="type-caption inline-flex items-center gap-1 text-text-subtle"
		>
			<Lock aria-hidden="true" className="size-3" />
			Approved
			<span className="sr-only">{`: ${APPROVED_LOCK_REASON}`}</span>
		</span>
	);
}

function SummaryField({
	value,
	locked,
	readOnly,
	errors,
	checks,
	onChange,
}: {
	value: string;
	locked: boolean;
	readOnly: boolean;
	errors: string[];
	checks: string[];
	onChange: (summary: string) => void;
}) {
	if (locked || readOnly) {
		return (
			<section
				id={planAnchor("summary")}
				data-testid="plan-summary"
				className={cn("flex flex-col gap-1.5 rounded-control", LANDED_RING)}
			>
				<h3 className="type-small flex items-center gap-2 font-medium text-foreground">
					Summary
					{locked ? <Locked testid="plan-summary-locked" /> : null}
				</h3>
				<p className="type-body whitespace-pre-wrap text-foreground">{value}</p>
				<Notes errors={errors} checks={checks} testid="plan-summary-notes" />
			</section>
		);
	}
	return (
		<div
			id={planAnchor("summary")}
			data-testid="plan-summary"
			className={cn("flex flex-col gap-1.5 rounded-control", LANDED_RING)}
		>
			<Field label="Summary" error={errors[0]} testid="plan-summary-input">
				{(props) => (
					<Textarea
						{...props}
						rows={3}
						maxLength={5_000}
						value={value}
						onChange={(e) => onChange(e.target.value)}
					/>
				)}
			</Field>
			<Notes
				errors={errors.slice(1)}
				checks={checks}
				testid="plan-summary-notes"
			/>
		</div>
	);
}

type SetBrief = (change: (brief: BriefDraft) => BriefDraft) => void;
type ErrorsAt = (target: IssueTarget) => string[];

/**
 * Every requirement in the brief's order, each with the criteria that cite
 * it (fd's groupBrief does the joining), and where it is placed. Removing an
 * added requirement removes its added criteria and its places in modules.
 */
function Requirements({
	brief,
	locks,
	readOnly,
	errorsAt,
	checkAt,
	onChange,
	focusAdd = false,
}: {
	brief: BriefDraft;
	locks: ApprovedLocks;
	/** A plan just started: Add requirement is where work begins. */
	focusAdd?: boolean;
	readOnly: boolean;
	errorsAt: ErrorsAt;
	checkAt: Map<IssueTarget, string[]>;
	onChange: SetBrief;
}) {
	const grouped = groupBrief(brief as Brief);
	const criteriaOf = new Map<string, RequirementGroup["criteria"]>();
	for (const g of [
		...grouped.modules.flatMap((m) => m.groups),
		...grouped.unplaced,
	]) {
		criteriaOf.set(g.requirement.id, g.criteria);
	}
	const requirementKeys = occurrenceKeys(brief.requirements, (r) => r.id);
	const placedIn = (id: string) =>
		brief.modules.filter((m) => m.requirementIds.includes(id)).map((m) => m.id);

	const addRequirement = () =>
		onChange((b) => ({
			...b,
			requirements: [
				...b.requirements,
				{
					id: nextId(
						"R",
						b.requirements.map((r) => r.id),
					),
					text: "",
				},
			],
		}));
	const removeRequirement = (id: string) =>
		onChange((b) => ({
			...b,
			requirements: b.requirements.filter((r) => r.id !== id),
			acceptanceCriteria: b.acceptanceCriteria.filter(
				(ac) => ac.requirementId !== id || locks.criteria.has(ac.id),
			),
			modules: b.modules.map((m) => ({
				...m,
				requirementIds: m.requirementIds.filter((rid) => rid !== id),
			})),
			// A check names one requirement; it goes with it.
			checks: b.checks.filter((c) => c.requirementId !== id),
		}));
	const setRequirement = (index: number, text: string) =>
		onChange((b) => ({
			...b,
			requirements: b.requirements.map((r, i) =>
				i === index ? { ...r, text } : r,
			),
		}));
	const addCriterion = (requirementId: string) =>
		onChange((b) => ({
			...b,
			acceptanceCriteria: [
				...b.acceptanceCriteria,
				{
					id: nextId(
						"AC",
						b.acceptanceCriteria.map((ac) => ac.id),
					),
					requirementId,
					text: "",
				},
			],
		}));
	const setCriterion = (index: number, text: string) =>
		onChange((b) => ({
			...b,
			acceptanceCriteria: b.acceptanceCriteria.map((ac, i) =>
				i === index ? { ...ac, text } : ac,
			),
		}));
	const removeCriterion = (index: number) =>
		onChange((b) => ({
			...b,
			acceptanceCriteria: b.acceptanceCriteria.filter((_, i) => i !== index),
		}));

	return (
		<section
			id={planAnchor("requirements")}
			data-testid="plan-requirements"
			className={cn("flex flex-col gap-3 rounded-control", LANDED_RING)}
		>
			<ListHeader
				title="Requirements"
				notes={
					<Notes
						errors={errorsAt("requirements")}
						checks={checkAt.get("requirements") ?? []}
						testid="plan-requirements-notes"
					/>
				}
			/>
			<ol className="flex flex-col gap-3">
				{brief.requirements.map((r, ri) => {
					const locked = locks.requirements.has(r.id);
					const target = `requirement:${r.id}`;
					const places = placedIn(r.id);
					const criteria = criteriaOf.get(r.id) ?? [];
					return (
						<li
							key={requirementKeys[ri]}
							id={planAnchor(`requirement:${r.id}`)}
							data-testid={`plan-requirement-${r.id}`}
							className={cn(
								"flex flex-col gap-2 p-3 rounded-card border border-border bg-app-panel shadow-card",
								LANDED_RING,
							)}
						>
							<div className="flex items-center gap-2">
								<span className="type-mono text-foreground">{r.id}</span>
								{locked ? (
									<Locked testid={`plan-requirement-${r.id}-locked`} />
								) : null}
								<span
									data-testid={`plan-requirement-${r.id}-placed`}
									className="type-caption ml-auto text-text-subtle"
								>
									{places.length === 0
										? "In no module"
										: `In ${places.join(", ")}`}
								</span>
								{locked || readOnly ? null : (
									<RemoveButton
										label={`Remove ${r.id}`}
										testid={`plan-requirement-${r.id}-remove`}
										onClick={() => removeRequirement(r.id)}
									/>
								)}
							</div>
							<ItemText
								value={r.text}
								label={`${r.id} text`}
								editable={!locked && !readOnly}
								maxLength={2_000}
								testid={`plan-requirement-${r.id}-text`}
								onChange={(text) => setRequirement(ri, text)}
							/>
							<Notes
								errors={errorsAt(target)}
								checks={checkAt.get(target) ?? []}
								testid={`plan-requirement-${r.id}-notes`}
							/>
							<ul className="flex flex-col gap-2 border-l border-border pl-3">
								{criteria.map((ac) => {
									const index = brief.acceptanceCriteria.indexOf(ac);
									const acLocked = locks.criteria.has(ac.id);
									const acTarget = `criterion:${ac.id}`;
									return (
										<li
											key={`${ac.id}#${index}`}
											id={planAnchor(`criterion:${ac.id}`)}
											data-testid={`plan-criterion-${ac.id}`}
											className={cn(
												"flex flex-col gap-1 rounded-control",
												LANDED_RING,
											)}
										>
											<div className="flex items-center gap-2">
												<span className="type-mono text-text-muted">
													{ac.id}
												</span>
												{acLocked ? (
													<Locked testid={`plan-criterion-${ac.id}-locked`} />
												) : null}
												{acLocked || readOnly ? null : (
													<RemoveButton
														label={`Remove ${ac.id}`}
														testid={`plan-criterion-${ac.id}-remove`}
														onClick={() => removeCriterion(index)}
														className="ml-auto"
													/>
												)}
											</div>
											<ItemText
												value={ac.text}
												label={`${ac.id} text`}
												editable={!acLocked && !readOnly}
												maxLength={2_000}
												testid={`plan-criterion-${ac.id}-text`}
												onChange={(text) => setCriterion(index, text)}
											/>
											<Notes
												errors={errorsAt(acTarget)}
												checks={checkAt.get(acTarget) ?? []}
												testid={`plan-criterion-${ac.id}-notes`}
											/>
										</li>
									);
								})}
							</ul>
							{readOnly ? null : (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									data-testid={`plan-requirement-${r.id}-add-criterion`}
									onClick={() => addCriterion(r.id)}
									className="self-start"
								>
									<Plus aria-hidden="true" />
									Add criterion
								</Button>
							)}
						</li>
					);
				})}
			</ol>
			{grouped.uncited.length > 0 ? (
				<div data-testid="plan-uncited" className="flex flex-col gap-1">
					<p className="type-small font-medium text-foreground">
						Criteria citing no requirement
					</p>
					<ul className="flex flex-col gap-1">
						{grouped.uncited.map((ac) => {
							const index = brief.acceptanceCriteria.indexOf(ac);
							return (
								<li
									key={`${ac.id}#${index}`}
									id={planAnchor(`criterion:${ac.id}`)}
									data-testid={`plan-criterion-${ac.id}`}
									className={cn(
										"type-small flex items-center gap-2 rounded-control text-text-muted",
										LANDED_RING,
									)}
								>
									<span className="type-mono">{`${ac.id} → ${ac.requirementId}`}</span>
									<span className="min-w-0 flex-1 truncate">{ac.text}</span>
									{locks.criteria.has(ac.id) || readOnly ? null : (
										<RemoveButton
											label={`Remove ${ac.id}`}
											testid={`plan-criterion-${ac.id}-remove`}
											onClick={() => removeCriterion(index)}
										/>
									)}
								</li>
							);
						})}
					</ul>
				</div>
			) : null}
			{readOnly ? null : (
				<Button
					type="button"
					variant="outline"
					size="sm"
					data-testid="plan-add-requirement"
					autoFocus={focusAdd}
					onClick={addRequirement}
					className="self-start"
				>
					<Plus aria-hidden="true" />
					Add requirement
				</Button>
			)}
		</section>
	);
}

/**
 * Each module, its name, and a toggle per requirement it owns. A
 * requirement placed twice, or nowhere, is shown, not prevented: placement
 * is the plan check's rule 4. Modules are the plan's own, never approved.
 */
function Modules({
	brief,
	readOnly,
	errorsAt,
	checkAt,
	onChange,
}: {
	brief: BriefDraft;
	readOnly: boolean;
	errorsAt: ErrorsAt;
	checkAt: Map<IssueTarget, string[]>;
	onChange: SetBrief;
}) {
	const grouped = groupBrief(brief as Brief);
	const moduleKeys = occurrenceKeys(grouped.modules, (g) => g.module.id);
	const requirementKeys = occurrenceKeys(brief.requirements, (r) => r.id);
	const addModule = () =>
		onChange((b) => ({
			...b,
			modules: [
				...b.modules,
				{
					id: nextId(
						"M",
						b.modules.map((m) => m.id),
					),
					name: "",
					reads: [],
					requirementIds: [],
				},
			],
		}));
	const setModule = (
		index: number,
		change: Partial<BriefDraft["modules"][number]>,
	) =>
		onChange((b) => ({
			...b,
			modules: b.modules.map((m, i) => (i === index ? { ...m, ...change } : m)),
		}));
	const removeModule = (index: number) =>
		onChange((b) => ({
			...b,
			modules: b.modules.filter((_, i) => i !== index),
		}));

	return (
		<section
			id={planAnchor("modules")}
			data-testid="plan-modules"
			className={cn("flex flex-col gap-3 rounded-control", LANDED_RING)}
		>
			<ListHeader
				title="Modules"
				notes={
					<Notes
						errors={errorsAt("modules")}
						checks={checkAt.get("modules") ?? []}
						testid="plan-modules-notes"
					/>
				}
			/>
			{brief.modules.length === 0 ? (
				<p data-testid="plan-no-modules" className="type-small text-text-muted">
					No modules yet. A plan needs at least one, and every requirement sits
					in exactly one.
				</p>
			) : null}
			<ol className="flex flex-col gap-3">
				{grouped.modules.map(({ module: m, missing }, mi) => {
					const target = `module:${m.id}`;
					return (
						<li
							key={moduleKeys[mi]}
							id={planAnchor(`module:${m.id}`)}
							data-testid={`plan-module-${m.id}`}
							className={cn(
								"flex flex-col gap-2 p-3 rounded-card border border-border bg-app-panel shadow-card",
								LANDED_RING,
							)}
						>
							<div className="flex items-center gap-2">
								<span className="type-mono text-foreground">{m.id}</span>
								{readOnly ? (
									<span className="type-body text-foreground">{m.name}</span>
								) : (
									<Input
										aria-label={`${m.id} name`}
										data-testid={`plan-module-${m.id}-name`}
										maxLength={200}
										value={m.name}
										placeholder="Module name"
										autoFocus={m.name === ""}
										onChange={(e) => setModule(mi, { name: e.target.value })}
										className="flex-1"
									/>
								)}
								{readOnly ? null : (
									<RemoveButton
										label={`Remove ${m.id}`}
										testid={`plan-module-${m.id}-remove`}
										onClick={() => removeModule(mi)}
									/>
								)}
							</div>
							<fieldset className="flex flex-col gap-1">
								<legend className="type-caption text-text-subtle">
									Requirements it owns
								</legend>
								<div className="flex flex-wrap gap-1">
									{brief.requirements.map((r, ri) => {
										const on = m.requirementIds.includes(r.id);
										return (
											<Button
												key={requirementKeys[ri]}
												type="button"
												variant="outline"
												size="sm"
												aria-pressed={on}
												disabled={readOnly}
												data-testid={`plan-module-${m.id}-has-${r.id}`}
												onClick={() =>
													setModule(mi, {
														requirementIds: on
															? m.requirementIds.filter((id) => id !== r.id)
															: [...m.requirementIds, r.id],
													})
												}
												className="type-mono aria-pressed:bg-selected"
											>
												{r.id}
											</Button>
										);
									})}
									{missing.map((id) => (
										<Badge
											key={`missing-${id}`}
											variant="destructive"
											data-testid={`plan-module-${m.id}-missing-${id}`}
										>
											{`${id} is not a requirement`}
										</Badge>
									))}
								</div>
							</fieldset>
							<Notes
								errors={errorsAt(target)}
								checks={checkAt.get(target) ?? []}
								testid={`plan-module-${m.id}-notes`}
							/>
						</li>
					);
				})}
			</ol>
			{readOnly ? null : (
				<Button
					type="button"
					variant="outline"
					size="sm"
					data-testid="plan-add-module"
					onClick={addModule}
					className="self-start"
				>
					<Plus aria-hidden="true" />
					Add module
				</Button>
			)}
		</section>
	);
}

/** The template repository and commit, set together or not at all. */
function TemplateFields({
	draft,
	readOnly,
	errorsAt,
	onChange,
}: {
	draft: PlanDraft;
	readOnly: boolean;
	errorsAt: ErrorsAt;
	onChange: (change: Partial<PlanDraft>) => void;
}) {
	return (
		<fieldset data-testid="plan-template" className="flex flex-col gap-3">
			<legend className="type-title text-foreground">Template</legend>
			<p className="type-caption text-text-subtle">
				Both or neither: the AVEL project template it is built from, and the
				full commit. Choosing a template pins its latest commit.
			</p>
			<div
				id={planAnchor("templateRef")}
				className={cn("rounded-control", LANDED_RING)}
			>
				<Field
					label="Template"
					hint="Optional"
					error={errorsAt("templateRef")[0]}
					testid="plan-template-ref"
				>
					{(props) => (
						<TemplatePicker
							field={props}
							value={draft.templateRef}
							readOnly={readOnly}
							onChange={onChange}
						/>
					)}
				</Field>
			</div>
			<div
				id={planAnchor("templateVersion")}
				className={cn("rounded-control", LANDED_RING)}
			>
				<Field
					label="Commit"
					hint="40 hex characters"
					error={errorsAt("templateVersion")[0]}
					testid="plan-template-version"
				>
					{(props) => (
						<Input
							{...props}
							readOnly={readOnly}
							maxLength={40}
							className="type-mono"
							value={draft.templateVersion}
							onChange={(e) => onChange({ templateVersion: e.target.value })}
						/>
					)}
				</Field>
				<LatestCommit
					templateRef={draft.templateRef}
					templateVersion={draft.templateVersion}
					readOnly={readOnly}
					onUse={(sha) => onChange({ templateVersion: sha })}
				/>
			</div>
		</fieldset>
	);
}

function ListHeader({ title, notes }: { title: string; notes: ReactNode }) {
	return (
		<div className="flex flex-col gap-1">
			<h3 className="type-title text-foreground">{title}</h3>
			{notes}
		</div>
	);
}

function ItemText({
	value,
	label,
	editable,
	maxLength,
	testid,
	onChange,
}: {
	value: string;
	label: string;
	editable: boolean;
	maxLength: number;
	testid: string;
	onChange: (text: string) => void;
}) {
	const id = useId();
	if (!editable) {
		return (
			<p
				data-testid={testid}
				className="type-small whitespace-pre-wrap text-foreground"
			>
				{value}
			</p>
		);
	}
	return (
		<>
			<label htmlFor={id} className="sr-only">
				{label}
			</label>
			<Textarea
				id={id}
				data-testid={testid}
				// A new item starts empty, so adding one puts the caret in it.
				// Saved text is never empty: nothing focuses itself on load.
				autoFocus={value === ""}
				rows={2}
				maxLength={maxLength}
				value={value}
				onChange={(e) => onChange(e.target.value)}
			/>
		</>
	);
}

function RemoveButton({
	label,
	testid,
	onClick,
	className,
}: {
	label: string;
	testid: string;
	onClick: () => void;
	className?: string;
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			aria-label={label}
			data-testid={testid}
			onClick={onClick}
			className={cn(className)}
		>
			<Trash2 aria-hidden="true" />
		</Button>
	);
}
