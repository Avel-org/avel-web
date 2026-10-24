import {
	ROLE_LABELS,
	ROLE_TEAM,
	ROLES,
	type Role,
	type Skill,
	TEAM_LABELS,
	TEAMS,
} from "avel-server/contract";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSetSkillRoles } from "@/lib/api/skills";
import { ActionModal } from "./action-modal";
import { WhatChanges } from "./what-changes";

/*
 * Change roles: which roles a role skill attaches to (PUT
 * /api/skills/:id/roles), the whole set at once. A modal, since it changes
 * agents' identities (ruling 35): one toggle per role, grouped by team, and
 * what comes and goes said before it is sent. Platform's roles are code and
 * carry no identity, so they are not offered.
 */

/** The teams and their roles an identity can carry, in catalog order. */
export const PICKABLE_TEAMS = TEAMS.filter((team) => team !== "platform").map(
	(team) => ({ team, roles: ROLES.filter((role) => ROLE_TEAM[role] === team) }),
);

/** Why Change roles is held, or undefined when it can open. */
export function rolesBlocker(
	skill: Pick<Skill, "layer" | "status">,
): string | undefined {
	if (skill.layer !== "role")
		return "Only a role skill attaches to roles. This one goes on missions.";
	if (skill.status === "retired")
		return "A retired skill can't be attached to roles.";
	return undefined;
}

/** The roles that come and go, each in ROLES order. */
export function rolesDiff(
	from: readonly Role[],
	to: readonly Role[],
): { added: Role[]; removed: Role[] } {
	return {
		added: ROLES.filter((role) => to.includes(role) && !from.includes(role)),
		removed: ROLES.filter((role) => from.includes(role) && !to.includes(role)),
	};
}

const names = (roles: readonly Role[]) =>
	roles.map((role) => ROLE_LABELS[role]).join(", ");

export function SkillRolesModal({
	skill,
	open,
	onOpenChange,
}: {
	skill: Skill;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const save = useSetSkillRoles();
	const [chosen, setChosen] = useState<readonly Role[]>(skill.attachedRoles);
	const { added, removed } = rolesDiff(skill.attachedRoles, chosen);
	const unchanged = added.length === 0 && removed.length === 0;
	const toggle = (role: Role) =>
		setChosen((now) =>
			now.includes(role) ? now.filter((r) => r !== role) : [...now, role],
		);
	return (
		<ActionModal
			open={open}
			onOpenChange={(next) => {
				if (!next) save.reset();
				onOpenChange(next);
			}}
			size="form"
			title={`Roles for ${skill.name}`}
			description="Every agent covering one of these roles carries the skill in its identity."
			dirty={!unchanged}
			submitLabel="Save roles"
			pendingLabel="Saving"
			submitDisabledReason={
				rolesBlocker(skill) ??
				(unchanged ? "Turn a role on or off first" : undefined)
			}
			pending={save.isPending}
			error={save.error}
			onSubmit={() =>
				save.mutate(
					{ id: skill.id, roles: ROLES.filter((r) => chosen.includes(r)) },
					{
						onSuccess: (saved) => {
							toast.success(
								saved.attachedRoles.length === 0
									? `${saved.name} is attached to no role.`
									: `Saved the roles for ${saved.name}.`,
							);
							onOpenChange(false);
						},
					},
				)
			}
			changes={
				unchanged ? undefined : (
					<WhatChanges
						data-testid="skill-roles-changes"
						changes={[
							...(added.length > 0
								? [
										{
											label: "Attached",
											kind: "add" as const,
											to: names(added),
										},
									]
								: []),
							...(removed.length > 0
								? [
										{
											label: "Detached",
											kind: "remove" as const,
											from: names(removed),
										},
									]
								: []),
						]}
					/>
				)
			}
			data-testid="skill-roles-modal"
		>
			<div className="flex flex-col gap-4">
				{skill.status === "draft" ? (
					<p
						data-testid="skill-roles-draft"
						className="rounded-control border border-gate-warn-line bg-gate-warn-banner px-3 py-2 type-small text-text"
					>
						This skill is a draft. It can be attached now, but no identity
						carries it until it is approved.
					</p>
				) : null}
				{PICKABLE_TEAMS.map(({ team, roles }) => (
					<fieldset
						key={team}
						data-testid={`skill-roles-team-${team}`}
						className="flex flex-col gap-1.5"
					>
						<legend
							title={TEAM_LABELS[team].meaning}
							className="pb-1 type-small font-medium text-text-muted"
						>
							{TEAM_LABELS[team].label}
						</legend>
						<div className="flex flex-wrap gap-1.5">
							{roles.map((role) => (
								<Button
									key={role}
									type="button"
									size="sm"
									variant="outline"
									aria-pressed={chosen.includes(role)}
									data-testid={`skill-roles-role-${role}`}
									className="aria-pressed:border-selected-border aria-pressed:bg-selected"
									title={role}
									onClick={() => toggle(role)}
								>
									{ROLE_LABELS[role]}
								</Button>
							))}
						</div>
					</fieldset>
				))}
				{added.length > 0 || removed.length > 0 ? (
					<p
						data-testid="skill-roles-effect"
						className="type-caption text-text-muted"
					>
						Agents covering a role that comes or goes show their identity out of
						date until it is regenerated.
					</p>
				) : null}
			</div>
		</ActionModal>
	);
}
