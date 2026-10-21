import type { Intake } from "avel-server/contract";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	briefFromLines,
	criterionLines,
	questionsFromLines,
	requirementLines,
	useActiveConnectionsFor,
	useApproveIntake,
	useReadRepo,
	useRejectIntake,
	useReviseIntake,
} from "@/lib/api/intakes";
import {
	ActionModal,
	type IssuePath,
	ModalField,
	useFieldIssues,
} from "./action-modal";
import { parseSpendLimit, SpendLimitInput } from "./spend-limit";
import { useOpenGeneration } from "./use-open-generation";

type IntakeModalProps = {
	intake: Intake;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

/*
 * The intake's writes, each in the one modal shell (ruling 35). The server's
 * issues land on the field their path names; what no field holds shows in
 * the refusal row. Reject is irreversible, so it says what happens and ends
 * on the filled danger confirm (audit D7).
 */

// ---------------------------------------------------------------------------
// Revise.

/** Which Revise field a server issue belongs to. */
export function reviseFieldOf(path: IssuePath): string | null {
	const [top, part] = path;
	if (top === "sourceMd") return "source";
	if (top === "openQuestions") return "questions";
	if (top !== "proposedBrief") return null;
	if (part === "summary") return "summary";
	if (part === "requirements") return "requirements";
	if (part === "acceptanceCriteria") return "criteria";
	return null;
}

/** The Revise fields, as lines, from an intake. */
export function reviseFieldsOf(intake: Intake) {
	return {
		source: intake.sourceMd,
		summary: intake.proposedBrief?.summary ?? "",
		requirements: requirementLines(intake.proposedBrief),
		criteria: criterionLines(intake.proposedBrief),
		questions: intake.openQuestions.join("\n"),
	};
}

function ReviseIntakeForm({
	intake,
	open,
	onOpenChange,
}: {
	intake: Intake;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const revise = useReviseIntake(intake.id);
	const live = reviseFieldsOf(intake);
	// The draft and what it is compared with are both the intake as it was
	// when this opened. A Canon turn can refetch the intake underneath; that
	// must not make an untouched draft look edited, and Save must not write
	// the older brief over Canon's newer one.
	const [initial] = useState(live);
	const [draft, setDraft] = useState(initial);
	const moved = (Object.keys(initial) as (keyof typeof initial)[]).some(
		(k) => live[k] !== initial[k],
	);
	const set = (key: keyof typeof initial) => (value: string) =>
		setDraft((d) => ({ ...d, [key]: value }));
	const { brief, issues } = briefFromLines({
		summary: draft.summary,
		requirements: draft.requirements,
		criteria: draft.criteria,
		checks: intake.proposedBrief?.checks,
	});
	const lineError = (field: "requirements" | "criteria") =>
		issues.find((i) => i.field === field)?.message;
	const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some(
		(k) => draft[k] !== initial[k],
	);
	const hasBrief =
		draft.summary.trim() !== "" ||
		draft.requirements.trim() !== "" ||
		draft.criteria.trim() !== "";
	const submit = () =>
		revise.mutate(
			{
				sourceMd: draft.source,
				proposedBrief: hasBrief ? brief : null,
				openQuestions: questionsFromLines(draft.questions),
			},
			{
				onSuccess: () => {
					toast.success("Intake saved");
					onOpenChange(false);
				},
			},
		);
	return (
		<ActionModal
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					revise.reset();
					setDraft(initial);
				}
				onOpenChange(next);
			}}
			size="form"
			title="Revise intake"
			description={
				intake.status === "proposed"
					? "Saving sends this proposed intake back to draft, to be proposed again."
					: "The brief Canon drafts and you approve: its summary, requirements and their criteria, and what is still open."
			}
			dirty={dirty}
			submitLabel="Save intake"
			onSubmit={submit}
			pending={revise.isPending}
			submitDisabledReason={
				moved
					? "Canon changed this intake since you opened it. Close and open Revise again to edit the new version."
					: issues.length > 0
						? "Fix the lines that are not in the form first."
						: !dirty
							? "Nothing has changed."
							: undefined
			}
			error={revise.error}
			fieldOf={reviseFieldOf}
			data-testid="intake-revise"
		>
			<ModalField name="summary" label="Summary" testid="intake-revise-summary">
				{(props) => (
					<Textarea
						{...props}
						rows={3}
						value={draft.summary}
						onChange={(e) => set("summary")(e.target.value)}
					/>
				)}
			</ModalField>
			<ModalField
				name="requirements"
				label="Requirements"
				hint="One per line: R1, then the requirement"
				error={lineError("requirements")}
				testid="intake-revise-requirements"
			>
				{(props) => (
					<Textarea
						{...props}
						rows={5}
						className="type-mono"
						value={draft.requirements}
						onChange={(e) => set("requirements")(e.target.value)}
					/>
				)}
			</ModalField>
			<ModalField
				name="criteria"
				label="Acceptance criteria"
				hint="One per line: AC1 R1, then the criterion"
				error={lineError("criteria")}
				testid="intake-revise-criteria"
			>
				{(props) => (
					<Textarea
						{...props}
						rows={5}
						className="type-mono"
						value={draft.criteria}
						onChange={(e) => set("criteria")(e.target.value)}
					/>
				)}
			</ModalField>
			<ModalField
				name="questions"
				label="Open questions"
				hint="One per line"
				testid="intake-revise-questions"
			>
				{(props) => (
					<Textarea
						{...props}
						rows={3}
						value={draft.questions}
						onChange={(e) => set("questions")(e.target.value)}
					/>
				)}
			</ModalField>
			<ModalField
				name="source"
				label="Source"
				hint="Markdown"
				testid="intake-revise-source"
			>
				{(props) => (
					<Textarea
						{...props}
						rows={6}
						value={draft.source}
						onChange={(e) => set("source")(e.target.value)}
					/>
				)}
			</ModalField>
		</ActionModal>
	);
}

