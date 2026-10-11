import { Link } from "@tanstack/react-router";
import type {
	CoherenceResult,
	MissionDetail,
	MissionPlan,
} from "avel-server/contract";
import { ArrowRight, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiError } from "@/lib/api/errors";
import {
	issueTarget,
	planAnchor,
	useMissionPlan,
} from "@/lib/api/mission-plans";
import { blockCopy, useCoherence, warningCopy } from "./playbook-coherence";
import { Surface, type SurfaceQuery } from "./surface";

/** What stands between the mission and shipping, one row each. */
type UnblockRow = {
	key: string;
	/** The server's message for a plan issue; the copy for coherence. */
	message: string;
	/** One line on why it matters. */
	why: string;
	/** Where Resolve goes. */
	to: "plan" | "playbook";
	/** The plan item to focus, as the plan page's hash. */
	hash?: string;
	/** A count, never a score: "Clears 1 block", "Issue 1 of 3". */
	count: string;
};

const WHY = {
	block: "The export gate refuses this mission until it clears.",
	warning: "The export gate warns on this; it does not block.",
	plan: "The plan is ready only when its check passes.",
} as const;

/**
 * The rows, blocks first: the coherence block, its warnings, then each plan
 * check issue in the server's order. Plan issues keep their message as the
 * server wrote it and resolve to the item they are on, by path.
 */
export function unblockRows(
	plan: MissionPlan,
	coherence: CoherenceResult | null,
): UnblockRow[] {
	const rows: UnblockRow[] = [];
	if (coherence?.block) {
		rows.push({
			key: "block",
			message: blockCopy(coherence.block),
			why: WHY.block,
			to: "playbook",
			count: "Clears 1 block",
		});
	}
	for (const [i, warning] of (coherence?.warnings ?? []).entries()) {
		rows.push({
			key: `warning-${i}`,
			message: warningCopy(warning),
			why: WHY.warning,
			to: "playbook",
			count: `Warning ${i + 1} of ${coherence?.warnings.length ?? 0}`,
		});
	}
	const issues = plan.check.issues;
	for (const [i, issue] of issues.entries()) {
		const target = issueTarget(issue.path, plan.brief);
		rows.push({
			key: `issue-${i}`,
			message: issue.message,
			why: WHY.plan,
			to: "plan",
			...(target === null ? {} : { hash: planAnchor(target) }),
			count: `Issue ${i + 1} of ${issues.length}`,
		});
	}
	return rows;
}

/**
 * "What unblocks shipping": the mission hub's to-do card. Coherence is read
 * the way the playbook page reads it, keyed on the mission's live playbook;
 * a mission with none has nothing to check its roster against.
 */
export function UnblockCard({
	mission,
}: {
	mission: Pick<MissionDetail, "id" | "cut" | "playbook">;
}) {
	return mission.playbook ? (
		<WithCoherence
			mission={mission}
			missionType={mission.playbook.missionType}
		/>
	) : (
		<UnblockBody missionId={mission.id} coherence={null} />
	);
}

function WithCoherence({
	mission,
	missionType,
}: {
	mission: Pick<MissionDetail, "id" | "cut">;
	missionType: string;
}) {
	const result = useCoherence(mission, missionType);
	return (
		<UnblockBody
			missionId={mission.id}
			coherence={result.status === "success" ? result.data : null}
		/>
	);
}

function UnblockBody({
	missionId,
	coherence,
}: {
	missionId: string;
	/** Null until it can be read, or when there is no playbook. */
	coherence: CoherenceResult | null;
}) {
	const plan = useMissionPlan(missionId);
	const query: SurfaceQuery<UnblockRow[], ApiError> =
		plan.status === "success"
			? { status: "success", data: unblockRows(plan.data, coherence) }
			: plan.status === "error"
				? {
						status: "error",
						error: plan.error,
						refetch: plan.refetch,
						isFetching: plan.isFetching,
					}
				: { status: "pending" };
	return (
		<section
			aria-label="What unblocks shipping"
			data-testid="unblock-card"
			className="plate flex flex-col gap-3 rounded-md border p-4"
		>
			<h2 className="type-panel-title text-foreground">
				What unblocks shipping
			</h2>
			<Surface
				data-testid="unblock-rows"
				query={query}
				loading={
					<div className="flex flex-col gap-2">
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
					</div>
				}
				empty={
					<p
						data-testid="unblock-clear"
						className="type-small flex items-center gap-2 text-text-muted"
					>
						<CircleCheck aria-hidden="true" className="size-4 text-gate-pass" />
						Nothing stands in the way: the plan check passes and coherence is
						clear.
					</p>
				}
				error={() => (
					<p className="type-small text-text-muted">
						What unblocks shipping is unavailable right now.
					</p>
				)}
			>
				{(rows) => (
					<ul className="flex flex-col divide-y divide-border">
						{rows.map((row) => (
							<li
								key={row.key}
								data-testid={`unblock-${row.key}`}
								className="flex items-start gap-3 py-2"
							>
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<p className="type-small text-foreground">{row.message}</p>
									<p className="type-caption text-text-subtle">{row.why}</p>
								</div>
								<span className="type-caption shrink-0 text-text-subtle tabular-nums">
									{row.count}
								</span>
								<Button asChild size="sm" variant="ghost">
									{row.to === "plan" ? (
										<Link
											to="/missions/$id/plan"
											params={{ id: missionId }}
											hash={row.hash}
											data-testid={`unblock-resolve-${row.key}`}
										>
											Resolve
											<ArrowRight aria-hidden="true" />
										</Link>
									) : (
										<Link
											to="/missions/$id/playbook"
											params={{ id: missionId }}
											data-testid={`unblock-resolve-${row.key}`}
										>
											Resolve
											<ArrowRight aria-hidden="true" />
										</Link>
									)}
								</Button>
							</li>
						))}
					</ul>
				)}
			</Surface>
		</section>
	);
}
