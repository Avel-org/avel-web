import type { CanonQuestion } from "avel-server/contract";
import { CircleHelp, MessageCircleQuestion } from "lucide-react";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { tabsListVariants } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
	useAcknowledgeCanonQuestion,
	useAnswerCanonQuestion,
	useCanonQuestions,
	useDismissCanonQuestion,
} from "@/lib/api/canon";
import { cn } from "@/lib/utils";
import { useIsPreview } from "@/shell/auth-gate";
import { issuesOf } from "./action-modal";
import { shortStamp } from "./activity-audit";
import { CitationChip } from "./canon-citation";
import { EmptyState } from "./empty-state";
import { Markdown } from "./markdown";
import { OptionCards, OptionCheckCards } from "./option-cards";
import { PanelFooter } from "./panel-footer";
import { Reason } from "./reason";
import { retryOf } from "./retry";
import { SectionPanel } from "./section-panel";
import { ErrorState, Surface } from "./surface";

/*
 * Canon's questions: what it could not decide, asked as a card the operator
 * settles once. Answer with an option (or several, where it allows), or in
 * your own words under Other; or Acknowledge it (seen, no answer) or
 * Dismiss it. Any of the three may carry a note on what it changes. The
 * open ones stack above the composer; settled ones are kept in a panel.
 */

type Status = CanonQuestion["status"];

const STATUSES = [
	{ id: "open", label: "Open" },
	{ id: "answered", label: "Answered" },
	{ id: "acknowledged", label: "Acknowledged" },
	{ id: "dismissed", label: "Dismissed" },
] as const satisfies readonly { id: Status; label: string }[];

/** The value standing for Other in a single-choice question. */
const OTHER = "\u0000other";

/** The open questions, as cards, above the composer. */
export function CanonOpenQuestions({ intakeId }: { intakeId: string }) {
	const open = useCanonQuestions(intakeId, "open");
	const list = open.data?.pages.flatMap((p) => p.data) ?? [];
	if (open.status !== "success" || list.length === 0) return null;
	return (
		<section
			aria-label="Canon's open questions"
			data-testid="canon-open-questions"
			className="flex flex-col gap-2"
		>
			{list.map((q) => (
				<CanonQuestionCard key={q.id} question={q} intakeId={intakeId} />
			))}
		</section>
	);
}

