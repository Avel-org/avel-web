import { Link } from "@tanstack/react-router";
import type { Intake } from "avel-server/contract";
import { ArrowLeft, ArrowUpRight, CircleCheck, FileSearch } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime, useEngagement } from "@/lib/api/clients";
import {
	checkIntakeBrief,
	INTAKE_CHECK_LABEL,
	INTAKE_CHECK_RULES,
	type IntakeCheckIssue,
	intakeRefusal,
	useIntake,
	useProposeIntake,
} from "@/lib/api/intakes";
import { describeError } from "@/lib/error-map";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { CanonPanel } from "./canon-panel";
import { CanonQuestionsPanel } from "./canon-questions";
import { CanonRecommends } from "./canon-recommends";
import { IntakeFiles } from "./intake-files";
import { intakeTitle } from "./intake-list";
import {
	ApproveIntakeModal,
	CANON_QUESTIONS_ID,
	ReadRepoModal,
	RejectIntakeModal,
	ReviseIntakeModal,
} from "./intake-modals";
import { INTAKE_LIFECYCLE, Lifecycle } from "./lifecycle";
import { Brief } from "./mission-details";
import { PanelFooter } from "./panel-footer";
import { Reason } from "./reason";
import { SectionPanel } from "./section-panel";
import { ShortHash } from "./short-hash";
import { StatusGlyph } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/*
 * One intake (audit F7): where it stands on its lifecycle, the brief it
 * proposes, the check that brief must pass, and the repository read that
 * approval needs. Its writes go by status: a draft is revised and proposed,
 * a proposed one approved into a mission; either can be read against its
 * repository or rejected. Approved and rejected are final.
 */

export function IntakePage({
	clientId,
	intakeId,
}: {
	clientId: string;
	intakeId: string;
}) {
	const intake = useIntake(intakeId);
	return (
		<Surface
			data-testid="intake-page"
			query={intake}
			isEmpty={() => false}
			loading={
				<div className="flex flex-col gap-4">
					<Skeleton className="h-40 w-full rounded-card" />
					<Skeleton className="h-64 w-full rounded-card" />
				</div>
			}
			empty={null}
			error={ErrorState}
		>
			{(data) => <IntakeContent intake={data} clientId={clientId} />}
		</Surface>
	);
}

type ModalId = "revise" | "read" | "approve" | "reject";

function IntakeContent({
	intake,
	clientId,
}: {
	intake: Intake;
	clientId: string;
}) {
	const [modal, setModal] = useState<ModalId | null>(null);
	const read = useIntake(intake.id);
	const propose = useProposeIntake(intake.id);
	// Which version of the intake Propose was refused for: once a revise
	// changes it, the refusal's issues no longer describe the brief.
	const [refusedFor, setRefusedFor] = useState<string | null>(null);
	const refusal = currentRefusal(propose.error, refusedFor, intake.updatedAt);
	const onModal = (id: ModalId) => (open: boolean) =>
		setModal(open ? id : null);
	const readAge = (testId: string) => (
		<PanelFooter data-testid={testId} queries={[read]} />
	);
	return (
		// The dashboard's two stacks: the intake and its brief (8), the
		// check and the repository it needs (4). Stacked on a phone.
		<div
			data-testid="intake-content"
			className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start"
		>
			<div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
				<IntakeHeader
					intake={intake}
					clientId={clientId}
					onOpen={setModal}
					onPropose={() =>
						propose.mutate(undefined, {
							onError: () => setRefusedFor(intake.updatedAt),
						})
					}
					proposing={propose.isPending}
					proposeError={refusal}
				/>
				{/* Canon drafts the brief: its conversation and its questions
					    come before what it drafted. */}
				<CanonPanel intakeId={intake.id} />
				{/* Approve's refusal for open questions leads here. */}
				<div id={CANON_QUESTIONS_ID} className="scroll-mt-(--topbar-height)">
					<CanonQuestionsPanel intakeId={intake.id} />
				</div>
				<SectionPanel
					title="Brief"
					data-testid="intake-brief"
					footer={readAge("intake-brief-read-age")}
				>
					{intake.proposedBrief ? (
						<Brief brief={intake.proposedBrief} />
					) : (
						<p
							data-testid="intake-brief-none"
							className="type-small text-text-subtle"
						>
							No brief yet. Revise the intake to write one.
						</p>
					)}
					<OpenQuestions questions={intake.openQuestions} />
				</SectionPanel>
				{intake.recommendedRoster ? (
					<CanonRecommends roster={intake.recommendedRoster} />
				) : null}
				<SectionPanel
					title="Source"
					description="What the brief was drafted from, as it was given."
					data-testid="intake-source"
				>
					<pre
						data-testid="intake-source-text"
						className="max-h-96 overflow-auto rounded-control border border-border bg-app-well p-3 font-sans type-small whitespace-pre-wrap text-text"
					>
						{intake.sourceMd || "No source given."}
					</pre>
				</SectionPanel>
				<IntakeFiles intake={intake} />
			</div>
			<div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
				<IntakeCheck intake={intake} serverError={refusal} />
				<RepositoryPanel
					intake={intake}
					onRead={() => setModal("read")}
					footer={readAge("intake-repo-read-age")}
				/>
			</div>
			{open(intake) ? (
				<>
					<ReviseIntakeModal
						intake={intake}
						open={modal === "revise"}
						onOpenChange={onModal("revise")}
					/>
					<ReadRepoModal
						intake={intake}
						open={modal === "read"}
						onOpenChange={onModal("read")}
					/>
					<RejectIntakeModal
						intake={intake}
						open={modal === "reject"}
						onOpenChange={onModal("reject")}
					/>
				</>
			) : null}
			{intake.status === "proposed" ? (
				<ApproveIntakeModal
					intake={intake}
					open={modal === "approve"}
					onOpenChange={onModal("approve")}
				/>
			) : null}
		</div>
	);
}

