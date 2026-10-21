import type {
	MissionSkill,
	RosterEntry,
	SkillListItem,
} from "avel-server/contract";
import { BadgeCheck, Layers, List } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadedRows, useSkills } from "@/lib/api/catalog";
import type { ApiError } from "@/lib/api/errors";
import {
	attachRefusal,
	isAlreadyAttached,
	missionSkillTiers,
	recipientsOf,
	useAttachSkill,
	useDetachSkill,
	useMissionSkills,
} from "@/lib/api/mission-skills";
import { describeError, SKILL_ALREADY_ATTACHED } from "@/lib/error-map";
import { cn } from "@/lib/utils";
import { ErrorState, Surface, type SurfaceQuery } from "./surface";
import { type ViewOption, ViewToggle } from "./view-toggle";

/*
 * The loadout's mission skills (ROUTES.md, /missions/:id/roster). Skills
 * attach to the mission, not an agent: each row names the roster entries
 * that receive it at dispatch, those holding a role in its recommendedFor.
 * The skills to add come in the contract's tiers (resolveSkillTiers) for
 * the roster's roles; only approved stack and domain skills attach.
 */

type Tier = "recommended" | "available" | "all";

const TIERS = [
	{ id: "recommended", label: "Recommended", icon: BadgeCheck },
	{ id: "available", label: "Available", icon: Layers },
	{ id: "all", label: "All", icon: List },
] as const satisfies readonly ViewOption<Tier>[];

const TIER_EMPTY = {
	recommended: "No skill left to add is recommended for a role on this roster.",
	available: "No other approved stack or domain skill is left to add.",
	all: "Every skill in Skills is on this mission.",
} as const satisfies Record<Tier, string>;

/** Both reads the pane needs as one state: the mission's skills, then the catalog. */
function usePaneData(
	missionId: string,
): SurfaceQuery<
	{ attached: MissionSkill[]; catalog: SkillListItem[] },
	ApiError