/** One open question, as Claude asks one: header chip, question, choices. */
export function CanonQuestionCard({
	question: q,
	intakeId,
}: {
	question: CanonQuestion;
	intakeId: string;
}) {
	const preview = useIsPreview();
	const answer = useAnswerCanonQuestion(intakeId);
	const acknowledge = useAcknowledgeCanonQuestion(intakeId);
	const dismiss = useDismissCanonQuestion(intakeId);
	const [picked, setPicked] = useState<string[]>([]);
	const [other, setOther] = useState("");
	const [noting, setNoting] = useState(false);
	const [note, setNote] = useState("");
	const otherId = useId();
	const noteId = useId();

	const otherChosen = q.multiSelect ? other.trim() !== "" : picked[0] === OTHER;
	const selected = picked.filter((p) => p !== OTHER);
	const nothing =
		selected.length === 0 && !(otherChosen && other.trim() !== "");
	const pending =
		answer.isPending || acknowledge.isPending || dismiss.isPending;
	const effectMd = note.trim() === "" ? undefined : note.trim();
	// Each send clears the other two's errors, so the error shown, and what
	// Try again replays, is always the latest action's.
	const only = (kept: { reset: () => void }) => {
		for (const m of [answer, acknowledge, dismiss]) if (m !== kept) m.reset();
	};
	const error = answer.error ?? acknowledge.error ?? dismiss.error;
	const issues = issuesOf(answer.error);
	const issueAt = (field: string) =>
		issues.find((i) => i.path[0] === field)?.message;
	const signIn = preview ? "Sign in to answer Canon" : undefined;
	const held = signIn ?? (pending ? "Saving" : undefined);

	const cards = q.options.map((o) => ({
		value: o.label,
		title: o.label,
		meta: o.description,
		"data-testid": `canon-question-${q.id}-option-${o.label}`,
	}));

	return (
		<article
			aria-label={`Canon asks: ${q.question}`}
			data-testid={`canon-question-${q.id}`}
			className="flex flex-col gap-3 rounded-card border border-border bg-app-panel p-3 shadow-card"
		>
			<header className="flex flex-col gap-1.5">
				<span className="flex items-center gap-2">
					<MessageCircleQuestion
						aria-hidden="true"
						className="size-4 shrink-0 text-text-subtle"
					/>
					<Badge variant="tag" data-testid={`canon-question-${q.id}-header`}>
						{q.header}
					</Badge>
				</span>
				<h3 className="type-body font-medium break-words text-text">
					{q.question}
				</h3>
				<p className="type-caption text-text-muted">{q.reason}</p>
				{q.sources.length > 0 ? (
					<ul aria-label="Sources" className="flex flex-wrap gap-1.5">
						{q.sources.map((s) => (
							<li key={s.chunkId} className="min-w-0 max-w-full">
								<CitationChip
									source={s}
									data-testid={`canon-question-${q.id}-source-${s.chunkId}`}
								/>
							</li>
						))}
					</ul>
				) : null}
			</header>

			{q.multiSelect ? (
				<OptionCheckCards
					legend="Choose any that apply"
					data-testid={`canon-question-${q.id}-options`}
					value={selected}
					onChange={setPicked}
					options={cards}
				/>
			) : (
				<OptionCards
					legend="Choose one"
					data-testid={`canon-question-${q.id}-options`}
					value={picked[0] ?? ""}
					onChange={(v) => setPicked([v])}
					options={[
						...cards,
						{
							value: OTHER,
							title: "Other…",
							meta: "Answer in your own words.",
							"data-testid": `canon-question-${q.id}-option-other`,
						},
					]}
				/>
			)}
			{issueAt("selected") ? (
				<Reason data-testid={`canon-question-${q.id}-selected-issue`}>
					{issueAt("selected")}
				</Reason>
			) : null}
			{q.multiSelect || otherChosen ? (
				<div className="flex flex-col gap-1">
					<label htmlFor={otherId} className="type-caption text-text-subtle">
						{q.multiSelect ? "Other (optional)" : "Your answer"}
					</label>
					<Input
						id={otherId}
						data-testid={`canon-question-${q.id}-other`}
						maxLength={2000}
						value={other}
						aria-invalid={issueAt("other") ? true : undefined}
						onChange={(e) => setOther(e.target.value)}
					/>
					{issueAt("other") ? <Reason>{issueAt("other")}</Reason> : null}
				</div>
			) : null}

			{noting ? (
				<div className="flex flex-col gap-1">
					<label htmlFor={noteId} className="type-caption text-text-subtle">
						What this changes in the draft (optional)
					</label>
					<Textarea
						id={noteId}
						rows={2}
						data-testid={`canon-question-${q.id}-note`}
						value={note}
						onChange={(e) => setNote(e.target.value)}
					/>
				</div>
			) : null}

			<div className="flex flex-wrap items-center gap-1.5">
				<Button
					type="button"
					size="sm"
					data-testid={`canon-question-${q.id}-answer`}
					disabledReason={
						held ??
						(nothing ? "Choose an option or write an answer." : undefined)
					}
					onClick={() => {
						only(answer);
						answer.mutate({
							id: q.id,
							body: {
								selected,
								...(otherChosen && other.trim() !== ""
									? { other: other.trim() }
									: {}),
								...(effectMd ? { effectMd } : {}),
							},
						});
					}}
				>
					Answer
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					data-testid={`canon-question-${q.id}-acknowledge`}
					disabledReason={held}
					onClick={() => {
						only(acknowledge);
						acknowledge.mutate({
							id: q.id,
							body: effectMd ? { effectMd } : {},
						});
					}}
				>
					Acknowledge
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					data-testid={`canon-question-${q.id}-dismiss`}
					disabledReason={held}
					onClick={() => {
						only(dismiss);
						dismiss.mutate({ id: q.id, body: effectMd ? { effectMd } : {} });
					}}
				>
					Dismiss
				</Button>
				{noting ? null : (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="ml-auto text-text-muted"
						data-testid={`canon-question-${q.id}-add-note`}
						onClick={() => setNoting(true)}
					>
						Add a note
					</Button>
				)}
			</div>
			{error && issues.length === 0 ? (
				<ErrorState
					error={error}
					{...(answer.error
						? retryOf(answer)
						: acknowledge.error
							? retryOf(acknowledge)
							: retryOf(dismiss))}
				/>
			) : null}
		</article>
	);
}

