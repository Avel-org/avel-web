import type { Proposal } from "avel-server/contract";
import { Check, X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApproveProposal, useDismissProposal } from "@/lib/api/proposals";
import { describeError } from "@/lib/error-map";
import { ActionModal } from "./action-modal";
import { Reason } from "./reason";

/*
 * Pending proposals, in the top bar's inbox (ROUTES.md: proposals live in
 * the inbox and as cards in Canon's chat, never on a page of their own).
 * Each says what it would do and where it came from, and is approved or
 * dismissed with a reason. Approving starts its kind's action through the
 * normal path; until a kind's action is built the server refuses it, and
 * that refusal is shown on the proposal.
 */

export const PROPOSAL_KIND_LABEL = {
	next_module: "Next module",
	calibration: "Calibration",
	post_delivery: "Post-delivery check",
	intake_questions: "Intake questions",
} as const satisfies Record<Proposal["kind"], string>;

const SOURCE_LABEL = {
	code: "From AVEL",
	model: "From Canon",
} as const satisfies Record<Proposal["source"], string>;

/** "1 proposal", "3 proposals". */
export const proposalCountLabel = (n: number) =>
	`${n} ${n === 1 ? "proposal" : "proposals"}`;

export function ProposalsSection({
	proposals,
	count,
	failed,
}: {
	/** Undefined while they load. */
	proposals: readonly Proposal[] | undefined;
	count: number | undefined;
	failed: boolean;
}) {
	return (
		<section
			aria-label="Proposals"
			data-testid="global-inbox-proposals"
			className="border-b border-border px-3 py-2"
		>
			<p className="type-caption mb-1 flex justify-between text-text-subtle">
				<span>Proposals</span>
				{count === undefined ? null : (
					<span
						data-testid="global-inbox-proposals-count"
						className="type-mono"
					>
						{count}
					</span>
				)}
			</p>
			{failed ? (
				<p className="type-small text-text-subtle">Could not load these.</p>
			) : proposals === undefined ? (
				<p className="type-small text-text-subtle">Loading</p>
			) : proposals.length === 0 ? (
				<p
					data-testid="global-inbox-proposals-none"
					className="type-small text-text-subtle"
				>
					None waiting.
				</p>
			) : (
				<ul className="flex flex-col divide-y divide-border">
					{proposals.map((p) => (
						<li key={p.id}>
							<ProposalItem proposal={p} />
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

export function ProposalItem({ proposal }: { proposal: Proposal }) {
	const approve = useApproveProposal();
	const [dismissing, setDismissing] = useState(false);
	return (
		<div
			data-testid={`proposal-${proposal.id}`}
			data-kind={proposal.kind}
			className="flex flex-col gap-1.5 py-2"
		>
			<p className="flex flex-wrap gap-x-2 type-caption text-text-subtle">
				<span className="font-medium text-text-muted">
					{PROPOSAL_KIND_LABEL[proposal.kind]}
				</span>
				<span>{SOURCE_LABEL[proposal.source]}</span>
			</p>
			<p className="type-small break-words text-foreground">
				{proposal.summary}
			</p>
			<div className="flex items-center gap-1.5">
				<Button
					type="button"
					size="sm"
					variant="secondary"
					data-testid={`proposal-${proposal.id}-approve`}
					disabledReason={approve.isPending ? "Approving" : undefined}
					onClick={() => approve.mutate(proposal.id)}
				>
					<Check aria-hidden="true" />
					Approve
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					data-testid={`proposal-${proposal.id}-dismiss`}
					onClick={() => setDismissing(true)}
				>
					<X aria-hidden="true" />
					Dismiss
				</Button>
			</div>
			{approve.error ? (
				<Reason data-testid={`proposal-${proposal.id}-refused`}>
					{describeError(approve.error).what}
				</Reason>
			) : null}
			{dismissing ? (
				<DismissProposal
					proposal={proposal}
					onClose={() => setDismissing(false)}
				/>
			) : null}
		</div>
	);
}

/** Dismissing asks why: the reason is required, and kept on the proposal. */
function DismissProposal({
	proposal,
	onClose,
}: {
	proposal: Proposal;
	onClose: () => void;
}) {
	const dismiss = useDismissProposal();
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
			title="Dismiss proposal"
			description={proposal.summary}
			dirty={reason.trim() !== ""}
			submitLabel="Dismiss proposal"
			pendingLabel="Dismissing"
			submitDisabledReason={
				reason.trim() === "" ? "Say why it isn't wanted." : undefined
			}
			onSubmit={() =>
				dismiss.mutate(
					{ id: proposal.id, reason: reason.trim() },
					{ onSuccess: onClose },
				)
			}
			pending={dismiss.isPending}
			error={dismiss.error}
			data-testid="proposal-dismiss"
		>
			<div className="flex flex-col gap-1.5">
				<label htmlFor={fieldId} className="type-small font-medium text-text">
					Why it isn't wanted
				</label>
				<Textarea
					id={fieldId}
					data-testid="proposal-dismiss-reason"
					rows={3}
					maxLength={2000}
					value={reason}
					onChange={(e) => setReason(e.target.value)}
				/>
				<p className="type-caption text-text-muted">
					A dismissed proposal does nothing. The reason stays on it.
				</p>
			</div>
		</ActionModal>
	);
}