/**
 * A refused Propose, while it still describes the intake: the version it
 * was refused for. After a revise (a new updatedAt) the local check speaks.
 */
export function currentRefusal(
	error: unknown,
	refusedFor: string | null,
	updatedAt: string,
): unknown {
	return error && refusedFor === updatedAt ? error : null;
}

/** Draft and proposed take writes; approved and rejected are final. */
const open = (intake: Pick<Intake, "status">) =>
	intake.status === "draft" || intake.status === "proposed";

/** The page's head: the lifecycle, what the intake is, and what can be done now. */
function IntakeHeader({
	intake,
	clientId,
	onOpen,
	onPropose,
	proposing,
	proposeError,
}: {
	intake: Intake;
	clientId: string;
	onOpen: (id: ModalId) => void;
	onPropose: () => void;
	proposing: boolean;
	proposeError: unknown;
}) {
	const engagement = useEngagement(intake.engagementId);
	const now = useNow();
	return (
		<header
			data-testid="intake-header"
			className="flex flex-col gap-3 rounded-card border border-border bg-app-panel p-4 shadow-card"
		>
			<Link
				to="/clients/$id"
				params={{ id: clientId }}
				search={{ tab: "intakes" }}
				data-testid="intake-back"
				className="inline-flex w-fit items-center gap-1 type-caption text-text-muted hover:text-text"
			>
				<ArrowLeft aria-hidden="true" className="size-3.5" />
				All intakes
			</Link>
			<Lifecycle
				spec={INTAKE_LIFECYCLE}
				current={intake.status}
				label="Intake lifecycle"
				data-testid="intake-lifecycle"
			/>
			<p className="type-page text-foreground">{intakeTitle(intake)}</p>
			<p className="type-small text-text-muted">
				{engagement.data?.name ?? "An engagement"}
				{" · "}
				{`started ${relativeTime(intake.createdAt, now)}`}
				{" · "}
				{`updated ${relativeTime(intake.updatedAt, now)}`}
			</p>
			{intake.status === "approved" && intake.missionId ? (
				<p className="flex flex-wrap items-center gap-2 type-small text-text">
					<CircleCheck aria-hidden="true" className="size-4 text-gate-pass" />
					{intake.approvedAt
						? `Approved ${relativeTime(intake.approvedAt, now)}; its mission was created.`
						: "Approved; its mission was created."}
					<Button asChild variant="outline" size="sm">
						<Link
							to="/missions/$id"
							params={{ id: intake.missionId }}
							data-testid="intake-open-mission"
						>
							Open mission
							<ArrowUpRight aria-hidden="true" />
						</Link>
					</Button>
				</p>
			) : intake.status === "rejected" ? (
				<p data-testid="intake-rejected" className="type-small text-text-muted">
					Rejected. A rejected intake is final; start a new one for this work.
				</p>
			) : (
				// v3 UX 7: one row, the primary last.
				<div
					data-testid="intake-actions"
					className="flex flex-wrap items-center gap-2"
				>
					<Button
						variant="destructive"
						size="sm"
						data-testid="intake-reject-open"
						onClick={() => onOpen("reject")}
					>
						Reject
					</Button>
					<Button
						variant="outline"
						size="sm"
						data-testid="intake-read-open"
						onClick={() => onOpen("read")}
					>
						Read repository
					</Button>
					<Button
						variant="outline"
						size="sm"
						data-testid="intake-revise-open"
						onClick={() => onOpen("revise")}
					>
						Revise
					</Button>
					{intake.status === "draft" ? (
						<Button
							size="sm"
							data-testid="intake-propose"
							disabled={proposing}
							onClick={onPropose}
						>
							{proposing ? "Proposing" : "Propose"}
						</Button>
					) : (
						<Button
							size="sm"
							data-testid="intake-approve-open"
							onClick={() => onOpen("approve")}
						>
							Approve
						</Button>
					)}
				</div>
			)}
			{proposeError ? <ProposeRefusal error={proposeError} /> : null}
		</header>
	);
}

