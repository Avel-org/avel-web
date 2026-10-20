import type { Finding, FindingStatus } from "avel-server/contract";
import { Check, SearchCheck, X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { tabsListVariants } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
	useConfirmFinding,
	useDismissFinding,
	useFindings,
	useGateRun,
	useGateRuns,
} from "@/lib/api/gate";
import { describeError } from "@/lib/error-map";
import { cn } from "@/lib/utils";
import { useIsPreview } from "@/shell/auth-gate";
import { ActionModal } from "./action-modal";
import { EmptyState } from "./empty-state";
import { SEVERITY } from "./gate-copy";
import { Paging, PanelFooter } from "./panel-footer";
import { Reason } from "./reason";
import { SectionPanel } from "./section-panel";
import { StatusGlyph, StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/*
 * The mission's findings (module 9): what judges filed, triaged once by the
 * operator. Open blocks the gate; confirmed blocks unless overridden;
 * dismissed passes, with the operator's reason. One status at a time, with
 * each status's count over the whole mission.
 */

const STATUSES = [
	{ id: "open", label: "Open" },
	{ id: "confirmed", label: "Confirmed" },
	{ id: "dismissed", label: "Dismissed" },
] as const satisfies readonly { id: FindingStatus; label: string }[];

const EMPTY_COPY = {
	open: "No finding is waiting for triage.",
	confirmed: "No finding has been confirmed.",
	dismissed: "No finding has been dismissed.",
} as const satisfies Record<FindingStatus, string>;

export function FindingsPanel({
	missionId,
	initialStatus = "open",
}: {
	missionId: string;
	/** For a test: start on this status. */
	initialStatus?: FindingStatus;
}) {
	const [status, setStatus] = useState<FindingStatus>(initialStatus);
	const findings = useFindings(missionId, status);
	const blocking = useBlockingFindings(missionId);
	const first = findings.data?.pages[0]?.meta;
	const rows = findings.data?.pages.flatMap((p) => p.data) ?? [];
	return (
		<SectionPanel
			title="Findings"
			data-testid="findings-panel"
			count={first ? first.counts.open : undefined}
			footer={
				<PanelFooter data-testid="findings-read-age" queries={[findings]}>
					{findings.data ? (
						<Paging
							testIdPrefix="findings"
							loaded={rows.length}
							total={first?.counts[status]}
							hasMore={findings.hasNextPage}
							loadingMore={findings.isFetchingNextPage}
							onLoadMore={() => findings.fetchNextPage()}
						/>
					) : null}
				</PanelFooter>
			}
		>
			{/* In the body, not the header: the row wraps on a phone. */}
			<fieldset
				data-testid="findings-status"
				// Three segments with counts wrap rather than overflow a phone.
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
						data-testid={`findings-status-${s.id}`}
						onClick={() => setStatus(s.id)}
					>
						{s.label}
						{first ? (
							<span className="type-mono text-text-subtle tabular-nums">
								{first.counts[s.id]}
							</span>
						) : null}
					</Button>
				))}
			</fieldset>
			<Surface
				data-testid="findings-list"
				query={findings}
				isEmpty={() => rows.length === 0}
				loading={
					<div className="flex flex-col gap-2">
						{[0, 1].map((i) => (
							<Skeleton key={i} className="h-10 w-full rounded-control" />
						))}
					</div>
				}
				empty={
					<EmptyState
						data-testid="findings-empty"
						compact
						icon={SearchCheck}
						title={`No ${status} findings`}
						description={EMPTY_COPY[status]}
					/>
				}
				error={ErrorState}
			>
				{() => (
					<ul className="flex flex-col divide-y divide-border">
						{rows.map((f) => (
							<FindingRow
								key={f.id}
								finding={f}
								missionId={missionId}
								blocking={blocking.has(f.id)}
							/>
						))}
					</ul>
				)}
			</Surface>
		</SectionPanel>
	);
}

/**
 * The findings the latest gate run blocks on, by id: its blocking reasons
 * name a judge's finding by its uuid. Read from the run, so a finding shows
 * as blocking exactly when the receipt says it does, and no sooner.
 */
export function useBlockingFindings(missionId: string): ReadonlySet<string> {
	const runs = useGateRuns(missionId);
	const latest = runs.data?.pages[0]?.data[0] ?? null;
	const run = useGateRun(missionId, latest?.id ?? null);
	return new Set(
		run.data?.reasons
			.filter((r) => r.effect === "block")
			.map((r) => r.findingId) ?? [],
	);
}

