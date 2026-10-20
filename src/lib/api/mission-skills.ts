import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	contract,
	isMissionAttachable,
	type MissionSkill,
	type Role,
	type RosterEntry,
	resolveSkillTiers,
	type SkillListItem,
	type SkillTiers,
} from "avel-server/contract";
import { type ApiClient, call } from "./client";
import type { ApiError } from "./errors";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * A mission's skills (DATA-CONTRACTS-V2, mission_skills): stack and domain
 * skills attached to the mission, not to an agent. At dispatch an agent
 * receives those whose recommendedFor holds one of its roles. Role skills
 * come with the role (role_skills) and never attach here.
 */

function missionSkillsQuery(api: ApiClient, missionId: string) {
	return queryOptions({
		queryKey: queryKeys.missionSkills.list(missionId),
		queryFn: () =>
			call(contract.roster.skills, () =>
				api.roster.skills({ params: { missionId } }),
			),
	});
}

export function useMissionSkills(missionId: string) {
	return useQuery(missionSkillsQuery(useApiClient(), missionId));
}

const isCode = (error: ApiError, code: string) =>
	error.failure.kind === "contract" && error.failure.code === code;

/** A 409 on attach: the skill was already on the mission. */
export function isAlreadyAttached(error: ApiError): boolean {
	return isCode(error, "CONFLICT");
}

/**
 * Attaches an approved stack or domain skill (source 'manual'). The answer
 * is the attached skill, so it joins the list in the cache. A 409 means the
 * list is stale: it refetches, so the skill shows attached.
 */
export function attachSkillOptions(
	api: ApiClient,
	queryClient: QueryClient,
	missionId: string,
) {
	const key = queryKeys.missionSkills.list(missionId);
	// A 409 or 404 means someone else changed the list, so access changed too.
	const rereadSkillsAndAccess = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: key }),
			queryClient.invalidateQueries({
				queryKey: queryKeys.roster.accessAll(missionId),
			}),
		]);
	return {
		mutationFn: (skillId: string) =>
			call(contract.roster.attachSkill, () =>
				api.roster.attachSkill({ params: { missionId }, body: { skillId } }),
			),
		onSuccess: (attached: MissionSkill) => {
			queryClient.setQueryData<MissionSkill[]>(key, (list) =>
				list ? [...list, attached] : list,
			);
			return Promise.all([
				rereadSkillsAndAccess(),
				queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
			]);
		},
		onError: (error: ApiError) => {
			if (isAlreadyAttached(error)) return rereadSkillsAndAccess();
		},
	};
}

export function useAttachSkill(missionId: string) {
	return useMutation(
		attachSkillOptions(useApiClient(), useQueryClient(), missionId),
	);
}

/**
 * Detaches a skill. It leaves the cached list at once; a 404 means it was
 * already gone, so the list refetches.
 */
export function detachSkillOptions(
	api: ApiClient,
	queryClient: QueryClient,
	missionId: string,
) {
	const key = queryKeys.missionSkills.list(missionId);
	// A 409 or 404 means someone else changed the list, so access changed too.
	const rereadSkillsAndAccess = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: key }),
			queryClient.invalidateQueries({
				queryKey: queryKeys.roster.accessAll(missionId),
			}),
		]);
	return {
		mutationFn: (skillId: string) =>
			call(contract.roster.detachSkill, () =>
				api.roster.detachSkill({ params: { missionId, skillId } }),
			),
		onSuccess: (_removed: unknown, skillId: string) => {
			queryClient.setQueryData<MissionSkill[]>(key, (list) =>
				list?.filter((s) => s.skill.id !== skillId),
			);
			return Promise.all([
				rereadSkillsAndAccess(),
				queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
			]);
		},
		onError: (error: ApiError) => {
			if (isCode(error, "NOT_FOUND")) return rereadSkillsAndAccess();
		},
	};
}

export function useDetachSkill(missionId: string) {
	return useMutation(
		detachSkillOptions(useApiClient(), useQueryClient(), missionId),
	);
}

/** Every role held on the roster, each once, in roster order. */
function rosterRoles(roster: readonly RosterEntry[]): Role[] {
	return [...new Set(roster.flatMap((e) => e.agentTemplate.roles))];
}

/**
 * The skills not yet on the mission, in the contract's three tiers for the
 * roster's roles: recommended for a role it holds, available (attachable,
 * recommended for none), and all, drafts and retired included.
 */
export function missionSkillTiers(
	roster: readonly RosterEntry[],
	catalog: readonly SkillListItem[],
	attached: readonly MissionSkill[],
): SkillTiers<SkillListItem> {
	const on = new Set(attached.map((s) => s.skill.id));
	return resolveSkillTiers(
		rosterRoles(roster),
		catalog.filter((skill) => !on.has(skill.id)),
	);
}

/** The roster entries a skill reaches at dispatch: those holding a recommended role. */
export function recipientsOf(
	skill: Pick<SkillListItem, "recommendedFor">,
	roster: readonly RosterEntry[],
): RosterEntry[] {
	return roster.filter((e) =>
		e.agentTemplate.roles.some((r) => skill.recommendedFor.includes(r)),
	);
}

/**
 * Why a skill cannot attach, in the contract's rule (isMissionAttachable:
 * approved, and not role-layer), or null when it can.
 */
export function attachRefusal(
	skill: Pick<SkillListItem, "status" | "layer">,
): string | null {
	if (isMissionAttachable(skill)) return null;
	if (skill.layer === "role")
		return "A role skill comes with the agent's role. It never attaches to a mission.";
	return skill.status === "draft"
		? "This skill is a draft. Only approved skills attach. Review it in the catalog first."
		: "This skill is retired. Only approved skills attach.";
}
