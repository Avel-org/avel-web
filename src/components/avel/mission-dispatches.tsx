import { useQuery } from "@tanstack/react-query";
import type {
	CompletionReport,
	Dispatch,
	MissionDetail,
} from "avel-server/contract";
import { Skeleton } from "@/components/ui/skeleton";
import {
	inMotion,
	pollWhile,
	useCompletionReport,
	useMissionDispatches,
	useMissionReports,
} from "@/lib/api/dispatches";
import { useApiClient } from "@/lib/api/provider";
import { CompletionReportView, type DispatchAgent } from "./completion-report";
import { DispatchBoard, type RenderControls } from "./dispatch-board";
import { DispatchControlsLive } from "./dispatch-controls";
import { NewDispatch } from "./dispatch-new";
import { missionDetailQuery } from "./mission-data";
import { SectionPanel } from "./section-panel";
import { ErrorState, Surface } from "./surface";

/*
 * A mission's dispatches (module 6) on its page: the board, each closed card
 * opening onto its completion report, and New dispatch, Start on queued
 * cards and Halt on running ones while the mission is active. While a dispatch waits or runs, the dispatches, the reports and the
 * mission (its spend) read again every few seconds, and stop once none does.
 */

/** Each dispatch's agent by dispatch id: who produced what a report read. */
export function producersOf(
	dispatches: readonly Dispatch[],
): Record<string, DispatchAgent> {
	return Object.fromEntries(dispatches.map((d) => [d.id, d.agent]));
}

/** Reports by their id, as a dispatch's reportId points at them. */
export function reportsById(
	reports: readonly CompletionReport[] | undefined,
): Map<string, CompletionReport> {
	return new Map((reports ?? []).map((r) => [r.id, r]));
}

/** Whether the section shows: once the mission has started, or has any dispatch. */
export function showsDispatches(
	status: MissionDetail["status"],
	dispatches: readonly Dispatch[] | undefined,
): boolean {
	return status !== "draft" || (dispatches?.length ?? 0) > 0;
}

export function MissionDispatches({
	mission,
	now = Date.now(),
}: {
	mission: Pick<MissionDetail, "id" | "status">;
	now?: number;
}) {
	const api = useApiClient();
	const dispatches = useMissionDispatches(mission.id);
	const moving = inMotion(dispatches.data);
	const reports = useMissionReports(mission.id, moving);
	// The mission's spentUsd moves with its running dispatches: a second
	// observer on its detail polls only while they do.
	useQuery({
		...missionDetailQuery(api, mission.id),
		refetchInterval: pollWhile(moving),
	});

	if (!showsDispatches(mission.status, dispatches.data)) return null;

	const producers = producersOf(dispatches.data ?? []);
	const byId = reportsById(reports.data);
	const renderReport = (dispatch: Dispatch) => (
		<DispatchReport dispatch={dispatch} byId={byId} producers={producers} />
	);
	// Only an active mission's dispatches start or halt one by one; a
	// halted mission has already stopped its running ones.
	const renderControls: RenderControls | undefined =
		mission.status === "active"
			? (dispatch) => (
					<DispatchControlsLive missionId={mission.id} dispatch={dispatch} />
				)
			: undefined;

	return (
		<SectionPanel
			title="Dispatches"
			data-testid="mission-section-dispatches"
			actions={<NewDispatch mission={mission} />}
		>
			<Surface
				data-testid="mission-dispatches"
				query={dispatches}
				loading={
					<div className="grid gap-4 lg:grid-cols-3">
						<Skeleton className="h-32 w-full" />
						<Skeleton className="h-32 w-full" />
						<Skeleton className="h-32 w-full" />
					</div>
				}
				empty={
					<p
						data-testid="mission-dispatches-empty"
						className="type-small text-text-subtle"
					>
						{mission.status === "active"
							? "No dispatches yet. Queue one with New dispatch."
							: "No dispatch ran on this mission."}
					</p>
				}
				error={ErrorState}
			>
				{(data) => (
					<DispatchBoard
						dispatches={data}
						now={now}
						renderReport={renderReport}
						renderControls={renderControls}
					/>
				)}
			</Surface>
		</SectionPanel>
	);
}

/**
 * A closed dispatch's report: from the mission's list when it is there,
 * otherwise read on its own. Edge mismatches name their producers.
 */
export function DispatchReport({
	dispatch,
	byId,
	producers,
}: {
	dispatch: Dispatch;
	byId: ReadonlyMap<string, CompletionReport>;
	producers: Record<string, DispatchAgent>;
}) {
	const id = dispatch.reportId;
	if (id === null) return null;
	const testId = `completion-report-${dispatch.id}`;
	const report = byId.get(id);
	return report ? (
		<CompletionReportView
			report={report}
			dispatch={dispatch}
			producers={producers}
			data-testid={testId}
		/>
	) : (
		<ReportById
			id={id}
			dispatch={dispatch}
			producers={producers}
			testId={testId}
		/>
	);
}

/** A report not in the mission's list yet (it closed since): read on its own. */
function ReportById({
	id,
	dispatch,
	producers,
	testId,
}: {
	id: string;
	dispatch: Dispatch;
	producers: Record<string, DispatchAgent>;
	testId: string;
}) {
	const report = useCompletionReport(id);
	return (
		<Surface
			data-testid={`${testId}-surface`}
			query={report}
			isEmpty={() => false}
			loading={<Skeleton className="h-40 w-full" />}
			empty={null}
			error={ErrorState}
		>
			{(data) => (
				<CompletionReportView
					report={data}
					dispatch={dispatch}
					producers={producers}
					data-testid={testId}
				/>
			)}
		</Surface>
	);
}