/**
 * ReviseIntake keyed on each opening, so it starts from the intake as it is now:
 * the modal stays mounted while closed, and a form seeded once would carry
 * an older intake into the next save (review 3).
 */
export function ReviseIntakeModal(props: IntakeModalProps) {
	const generation = useOpenGeneration(props.open);
	return <ReviseIntakeForm key={generation} {...props} />;
}

// ---------------------------------------------------------------------------
// Read the repository.

function ReadRepoForm({
	intake,
	open,
	onOpenChange,
}: {
	intake: Intake;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const read = useReadRepo(intake.id);
	const connections = useActiveConnectionsFor(intake.engagementId);
	const choices = connections.data ?? [];
	const [connectionId, setConnectionId] = useState<string>("");
	const [repoUrl, setRepoUrl] = useState(intake.repoUrl ?? "");
	const [ref, setRef] = useState("");
	const chosen = connectionId || choices[0]?.id || "";
	const submit = () =>
		read.mutate(
			{
				connectionId: chosen,
				repoUrl: repoUrl.trim(),
				...(ref.trim() ? { ref: ref.trim() } : {}),
			},
			{
				onSuccess: (done) => {
					toast.success(
						done.derivedCut
							? `Repository read: a ${done.derivedCut} cut`
							: "Repository read",
					);
					onOpenChange(false);
				},
			},
		);
	return (
		<ActionModal
			open={open}
			onOpenChange={(next) => {
				if (!next) read.reset();
				onOpenChange(next);
			}}
			size="form"
			title="Read repository"
			description="Reads the repository once, through one of this engagement's connections, and records its cut, conventions and boundaries with their evidence. A read again replaces them; the intake's status stays."
			dirty={repoUrl !== (intake.repoUrl ?? "") || ref !== ""}
			submitLabel="Read repository"
			pendingLabel="Reading"
			onSubmit={submit}
			pending={read.isPending}
			submitDisabledReason={
				connections.status === "pending"
					? "Reading this engagement's connections."
					: choices.length === 0
						? "This engagement has no active connection. Add one in Settings, Connections."
						: repoUrl.trim() === ""
							? "Give the repository's URL."
							: undefined
			}
			error={read.error}
			data-testid="intake-read-repo"
		>
			<ModalField
				name="connectionId"
				label="Connection"
				testid="intake-read-repo-connection"
			>
				{(props) => (
					<Select
						value={chosen}
						onValueChange={setConnectionId}
						disabled={choices.length === 0}
					>
						<SelectTrigger {...props} className="w-full">
							<SelectValue placeholder="No active connection" />
						</SelectTrigger>
						<SelectContent>
							{choices.map((c) => (
								<SelectItem key={c.id} value={c.id}>
									{c.label}
									<span className="type-mono text-text-subtle">
										{c.scopeValue}
									</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</ModalField>
			<ModalField
				name="repoUrl"
				label="Repository"
				testid="intake-read-repo-url"
			>
				{(props) => (
					<Input
						{...props}
						placeholder="https://github.com/owner/repo"
						value={repoUrl}
						onChange={(e) => setRepoUrl(e.target.value)}
					/>
				)}
			</ModalField>
			<ModalField
				name="ref"
				label="Branch, tag or commit"
				hint="Optional: the default branch otherwise"
				testid="intake-read-repo-ref"
			>
				{(props) => (
					<Input
						{...props}
						value={ref}
						onChange={(e) => setRef(e.target.value)}
					/>
				)}
			</ModalField>
		</ActionModal>
	);
}

/**
 * ReadRepo keyed on each opening, so it starts from the intake as it is now:
 * the modal stays mounted while closed, and a form seeded once would carry
 * an older intake into the next save (review 3).
 */
export function ReadRepoModal(props: IntakeModalProps) {
	const generation = useOpenGeneration(props.open);
	return <ReadRepoForm key={generation} {...props} />;
}

// ---------------------------------------------------------------------------
// Approve.

/** Which Approve field a server issue belongs to; Canon's questions have their own list. */
export function approveFieldOf(path: IssuePath): string | null {
	const [top] = path;
	if (top === "missionType" || top === "repoUrl" || top === "spendCeilingUsd")
		return top;
	if (top === "acknowledged" || top === "openQuestions") return "acknowledged";
	if (top === "canonQuestions") return "canonQuestions";
	return null;
}

/** Whether every open question is ticked: approve sends them all, word for word. */
export function allAcknowledged(
	open: readonly string[],
	ticked: ReadonlySet<string>,
): boolean {
	return open.every((q) => ticked.has(q));
}

function ApproveIntakeForm({
	intake,
	open,
	onOpenChange,
}: {
	intake: Intake;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const approve = useApproveIntake(intake.id);
	const [missionType, setMissionType] = useState("");
	const [repoUrl, setRepoUrl] = useState(intake.repoUrl ?? "");
	const [limit, setLimit] = useState("");
	const parsedLimit = parseSpendLimit(limit);
	const [ticked, setTicked] = useState<Set<string>>(new Set());
	const toggle = (q: string) =>
		setTicked((prev) => {
			const next = new Set(prev);
			if (next.has(q)) next.delete(q);
			else next.add(q);
			return next;
		});
	const submit = () => {
		if (parsedLimit !== null && "problem" in parsedLimit) return;
		approve.mutate(
			{
				missionType: missionType.trim(),
				repoUrl: repoUrl.trim(),
				// Optional: left empty, the mission has no limit.
				...(parsedLimit ? { spendCeilingUsd: parsedLimit.value } : {}),
				acknowledged: intake.openQuestions.filter((q) => ticked.has(q)),
			},
			{
				onSuccess: () => {
					toast.success("Intake approved: its mission is created");
					onOpenChange(false);
				},
			},
		);
	};
	return (
		<ActionModal
			open={open}
			onOpenChange={(next) => {
				if (!next) approve.reset();
				onOpenChange(next);
			}}
			size="form"
			title="Approve intake"
			description="Approving creates the mission from this brief. The server checks the brief again, and every open question must be acknowledged."
			dirty={missionType !== "" || limit !== "" || ticked.size > 0}
			submitLabel="Approve and create mission"
			pendingLabel="Approving"
			onSubmit={submit}
			pending={approve.isPending}
			submitDisabledReason={
				missionType.trim() === ""
					? "Give the mission type."
					: !repoUrl.trim().startsWith("https://")
						? "Give the repository's https URL."
						: parsedLimit !== null && "problem" in parsedLimit
							? parsedLimit.problem
							: !allAcknowledged(intake.openQuestions, ticked)
								? "Acknowledge every open question."
								: undefined
			}
			error={approve.error}
			fieldOf={approveFieldOf}
			data-testid="intake-approve"
		>
			<ModalField
				name="missionType"
				label="Mission type"
				hint="The playbook's type, such as template-booking"
				testid="intake-approve-type"
			>
				{(props) => (
					<Input
						{...props}
						className="type-mono"
						value={missionType}
						onChange={(e) => setMissionType(e.target.value)}
					/>
				)}
			</ModalField>
			<ModalField
				name="repoUrl"
				label="Repository"
				testid="intake-approve-repo"
			>
				{(props) => (
					<Input
						{...props}
						placeholder="https://github.com/owner/repo"
						value={repoUrl}
						onChange={(e) => setRepoUrl(e.target.value)}
					/>
				)}
			</ModalField>
			<ModalField
				name="spendCeilingUsd"
				label="Spend limit"
				hint="Optional, in USD. The runner halts the mission there."
				testid="intake-approve-spend"
			>
				{(props) => (
					<SpendLimitInput {...props} value={limit} onChange={setLimit} />
				)}
			</ModalField>
			{intake.openQuestions.length > 0 ? (
				<fieldset
					data-testid="intake-approve-acknowledged"
					className="flex flex-col gap-2"
				>
					<legend className="mb-1.5 type-small font-medium text-foreground">
						Acknowledge each open question
					</legend>
					{intake.openQuestions.map((q, i) => {
						const id = `intake-approve-q-${i}`;
						return (
							<div key={q} className="flex items-start gap-2 type-small">
								<Checkbox
									id={id}
									data-testid={id}
									checked={ticked.has(q)}
									onCheckedChange={() => toggle(q)}
									className="mt-0.5"
								/>
								<label htmlFor={id} className="text-text">
									{q}
								</label>
							</div>
						);
					})}
					<FieldMessages name="acknowledged" />
				</fieldset>
			) : null}
			<CanonQuestions
				onShow={() => {
					onOpenChange(false);
					// After the dialog lets go of the page, so the scroll lands.
					requestAnimationFrame(() =>
						document
							.getElementById(CANON_QUESTIONS_ID)
							?.scrollIntoView({ behavior: "smooth", block: "start" }),
					);
				}}
			/>
		</ActionModal>
	);
}

/**
 * ApproveIntake keyed on each opening, so it starts from the intake as it is now:
 * the modal stays mounted while closed, and a form seeded once would carry
 * an older intake into the next save (review 3).
 */
export function ApproveIntakeModal(props: IntakeModalProps) {
	const generation = useOpenGeneration(props.open);
	return <ApproveIntakeForm key={generation} {...props} />;
}

function FieldMessages({ name }: { name: string }) {
	const messages = useFieldIssues(name);
	if (messages.length === 0) return null;
	return <p className="type-caption text-destructive">{messages.join(" ")}</p>;
}

/**
 * Canon's questions an approval was refused for (intake_questions_open):
 * each by its header. Canon's question screen is not built, so this says
 * where they are answered and offers no way to answer them here.
 */
/** Where the intake page's Canon questions panel is, for the way there. */
export const CANON_QUESTIONS_ID = "canon-questions";

function CanonQuestions({ onShow }: { onShow: () => void }) {
	const headers = useFieldIssues("canonQuestions");
	if (headers.length === 0) return null;
	return (
		<section
			aria-label="Canon's open questions"
			data-testid="intake-approve-canon-questions"
			className="flex flex-col gap-2 rounded-card border border-gate-warn-line bg-gate-warn-banner p-3"
		>
			<h3 className="type-eyebrow">Canon's open questions</h3>
			<ul className="flex list-disc flex-col gap-1 pl-4 type-small text-text">
				{headers.map((header) => (
					<li key={header}>{header}</li>
				))}
			</ul>
			<p className="flex flex-wrap items-center gap-2 type-caption text-text-muted">
				<span data-testid="intake-approve-canon-note">
					Answer, acknowledge or dismiss each one in Canon's questions, then
					approve again.
				</span>
				<Button
					variant="outline"
					size="sm"
					data-testid="intake-approve-canon-go"
					onClick={onShow}
				>
					Go to the questions
				</Button>
			</p>
		</section>
	);
}

// ---------------------------------------------------------------------------
// Reject.

function RejectIntakeForm({
	intake,
	open,
	onOpenChange,
}: {
	intake: Intake;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const reject = useRejectIntake(intake.id);
	const [reason, setReason] = useState("");
	const submit = () =>
		reject.mutate(reason.trim(), {
			onSuccess: () => {
				toast.success("Intake rejected");
				onOpenChange(false);
			},
		});
	return (
		<ActionModal
			open={open}
			onOpenChange={(next) => {
				if (!next) reject.reset();
				onOpenChange(next);
			}}
			size="confirm"
			title="Reject intake"
			description="A rejected intake is final."
			dirty={reason !== ""}
			submitLabel="Reject intake"
			pendingLabel="Rejecting"
			destructive
			onSubmit={submit}
			pending={reject.isPending}
			submitDisabledReason={
				reason.trim() === "" ? "Say why it is rejected." : undefined
			}
			error={reject.error}
			data-testid="intake-reject"
		>
			<section
				aria-label="What happens"
				data-testid="intake-reject-effects"
				className="flex flex-col gap-2 rounded-card border border-border bg-app-well p-3"
			>
				<h3 className="type-eyebrow">What happens</h3>
				<ul className="flex list-disc flex-col gap-1 pl-4 type-small text-text">
					<li>
						It becomes Rejected, which is final: it can't be revised, proposed
						or approved.
					</li>
					<li>No mission is created from it.</li>
					<li>The reason is recorded in the activity log.</li>
				</ul>
			</section>
			<ModalField name="reason" label="Why" testid="intake-reject-reason">
				{(props) => (
					<Textarea
						{...props}
						rows={3}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
					/>
				)}
			</ModalField>
		</ActionModal>
	);
}

/**
 * RejectIntake keyed on each opening, so it starts from the intake as it is now:
 * the modal stays mounted while closed, and a form seeded once would carry
 * an older intake into the next save (review 3).
 */
export function RejectIntakeModal(props: IntakeModalProps) {
	const generation = useOpenGeneration(props.open);
	return <RejectIntakeForm key={generation} {...props} />;
}
