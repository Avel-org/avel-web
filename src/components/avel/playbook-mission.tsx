import { Link } from "@tanstack/react-router";
import type { MissionDetail } from "avel-server/contract";
import { ArrowLeft, ArrowUpRight, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isNotFound } from "@/lib/api/catalog";
import type { ApiError } from "@/lib/api/errors";
import { templateLabel, useMissionPlan } from "@/lib/api/mission-plans";
import { linkFor } from "@/shell/nav";
import { EmptyState } from "./empty-state";
import { useMission } from "./mission-data";
import { MissionRowsSkeleton } from "./mission-panels";
import { PlaybookBuilder } from "./playbook-builder";
import { CoherencePanel } from "./playbook-coherence";
import { SectionPanel } from "./section-panel";
import { ErrorState, type ErrorStateProps, Surface } from "./surface";

/*
 * One mission's resolved process, /missions/:id/playbook (ROUTES.md),
 * read-only. The playbook is the live one for the mission's type: they join
 * on Playbook.mission_type, with no foreign key. The template comes from the
 * mission's plan, and coherence is the contract's computeCoherence over the
 * mission's roster.
 */

export function MissionPlaybook({ id }: { id: string }) {
	const mission = useMission(id);
	return (
		<Surface
			data-testid="mission-playbook"
			query={mission}
			loading={
				<MissionRowsSkeleton rows={4} testId="mission-playbook-skeleton" />
			}
			// A mission is never "empty": it exists, or it is not found.
			empty={null}
			isEmpty={() => false}
			error={MissionPlaybookError}
		>
			{(detail) => <MissionPlaybookContent mission={detail} />}
		</Surface>
	);
}

/** The error map's copy, and a way back for a mission that is gone. */
function MissionPlaybookError(props: ErrorStateProps<ApiError>) {
	return (
		<div className="flex flex-col gap-3">
			<ErrorState {...props} />
			{isNotFound(props.error) ? (
				<Button asChild variant="outline" size="sm" className="self-start">
					<Link to="/missions" data-testid="mission-playbook-back">
						<ArrowLeft aria-hidden="true" />
						Back to missions
					</Link>
				</Button>
			) : null}
		</div>
	);
}

function MissionPlaybookContent({ mission }: { mission: MissionDetail }) {
	return (
		<div data-testid="mission-playbook-content" className="flex flex-col gap-4">
			<TemplatePanel missionId={mission.id} />
			{mission.playbook ? (
				<>
					<div className="flex items-center justify-end">
						<Button asChild variant="ghost" size="sm">
							<Link
								to="/playbooks/$missionType"
								params={{ missionType: mission.playbook.missionType }}
								data-testid="mission-playbook-open-type"
							>
								{`The ${mission.playbook.missionType} playbook`}
								<ArrowUpRight aria-hidden="true" />
							</Link>
						</Button>
					</div>
					{/* The builder, with this mission's coherence as its pre-flight. */}
					<PlaybookBuilder
						missionType={mission.playbook.missionType}
						sections={false}
						preflight={
							<div data-testid="mission-playbook-coherence">
								<CoherencePanel
									mission={mission}
									missionType={mission.playbook.missionType}
								/>
							</div>
						}
					/>
				</>
			) : (
				<>
					<EmptyState
						data-testid="mission-playbook-none"
						icon={linkFor("/playbooks").icon}
						title="No live playbook for this mission type"
						description={`No playbook is set up for missions of type ${mission.type}, so there are no waves or gates to follow.`}
						action={
							<Button asChild variant="outline" size="sm">
								<Link to="/playbooks" data-testid="mission-playbook-all">
									See playbooks
								</Link>
							</Button>
						}
					/>
					<p
						data-testid="coherence-no-playbook"
						className="type-small text-text-subtle"
					>
						No playbook, so nothing to check the roster against.
					</p>
				</>
			)}
		</div>
	);
}

function TemplatePanel({ missionId }: { missionId: string }) {
	const plan = useMissionPlan(missionId);
	return (
		<SectionPanel
			title="Template"
			description="The template repository this mission was built from, at the commit it used."
			data-testid="mission-playbook-template"
		>
			<Surface
				data-testid="mission-playbook-template-surface"
				query={plan}
				loading={<Skeleton className="h-4 w-48" />}
				// The plan always exists with its mission; "no template" is a value.
				empty={null}
				isEmpty={() => false}
				error={ErrorState}
			>
				{(data) => {
					const label = templateLabel(data.templateRef, data.templateVersion);
					return label ? (
						<span
							data-testid="mission-playbook-template-ref"
							title={label.full}
							className="inline-flex items-center gap-1.5 type-mono text-foreground"
						>
							<Workflow
								aria-hidden="true"
								className="size-3.5 text-text-subtle"
							/>
							{label.short}
							<span className="sr-only">{`, full commit ${label.full}`}</span>
						</span>
					) : (
						<p
							data-testid="mission-playbook-no-template"
							className="type-small text-text-subtle"
						>
							Not built from a template.
						</p>
					);
				}}
			</Surface>
		</SectionPanel>
	);
}