/** Every question Canon asked on this intake, by status, with counts. */
export function CanonQuestionsPanel({
	intakeId,
	initialStatus = "answered",
}: {
	intakeId: string;
	initialStatus?: Status;
}) {
	const [status, setStatus] = useState<Status>(initialStatus);
	const questions = useCanonQuestions(intakeId, status);
	const meta = questions.data?.pages[0]?.meta;
	const rows = questions.data?.pages.flatMap((p) => p.data) ?? [];
	return (
		<SectionPanel
			title="Questions"
			data-testid="canon-questions"
			footer={
				<PanelFooter
					data-testid="canon-questions-read-age"
					queries={[questions]}
				/>
			}
		>
			{/* In the body, not the header: the row wraps on a phone. */}
			<fieldset
				data-testid="canon-questions-status"
				// Four segments with counts wrap rather than overflow a phone.
				className={cn(
					tabsListVariants({ variant: "default" }),
					"max-w-full flex-wrap",
				)}
			>
				<legend className="sr-only">Status</legend>
				{STATUSES.map((s) => (
					<Button
						key={s.id}
						type="button"
						variant="segment"
						aria-pressed={status === s.id}
						data-testid={`canon-questions-status-${s.id}`}
						onClick={() => setStatus(s.id)}
					>
						{s.label}
						{meta ? (
							<span className="type-mono text-text-subtle tabular-nums">
								{meta.counts[s.id]}
							</span>
						) : null}
					</Button>
				))}
			</fieldset>
			<Surface
				data-testid="canon-questions-list"
				query={questions}
				isEmpty={() => rows.length === 0}
				loading={<Skeleton className="h-16 w-full rounded-card" />}
				empty={
					<EmptyState
						data-testid="canon-questions-empty"
						compact
						icon={CircleHelp}
						title={`No ${status} questions`}
						description={
							status === "open"
								? "Canon has nothing it needs you to decide."
								: "None settled this way yet."
						}
					/>
				}
				error={ErrorState}
			>
				{() => (
					<ul className="flex flex-col divide-y divide-border">
						{rows.map((q) =>
							q.status === "open" ? (
								<li key={q.id} className="py-2.5">
									<CanonQuestionCard question={q} intakeId={intakeId} />
								</li>
							) : (
								<SettledQuestion key={q.id} question={q} />
							),
						)}
					</ul>
				)}
			</Surface>
		</SectionPanel>
	);
}

/** A settled question: what was asked, how it was settled, by whom and when. */
export function SettledQuestion({ question: q }: { question: CanonQuestion }) {
	const answer = q.answer
		? [...q.answer.selected, ...(q.answer.other ? [q.answer.other] : [])]
		: [];
	return (
		<li
			data-testid={`canon-settled-${q.id}`}
			data-status={q.status}
			className="flex flex-col gap-1 py-2.5"
		>
			<span className="flex items-center gap-2">
				<Badge variant="tag">{q.header}</Badge>
				<span className="type-small font-medium text-text">{q.question}</span>
			</span>
			{answer.length > 0 ? (
				<p
					data-testid={`canon-settled-${q.id}-answer`}
					className="type-small break-words text-text"
				>
					{`Answer: ${answer.join(", ")}`}
				</p>
			) : (
				<p className="type-small text-text-muted">
					{q.status === "acknowledged"
						? "Acknowledged, not answered."
						: "Dismissed."}
				</p>
			)}
			{q.effectMd ? (
				<Markdown
					text={q.effectMd}
					className="text-text-muted"
					data-testid={`canon-settled-${q.id}-effect`}
				/>
			) : null}
			{q.decidedBy && q.decidedAt ? (
				<p className="type-caption text-text-subtle">
					<span>{q.decidedBy.display}</span>{" "}
					<time dateTime={q.decidedAt} title={q.decidedAt}>
						{shortStamp(q.decidedAt)}
					</time>
				</p>
			) : null}
		</li>
	);
}
