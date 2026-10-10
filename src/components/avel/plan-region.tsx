import type { MissionPlan, MissionStatus } from "avel-server/contract";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiError } from "@/lib/api";
import { preconditionReason } from "@/lib/api/clients";
import { useMissionPlan, useSaveMissionPlan } from "@/lib/api/mission-plans";
import { PRECONDITION_COPY } from "@/lib/error-map";
import { PlanEditor } from "./plan-editor";
import { ErrorState, Surface } from "./surface";

const NOT_EDITABLE = PRECONDITION_COPY.mission_not_editable;

/** Why the plan cannot change, or null when it can. */
export function planReadOnlyReason(
	status: MissionStatus,
	error: ApiError | null,
): string | null {
	// A save refused because the mission left draft since the page loaded.
	if (
		status !== "draft" ||
		preconditionReason(error) === "mission_not_editable"
	)
		return `${NOT_EDITABLE.what} ${NOT_EDITABLE.next}`;
	return null;
}

/**
 * A mission's plan, loaded and saved, as one region. It brings no container
 * of its own: the caller puts it in a page or a sheet. Only a draft
 * mission's plan can change; any other is shown read-only with the reason.
 */
export function PlanRegion({
	missionId,
	status,
}: {
	missionId: string;
	status: MissionStatus;
}) {
	const query = useMissionPlan(missionId);
	const save = useSaveMissionPlan(missionId);
	return (
		<Surface
			data-testid="plan-region"
			query={query}
			// A plan is one record: it is either there or an error.
			isEmpty={() => false}
			loading={<PlanSkeleton />}
			empty={null}
			error={ErrorState}
		>
			{(plan: MissionPlan) => (
				<PlanEditor
					// A saved plan arrives as a new object: start again from it, so
					// the check and the locks are the stored ones.
					key={query.dataUpdatedAt}
					plan={plan}
					readOnlyReason={planReadOnlyReason(status, save.error)}
					pending={save.isPending}
					error={save.error}
					onSave={(body) =>
						save.mutate(body, {
							onSuccess: (saved) =>
								toast.success(
									saved.check.passed
										? "Plan saved. The check passes."
										: "Plan saved. The check lists what is left to do.",
								),
						})
					}
				/>
			)}
		</Surface>
	);
}

export function PlanSkeleton() {
	return (
		<div data-testid="plan-skeleton" className="flex flex-col gap-4">
			<Skeleton className="h-5 w-32" />
			<Skeleton className="h-16 w-full" />
			{[0, 1].map((i) => (
				<Skeleton key={i} className="h-24 w-full" />
			))}
		</div>
	);
}