/** One finding: its severity, what it is, the rule and who caught it. */
export function FindingRow({
	finding,
	missionId,
	blocking = false,
}: {
	finding: Finding;
	missionId: string;
	/** The latest gate run blocks on it: a join, never a field it carries. */
	blocking?: boolean;
}) {
	const preview = useIsPreview();
	const confirm = useConfirmFinding(missionId);
	const [dismissing, setDismissing] = useState(false);
	const severity = SEVERITY[finding.severity];
	const signIn = preview ? "Sign in to triage findings" : undefined;
	return (
		<li
			data-testid={`finding-${finding.id}`}
			data-status={finding.status}
			className="flex flex-col gap-1.5 py-2.5"
		>
			{/* The actions drop under the text when the row is narrow. */}
			<div className="flex flex-wrap items-start gap-2.5">
				<StatusPill
					size="sm"
					tone={severity.tone}
					label={severity.label}
					data-testid={`finding-${finding.id}-severity`}
				/>
				<div className="flex min-w-48 flex-1 flex-col gap-0.5">
					<p className="type-small font-medium break-words text-text">
						{finding.subject}
					</p>
					{/* Two facts, two elements with a gap: no middle dot (ruling 4). */}
					<p className="flex flex-wrap gap-x-3 type-caption text-text-muted">
						<span
							title={finding.rule}
							className="min-w-0 max-w-full truncate type-mono"
						>
							{finding.rule}
						</span>
						<span>{finding.class}</span>
						<span>{`Caught by ${finding.caughtBy}`}</span>
					</p>
					{blocking ? (
						<a
							href="#gate"
							data-testid={`finding-${finding.id}-blocking`}
							className="inline-flex w-fit items-center gap-1 type-caption text-gate-block underline decoration-gate-block-line underline-offset-2 hover:decoration-current"
						>
							<StatusGlyph tone="block" />
							Blocking the gate
						</a>
					) : null}
					{finding.status === "dismissed" && finding.dismissedReason ? (
						<p
							data-testid={`finding-${finding.id}-dismissed-reason`}
							className="type-caption text-text-muted"
						>
							{`Dismissed: ${finding.dismissedReason}`}
						</p>
					) : null}
				</div>
				{finding.status === "open" ? (
					<div className="flex shrink-0 items-center gap-1.5">
						<Button
							type="button"
							variant="secondary"
							size="sm"
							data-testid={`finding-${finding.id}-confirm`}
							disabledReason={
								signIn ?? (confirm.isPending ? "Confirming" : undefined)
							}
							onClick={() => confirm.mutate(finding.id)}
						>
							<Check aria-hidden="true" />
							Confirm
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							data-testid={`finding-${finding.id}-dismiss`}
							disabledReason={signIn}
							onClick={() => setDismissing(true)}
						>
							<X aria-hidden="true" />
							Dismiss
						</Button>
					</div>
				) : null}
			</div>
			{confirm.error ? (
				<Reason data-testid={`finding-${finding.id}-refused`}>
					{describeError(confirm.error).what}
				</Reason>
			) : null}
			{dismissing ? (
				<DismissFinding
					finding={finding}
					missionId={missionId}
					onClose={() => setDismissing(false)}
				/>
			) : null}
		</li>
	);
}

/** Dismissing asks why: the reason is required, and kept on the finding. */
export function DismissFinding({
	finding,
	missionId,
	onClose,
}: {
	finding: Finding;
	missionId: string;
	onClose: () => void;
}) {
	const dismiss = useDismissFinding(missionId);
	const [reason, setReason] = useState("");
	const fieldId = useId();
	return (
		<ActionModal
			open
			onOpenChange={(open) => {
				if (!open) {
					dismiss.reset();
					onClose();
				}
			}}
			size="confirm"
			title="Dismiss finding"
			description={finding.subject}
			dirty={reason.trim() !== ""}
			submitLabel="Dismiss finding"
			pendingLabel="Dismissing"
			submitDisabledReason={
				reason.trim() === "" ? "Say why it isn't a defect." : undefined
			}
			onSubmit={() =>
				dismiss.mutate(
					{ id: finding.id, reason: reason.trim() },
					{ onSuccess: onClose },
				)
			}
			pending={dismiss.isPending}
			error={dismiss.error}
			data-testid="finding-dismiss"
		>
			<div className="flex flex-col gap-1.5">
				<label htmlFor={fieldId} className="type-small font-medium text-text">
					Why it isn't a defect
				</label>
				<Textarea
					id={fieldId}
					data-testid="finding-dismiss-reason"
					rows={3}
					value={reason}
					onChange={(e) => setReason(e.target.value)}
				/>
				<p className="type-caption text-text-muted">
					Dismissed findings pass the gate. The reason stays on the finding.
				</p>
			</div>
		</ActionModal>
	);
}
