import { Link } from "@tanstack/react-router";
import type { MissionListItem, Template } from "avel-server/contract";
import { Target } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
	type MissionOrigin,
	missionCountLabel,
	useTemplateMissions,
} from "@/lib/api/templates";
import { useNow } from "@/lib/use-now";
import { EmptyState } from "./empty-state";
import {
	LastActivity,
	MISSION_ROW,
	MISSION_ROW_ID,
	MISSION_ROW_SUBJECT,
	MISSION_ROW_TIME,
	MissionId,
	MissionStatusPill,
} from "./mission-columns";
import { asSurface, type MissionList, totalOf } from "./mission-data";
import { LoadMore, MissionRowsSkeleton } from "./mission-panels";
import { SectionPanel } from "./section-panel";
import { ErrorState, Surface } from "./surface";

/*
 * A template's Missions tab: the missions built from it, read from
 * missions.list scoped by templateRef (avel-server ed4c9e5). The list route
 * requires an origin and never mixes the two, so client and internal
 * missions are two panels, each with its own count from meta.total, most
 * recent activity first, each row opening its mission.
 */

const ORIGIN_PANEL = {
	client: {
		title: "Client missions",
		description: "Built for a client's engagement.",
		none: "No client missions are built from this template.",
	},
	internal: {
		title: "Internal missions",
		description: "AVEL's own runs, such as benchmarks.",
		none: "No internal missions are built from this template.",
	},
} as const satisfies Record<
	MissionOrigin,
	{ title: string; description: string; none: string }
>;

export function TemplateMissions({ template }: { template: Template }) {
	return (
		<div
			data-testid="template-missions"
			className="grid grid-cols-[minmax(0,1fr)] items-start gap-6"
		>
			<p
				data-testid="template-missions-total"
				className="type-small text-text-muted"
			>
				{`${missionCountLabel(template.missionCount)} in all, not counting deleted ones.`}
			</p>
			<OriginPanel slug={template.slug} origin="client" />
			<OriginPanel slug={template.slug} origin="internal" />
		</div>
	);
}

function OriginPanel({
	slug,
	origin,
}: {
	slug: string;
	origin: MissionOrigin;
}) {
	const list = useTemplateMissions(slug, origin);
	const copy = ORIGIN_PANEL[origin];
	const testId = `template-missions-${origin}`;
	return (
		<SectionPanel
			title={copy.title}
			description={copy.description}
			data-testid={`${testId}-panel`}
			actions={<OriginCount list={list} testId={`${testId}-count`} />}
		>
			<Surface
				data-testid={testId}
				query={asSurface(list)}
				loading={<MissionRowsSkeleton rows={3} testId={`${testId}-skeleton`} />}
				empty={
					<EmptyState
						data-testid={`${testId}-empty`}
						icon={Target}
						title={copy.none}
						description="A mission is built from a template when its plan names it."
					/>
				}
				error={ErrorState}
			>
				{(rows) => (
					<div className="-m-4 lg:-m-5">
						<MissionRows rows={rows} testId={`${testId}-rows`} />
						<LoadMore list={list} testId={`${testId}-more`} />
					</div>
				)}
			</Surface>
		</SectionPanel>
	);
}

/** The panel's count, from meta.total: exact, whatever has loaded. */
function OriginCount({ list, testId }: { list: MissionList; testId: string }) {
	const total = totalOf(list);
	if (list.status === "error") return null;
	if (total === undefined)
		return <Skeleton data-testid={`${testId}-loading`} className="h-4 w-16" />;
	return (
		<span
			data-testid={testId}
			className="type-mono-small text-text-muted tabular-nums"
		>
			{missionCountLabel(total)}
		</span>
	);
}

/** One row per mission, each a link to its page. */
function MissionRows({
	rows,
	testId,
}: {
	rows: readonly MissionListItem[];
	testId: string;
}) {
	const now = useNow();
	return (
		<ul data-testid={testId} className="flex flex-col divide-y divide-border">
			{rows.map((mission) => (
				<li key={mission.id}>
					<Link
						to="/missions/$id"
						params={{ id: mission.id }}
						data-testid={`template-mission-${mission.id}`}
						className={`${MISSION_ROW} focus-inset px-4 transition-colors duration-(--duration-micro) ease-avel hover:bg-state-hover lg:px-5`}
					>
						<span className={MISSION_ROW_ID}>
							<MissionId id={mission.id} />
						</span>
						<span className={MISSION_ROW_SUBJECT}>
							{subjectOf(mission)}
							<span className="ml-2 type-mono-small text-text-subtle">
								{`sprint ${mission.sprintN}`}
							</span>
						</span>
						<MissionStatusPill status={mission.status} />
						<span className={MISSION_ROW_TIME}>
							<LastActivity at={mission.lastActivityAt} now={now} />
						</span>
					</Link>
				</li>
			))}
		</ul>
	);
}

/** "Acme, Booking site" for a client's mission; "Internal" for AVEL's own. */
function subjectOf(mission: MissionListItem): string {
	if (!mission.client) return "Internal";
	return mission.engagement
		? `${mission.client.name}, ${mission.engagement.name}`
		: mission.client.name;
}