/** A refused Propose: what it means, and where to look (the check lists each issue). */
function ProposeRefusal({ error }: { error: unknown }) {
	const refusal = intakeRefusal(error);
	const copy =
		error instanceof Error && "failure" in error
			? describeError(error as Parameters<typeof describeError>[0])
			: null;
	return (
		<div
			role="alert"
			data-testid="intake-propose-refusal"
			className="flex flex-col gap-1"
		>
			<p className="type-small text-destructive">
				{copy?.what ?? "The intake could not be proposed."}
			</p>
			<p className="type-caption text-text-muted">
				{refusal?.reason === "intake_check_failed"
					? "Each issue is listed under Check."
					: copy?.next}
			</p>
		</div>
	);
}

function OpenQuestions({ questions }: { questions: readonly string[] }) {
	if (questions.length === 0) return null;
	return (
		<section
			aria-label="Open questions"
			data-testid="intake-open-questions"
			className="mt-1 flex flex-col gap-2 border-t border-border pt-4"
		>
			<h3 className="flex items-center gap-2 type-eyebrow">
				Open questions
				<Badge variant="count">{questions.length}</Badge>
			</h3>
			<ol className="flex flex-col gap-1.5">
				{questions.map((q, i) => (
					<li
						key={q}
						className="flex items-start gap-2.5 rounded-control border border-gate-warn-line bg-gate-warn-banner px-3 py-2"
					>
						<span
							aria-hidden="true"
							className="grid size-5 shrink-0 place-items-center rounded-full bg-gate-warn-soft type-caption font-medium text-gate-warn tabular-nums"
						>
							{i + 1}
						</span>
						<span className="min-w-0 break-words type-small text-text">
							{q}
						</span>
					</li>
				))}
			</ol>
			<p className="type-caption text-text-muted">
				Approval acknowledges each one. An answered question is removed by
				revising the intake.
			</p>
		</section>
	);
}

/** Which rule a server issue from a refused Propose belongs to, by its path. */
export function ruleOfPath(
	path: readonly (string | number)[],
): IntakeCheckIssue["rule"] {
	const [, list, , field] = path;
	if (list === "modules") return "modules";
	if (list === "acceptanceCriteria") {
		return field === "requirementId" ? "criteria" : "requirements";
	}
	if (list === "requirements") {
		return field === "acceptanceCriteria" ? "coverage" : "requirements";
	}
	return "brief";
}

/**
 * The check the brief must pass at Propose and Approve (audit D6, F7): one
 * row per rule, passing or blocked, each issue under its rule. It runs here
 * on the stored brief; when the server refused a Propose, its issues are
 * the ones shown, since they are the word that counts.
 */
function IntakeCheck({
	intake,
	serverError,
}: {
	intake: Intake;
	serverError: unknown;
}) {
	const refusal = intakeRefusal(serverError);
	const fromServer =
		refusal?.reason === "intake_check_failed" ? refusal.issues : null;
	const issues: IntakeCheckIssue[] = fromServer
		? fromServer.map((issue) => ({ ...issue, rule: ruleOfPath(issue.path) }))
		: checkIntakeBrief(intake.proposedBrief);
	return (
		<SectionPanel
			title="Check"
			description={
				fromServer
					? "What the server found when the intake was proposed."
					: "Run on the stored brief. The server runs it again at Propose and Approve."
			}
			count={issues.length}
			data-testid="intake-check"
		>
			{issues.length === 0 ? (
				<p
					data-testid="intake-check-clear"
					className="flex items-center gap-2 type-small text-gate-pass"
				>
					<CircleCheck aria-hidden="true" className="size-4" />
					The brief passes its check.
				</p>
			) : null}
			<ul aria-label="Check rules" className="flex flex-col gap-1">
				{INTAKE_CHECK_RULES.map((rule) => {
					const mine = issues.filter((i) => i.rule === rule);
					const blocked = mine.length > 0;
					return (
						<li
							key={rule}
							data-testid={`intake-check-${rule}`}
							data-state={blocked ? "block" : "pass"}
							className={cn(
								"flex items-start gap-2.5 rounded-control px-3 py-2",
								blocked && "border border-gate-block-line bg-gate-block-soft",
							)}
						>
							<StatusGlyph
								tone={blocked ? "block" : "pass"}
								className={cn(
									"mt-[3px]",
									blocked ? "text-gate-block" : "text-gate-pass",
								)}
							/>
							<div className="flex min-w-0 flex-col gap-1">
								<p
									className={cn(
										"type-small",
										blocked ? "font-medium text-foreground" : "text-text-muted",
									)}
								>
									{INTAKE_CHECK_LABEL[rule]}
									<span className="sr-only">
										{blocked ? ": blocked" : ": passes"}
									</span>
								</p>
								{blocked ? (
									<ul className="flex flex-col gap-0.5 type-small text-foreground">
										{mine.map((issue) => (
											<li key={`${issue.path.join(".")}-${issue.message}`}>
												{issue.message}
											</li>
										))}
									</ul>
								) : null}
							</div>
						</li>
					);
				})}
			</ul>
		</SectionPanel>
	);
}

