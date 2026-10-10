import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMission } from "./mission-data";
import { MissionRowsSkeleton } from "./mission-panels";
import { PlanRegion } from "./plan-region";
import { ErrorState, Surface } from "./surface";

/**
 * The plan editor as a page (/missions/$id/plan). The mission is loaded for
 * its status: only a draft's plan can change.
 *
 * The top of the page is left for the readiness card, which comes next.
 */
export function MissionPlanPage({ id }: { id: string }) {
	const mission = useMission(id);
	return (
		<div data-testid="plan-page" className="flex flex-col gap-6">
			{/* Readiness card: next round. */}
			<Surface
				data-testid="plan-page-mission"
				query={mission}
				loading={<MissionRowsSkeleton rows={4} testId="plan-page-skeleton" />}
				// A mission is never "empty": it exists, or it is not found.
				empty={null}
				isEmpty={() => false}
				error={ErrorState}
			>
				{(detail) => (
					<PlanRegion missionId={detail.id} status={detail.status} />
				)}
			</Surface>
		</div>
	);
}

/**
 * The way from a mission to its plan, for the mission page's Brief panel.
 * Always shown: a mission that is not a draft opens the plan read-only.
 */
export function PlanLink({ missionId }: { missionId: string }) {
	return (
		<Button asChild variant="ghost" size="sm">
			<Link
				to="/missions/$id/plan"
				params={{ id: missionId }}
				data-testid="mission-plan-open"
			>
				Edit plan
				<ArrowUpRight aria-hidden="true" />
			</Link>
		</Button>
	);
}
