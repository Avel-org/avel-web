import { Link } from "@tanstack/react-router";
import type { Client, Engagement } from "avel-server/contract";
import { FileInput, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime, useClientEngagements } from "@/lib/api/clients";
import {
	INTAKE_STATUSES,
	type Intake,
	type IntakeCounts,
	type IntakeStatus,
	useClientIntakeCounts,
	useClientIntakes,
} from "@/lib/api/intakes";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { DataPanel } from "./data-panel";
import { EmptyState } from "./empty-state";
import { INTAKE_LIFECYCLE, INTAKE_STATUS_LABEL, Lifecycle } from "./lifecycle";
import { PanelFooter } from "./panel-footer";
import { ROW_LINK_GROUP, RowChevron } from "./row-link";
import { Segmented, type SegmentOption } from "./segmented";
import { ErrorState, Surface } from "./surface";

/*
 * A client's Intakes tab (audit F7): every intake across its engagements,
 * newest first, each a row that opens it, with where it stands on its
 * lifecycle. The status segments count from the server, one exact count per
 * engagement and status, whatever has loaded.
 */

/** What a row is called: its brief's summary, else its source's first line. */
export function intakeTitle(
	intake: Pick<Intake, "proposedBrief" | "sourceMd">,
): string {
	const firstLine = (text: string) =>
		text
			.split("\n")
			.map((line) => line.replace(/^#+\s*/, "").trim())
			.find((line) => line !== "");
	return (
		(intake.proposedBrief
			? firstLine(intake.proposedBrief.summary)
			: undefined) ??
		firstLine(intake.sourceMd) ??
		"Untitled intake"
	);
}

export function ClientIntakes({
	client,
	onNewIntake,
}: {
	client: Client;
	onNewIntake?: () => void;
}) {
	const [status, setStatus] = useState<IntakeStatus | undefined>(undefined);
	const engagementsRead = useClientEngagements(client.id);
	const engagements: Engagement[] =
		engagementsRead.data?.pages.flatMap((page) => page.data) ?? [];
	const ids = engagements.map((e) => e.id);
	const list = useClientIntakes(ids, status);
	const counts = useClientIntakeCounts(ids);
	const nameOf = new Map(engagements.map((e) => [e.id, e.name]));
	const now = useNow();
	// The engagements come first: with none read, there is nothing to ask.
	const query =
		engagementsRead.status === "error"
			? {
					status: "error" as const,
					error: engagementsRead.error,
					refetch: engagementsRead.refetch,
					isFetching: engagementsRead.isFetching,
				}
			: engagementsRead.status === "pending"
				? { status: "pending" as const }
				: list;
	const total = counts.status === "success" ? sumOf(counts.data) : undefined;
	// An intake sits under an active engagement: none, no intake.
	const newReason =
		client.status === "closed"
			? "Reopen the client to add an intake."
			: client.activeEngagementCount === 0
				? "Start an engagement first: an intake sits under one."
				: undefined;
	const newButton = onNewIntake ? (
		<Button
			size="sm"
			variant="outline"
			data-testid="client-intakes-new"
			disabledReason={newReason}
			onClick={onNewIntake}
		>
			<Plus aria-hidden="true" />
			New intake
		</Button>
	) : null;

	return (
		<DataPanel
			data-testid="client-intakes"
			title="Intakes"
			count={total}
			actions={newButton}
			toolbar={
				<IntakeStatusFilter
					value={status}
					onChange={setStatus}
					counts={counts.status === "success" ? counts.data : undefined}
				/>
			}
			footer={
				<PanelFooter data-testid="client-intakes-read-age" queries={[list]}>
					{list.status === "success" ? (
						<span
							data-testid="client-intakes-showing"
							className="type-caption text-text-subtle tabular-nums"
						>
							{`Showing ${list.data.rows.length} of ${list.data.total}`}
						</span>
					) : null}
				</PanelFooter>
			}
		>
			<Surface
				data-testid="client-intakes-surface"
				query={query}
				isEmpty={(data) => data.rows.length === 0}
				loading={
					<div className="flex flex-col gap-2 p-4">
						<Skeleton className="h-12 w-full" />
						<Skeleton className="h-12 w-full" />
					</div>
				}
				empty={
					<div className="p-4">
						<EmptyState
							data-testid="client-intakes-empty"
							compact
							icon={FileInput}
							title={
								status
									? `No ${INTAKE_STATUS_LABEL[status].toLowerCase()} intakes`
									: "No intakes yet"
							}
							description={`An intake is the brief a mission starts from. None of ${client.name}'s engagements has one${status ? " in this status" : ""}.`}
							action={status ? undefined : newButton}
						/>
					</div>
				}
				error={ErrorState}
			>
				{(data) => (
					<ul
						aria-label={`${client.name}'s intakes`}
						data-testid="client-intakes-rows"
						className="flex flex-col divide-y divide-border"
					>
						{data.rows.map((intake) => (
							<li key={intake.id}>
								<IntakeRow
									intake={intake}
									clientId={client.id}
									engagement={nameOf.get(intake.engagementId)}
									now={now}
								/>
							</li>
						))}
					</ul>
				)}
			</Surface>
		</DataPanel>
	);
}

function sumOf(counts: IntakeCounts): number {
	return INTAKE_STATUSES.reduce((sum, s) => sum + counts[s], 0);
}

/** All, then each status with its exact count: one segmented control. */
function IntakeStatusFilter({
	value,
	onChange,
	counts,
}: {
	value: IntakeStatus | undefined;
	onChange: (value: IntakeStatus | undefined) => void;
	counts: IntakeCounts | undefined;
}) {
	const options: SegmentOption<IntakeStatus>[] = [
		{
			value: undefined,
			label: "All",
			...(counts ? { count: sumOf(counts) } : {}),
		},
		...INTAKE_STATUSES.map((s) => ({
			value: s,
			label: INTAKE_STATUS_LABEL[s],
			...(counts ? { count: counts[s] } : {}),
		})),
	];
	return (
		<Segmented
			data-testid="client-intakes-status"
			legend="Status"
			options={options}
			value={value}
			onChange={onChange}
		/>
	);
}

function IntakeRow({
	intake,
	clientId,
	engagement,
	now,
}: {
	intake: Intake;
	clientId: string;
	engagement: string | undefined;
	now: number;
}) {
	return (
		<Link
			to="/clients/$id/intakes/$intakeId"
			params={{ id: clientId, intakeId: intake.id }}
			data-testid={`client-intake-${intake.id}`}
			className={cn(
				ROW_LINK_GROUP,
				"focus-inset flex items-center gap-3 px-4 py-3 transition-colors duration-(--duration-micro) ease-avel hover:bg-app-raised",
			)}
		>
			<span className="flex min-w-0 flex-1 flex-col gap-1.5">
				<span className="truncate type-small font-medium text-text">
					{intakeTitle(intake)}
				</span>
				<span className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-text-subtle">
					<Lifecycle
						spec={INTAKE_LIFECYCLE}
						current={intake.status}
						label="Intake lifecycle"
						compact
						data-testid={`client-intake-${intake.id}-lifecycle`}
					/>
					<span>
						{engagement ?? "An engagement"}
						{", "}
						{`updated ${relativeTime(intake.updatedAt, now)}`}
					</span>
				</span>
			</span>
			<RowChevron />
		</Link>
	);
}