/**
 * The repository read approval needs (module 2): the cut it derived and
 * why, how confident its conventions are, and the boundaries it found.
 */
function RepositoryPanel({
	intake,
	onRead,
	footer,
}: {
	intake: Intake;
	onRead: () => void;
	footer: React.ReactNode;
}) {
	const now = useNow();
	const conventions = intake.derivedConventions;
	const lowEntries = conventions
		? Object.entries(conventions).flatMap(([name, entry]) =>
				entry && typeof entry === "object" && "disagreements" in entry
					? (entry.disagreements as string[]).map((d) => `${name}: ${d}`)
					: [],
			)
		: [];
	return (
		<SectionPanel
			title="Repository"
			data-testid="intake-repo"
			actions={
				open(intake) ? (
					<Button
						variant="ghost"
						size="sm"
						data-testid="intake-repo-read"
						onClick={onRead}
					>
						<FileSearch aria-hidden="true" />
						{intake.repoReadAt ? "Read again" : "Read"}
					</Button>
				) : undefined
			}
			footer={intake.repoReadAt ? footer : undefined}
		>
			{intake.repoReadAt === null ? (
				<div data-testid="intake-repo-unread" className="flex flex-col gap-1.5">
					<p className="type-small text-text">Not read yet.</p>
					<Reason>Approval needs the cut, so read the repository first.</Reason>
				</div>
			) : (
				<dl data-testid="intake-repo-facts" className="flex flex-col gap-3">
					<Fact label="Repository">
						<span className="type-mono break-all">{intake.repoUrl}</span>
					</Fact>
					{intake.repoCommitSha ? (
						<Fact label="Commit">
							<ShortHash
								value={intake.repoCommitSha}
								label="the commit read"
								data-testid="intake-repo-commit"
							/>
						</Fact>
					) : null}
					<Fact label="Read">{relativeTime(intake.repoReadAt, now)}</Fact>
					<Fact label="Cut">
						{intake.derivedCut ? (
							<span className="flex flex-col gap-0.5">
								<span className="type-mono" data-testid="intake-repo-cut">
									{intake.derivedCut}
								</span>
								{intake.derivedCutEvidence ? (
									<span className="type-caption text-text-muted">
										{intake.derivedCutEvidence}
									</span>
								) : null}
							</span>
						) : (
							<span className="text-text-subtle">Not derived</span>
						)}
					</Fact>
					{conventions ? (
						<Fact label="Conventions">
							<span className="flex flex-col gap-1">
								<span
									data-testid="intake-repo-confidence"
									data-confidence={conventions.confidence}
									className="flex items-center gap-1.5"
								>
									<StatusGlyph
										tone={conventions.confidence === "high" ? "pass" : "block"}
										className={
											conventions.confidence === "high"
												? "text-gate-pass"
												: "text-gate-block"
										}
									/>
									{conventions.confidence === "high"
										? "Consistent"
										: "They disagree, which blocks approval"}
								</span>
								{lowEntries.length > 0 ? (
									<ul className="flex flex-col gap-0.5 type-caption text-text-muted">
										{lowEntries.map((d) => (
											<li key={d}>{d}</li>
										))}
									</ul>
								) : null}
							</span>
						</Fact>
					) : null}
					{intake.derivedBoundaries ? (
						<Fact label="Boundaries">
							{intake.derivedBoundaries.length === 0 ? (
								"None found"
							) : (
								<ul className="flex flex-col gap-0.5">
									{intake.derivedBoundaries.map((b) => (
										<li key={b.path} className="type-small">
											<span className="type-mono">{b.path}</span>
											<span className="text-text-subtle">{` · ${b.kind}, ${b.files} files`}</span>
										</li>
									))}
								</ul>
							)}
						</Fact>
					) : null}
				</dl>
			)}
		</SectionPanel>
	);
}

function Fact({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="type-caption text-text-subtle">{label}</dt>
			<dd className="type-small text-text">{children}</dd>
		</div>
	);
}