> {
	const attached = useMissionSkills(missionId);
	const skills = useSkills();
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = skills;
	// The tiers need the whole catalog; catalogs are short, so read it all.
	useEffect(() => {
		if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);
	for (const q of [attached, skills]) {
		if (q.status === "error")
			return {
				status: "error",
				error: q.error,
				refetch: q.refetch,
				isFetching: q.isFetching,
			};
	}
	if (attached.status !== "success" || skills.status !== "success")
		return { status: "pending" };
	return {
		status: "success",
		data: { attached: attached.data, catalog: loadedRows(skills.data) },
	};
}

/**
 * Runs one skill write and keeps only its failure: the last one shown is
 * always the latest write's, never an older attach or detach.
 */
export function sendWith(setFailure: (failure: ApiError | null) => void) {
	return async (write: () => Promise<unknown>) => {
		setFailure(null);
		try {
			await write();
		} catch (error) {
			setFailure(error as ApiError);
		}
	};
}

export function MissionSkillsPane({
	missionId,
	roster,
	readOnlyReason,
}: {
	missionId: string;
	roster: RosterEntry[];
	/**
	 * Why the mission's skills cannot change (only a draft's can), or null.
	 * Every write is refused otherwise, so the controls are held with it.
	 */
	readOnlyReason: string | null;
}) {
	const data = usePaneData(missionId);
	return (
		<Surface
			data-testid="mission-skills"
			query={data}
			loading={
				<div
					data-testid="mission-skills-skeleton"
					className="flex flex-col gap-2"
				>
					<Skeleton className="h-8 w-full" />
					<Skeleton className="h-8 w-full" />
					<Skeleton className="h-8 w-2/3" />
				</div>
			}
			// The pane always has a way to add, so it is never only empty.
			empty={null}
			isEmpty={() => false}
			error={ErrorState}
		>
			{({ attached, catalog }) => (
				<SkillsBody
					missionId={missionId}
					roster={roster}
					attached={attached}
					catalog={catalog}
					readOnlyReason={readOnlyReason}
				/>
			)}
		</Surface>
	);
}

function SkillsBody({
	missionId,
	roster,
	attached,
	catalog,
	readOnlyReason,
}: {
	missionId: string;
	roster: RosterEntry[];
	attached: MissionSkill[];
	catalog: SkillListItem[];
	readOnlyReason: string | null;
}) {
	const [tier, setTier] = useState<Tier>("recommended");
	const attach = useAttachSkill(missionId);
	const detach = useDetachSkill(missionId);
	const tiers = missionSkillTiers(roster, catalog, attached);
	// The latest write's failure only: each write clears the one before.
	const [failure, setFailure] = useState<ApiError | null>(null);
	const send = sendWith(setFailure);
	const copy = failure
		? isAlreadyAttached(failure)
			? SKILL_ALREADY_ATTACHED
			: describeError(failure)
		: null;
	const busy = attach.isPending || detach.isPending;
	const held =
		readOnlyReason ?? (busy ? "Another skill change is saving." : undefined);
	return (
		<div className="flex flex-col gap-4">
			<section
				data-testid="mission-skills-attached"
				className="flex flex-col gap-2"
			>
				<h3 className="type-caption text-text-subtle">
					On this mission <span className="type-mono">{attached.length}</span>
				</h3>
				{attached.length === 0 ? (
					<p
						data-testid="mission-skills-none"
						className="type-small text-text-muted"
					>
						No skills on this mission yet. Add one below.
					</p>
				) : (
					<ul className="flex flex-col gap-1.5">
						{attached.map(({ skill, source }) => (
							<SkillRow
								key={skill.id}
								skill={skill}
								roster={roster}
								testId={`mission-skill-${skill.slug}`}
								meta={
									<Badge
										variant="tag"
										data-testid={`mission-skill-source-${skill.slug}`}
									>
										{source}
									</Badge>
								}
								action={
									<Button
										size="sm"
										variant="ghost"
										data-testid={`mission-skill-detach-${skill.slug}`}
										disabledReason={held}
										onClick={() => send(() => detach.mutateAsync(skill.id))}
									>
										Detach
									</Button>
								}
							/>
						))}
					</ul>
				)}
			</section>

			<section data-testid="mission-skills-add" className="flex flex-col gap-2">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h3 className="type-caption text-text-subtle">Add a skill</h3>
					<ViewToggle
						options={TIERS}
						view={tier}
						onChange={setTier}
						testIdPrefix="mission-skills-tier"
					/>
				</div>
				{tiers[tier].length === 0 ? (
					<p
						data-testid="mission-skills-tier-empty"
						className="type-small text-text-muted"
					>
						{TIER_EMPTY[tier]}
					</p>
				) : (
					<ul
						data-testid={`mission-skills-tier-${tier}-list`}
						className="flex flex-col gap-1.5"
					>
						{tiers[tier].map((skill) => {
							const refusal = attachRefusal(skill);
							return (
								<SkillRow
									key={skill.id}
									skill={skill}
									roster={roster}
									testId={`mission-skill-option-${skill.slug}`}
									meta={
										skill.status === "approved" ? null : (
											<Badge variant="outline">{skill.status}</Badge>
										)
									}
									action={
										<Button
											size="sm"
											variant="outline"
											data-testid={`mission-skill-attach-${skill.slug}`}
											disabledReason={readOnlyReason ?? refusal ?? held}
											onClick={() => send(() => attach.mutateAsync(skill.id))}
										>
											Attach
										</Button>
									}
								/>
							);
						})}
					</ul>
				)}
			</section>

			{copy ? (
				<div
					role="alert"
					data-testid="mission-skills-error"
					className={cn(
						"flex flex-col gap-1 rounded-control border px-3 py-2",
						copy === SKILL_ALREADY_ATTACHED
							? "border-gate-warn-line bg-gate-warn-banner"
							: "border-gate-block-line bg-gate-block-soft",
					)}
				>
					<p className="type-small text-foreground">{copy.what}</p>
					<p className="type-caption text-text-muted">{`${copy.written} ${copy.next}`}</p>
				</div>
			) : null}
		</div>
	);
}

function SkillRow({
	skill,
	roster,
	testId,
	meta,
	action,
}: {
	skill: SkillListItem;
	roster: RosterEntry[];
	testId: string;
	meta: React.ReactNode;
	action: React.ReactNode;
}) {
	const recipients = recipientsOf(skill, roster);
	return (
		<li
			data-testid={testId}
			className="flex items-start justify-between gap-3 rounded-control border border-border px-2.5 py-2"
		>
			<div className="flex min-w-0 flex-col gap-1">
				<span className="flex flex-wrap items-center gap-1.5">
					<span className="type-small font-medium text-foreground">
						{skill.name}
					</span>
					<Badge variant="tag">{skill.layer}</Badge>
					{meta}
				</span>
				<Recipients recipients={recipients} testId={`${testId}-recipients`} />
			</div>
			<div className="shrink-0">{action}</div>
		</li>
	);
}

/** Who receives the skill at dispatch; an idle entry is shown, dimmed. */
function Recipients({
	recipients,
	testId,
}: {
	recipients: RosterEntry[];
	testId: string;
}) {
	if (recipients.length === 0)
		return (
			<span data-testid={testId} className="type-caption text-text-subtle">
				No agent on the roster holds a role it is recommended for.
			</span>
		);
	return (
		<span
			data-testid={testId}
			className="flex flex-wrap items-center gap-1 type-caption text-text-muted"
		>
			<span>Reaches</span>
			{recipients.map((entry) => (
				<span
					key={entry.id}
					data-testid={`${testId}-${entry.id}`}
					data-active={entry.active}
					title={entry.active ? undefined : "Idle: turn it on to dispatch it"}
					className={cn(
						"rounded-xs border border-border px-1 type-mono",
						entry.active ? "text-foreground" : "border-dashed text-text-subtle",
					)}
				>
					{entry.agentTemplate.name}
					{entry.territory ? ` · ${entry.territory}` : ""}
				</span>
			))}
		</span>
	);
}
