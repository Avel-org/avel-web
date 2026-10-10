import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type Brief,
	type BriefInput,
	contract,
	type MissionPlan,
	updateMissionPlanBody,
} from "avel-server/contract";
import type { z } from "zod";
import { missionKeys } from "@/components/avel/mission-data";
import { type ApiClient, call } from "./client";
import { ApiError } from "./errors";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * A mission's plan (module 3): its brief with modules, the template it was
 * built from, and the plan check. Read and replaced here (PUT is a full
 * replace), with the pure helpers the plan editor builds on.
 */

export function missionPlanQuery(api: ApiClient, missionId: string) {
	return queryOptions({
		queryKey: queryKeys.missionPlans.detail(missionId),
		queryFn: () =>
			call(contract.missionPlans.get, () =>
				api.missionPlans.get({ params: { id: missionId } }),
			),
	});
}

export function useMissionPlan(missionId: string) {
	return useQuery(missionPlanQuery(useApiClient(), missionId));
}

/**
 * The template a mission was built from, as "template-booking@1a2b3c4" with
 * the full sha for a hover. Null unless both are set: the two are set
 * together or not at all, and half of the pair names no build.
 */
export function templateLabel(
	templateRef: string | null,
	templateVersion: string | null,
): { short: string; full: string } | null {
	if (templateRef === null || templateVersion === null) return null;
	return {
		short: `${templateRef}@${templateVersion.slice(0, 7)}`,
		full: `${templateRef}@${templateVersion}`,
	};
}

// ---------------------------------------------------------------------------
// Saving.

export type MissionPlanBody = z.input<typeof updateMissionPlanBody>;

/**
 * Replaces a draft mission's plan. The answer is the stored plan with its
 * new check, so it goes straight into the cache. The mission's own brief
 * changed and the save logged mission.plan_updated, so both refresh.
 */
export function useSaveMissionPlan(missionId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: MissionPlanBody) =>
			call(contract.missionPlans.update, () =>
				api.missionPlans.update({ params: { id: missionId }, body }),
			),
		onSuccess: (plan) => {
			queryClient.setQueryData(queryKeys.missionPlans.detail(missionId), plan);
			return Promise.all([
				queryClient.invalidateQueries({
					queryKey: missionKeys.detail(missionId),
				}),
				queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
			]);
		},
	});
}

// Pure functions below: no React, no network, so they are tested directly.

/** A brief as the editor holds it: a request literal, with modules always present. */
export type BriefDraft = BriefInput & {
	modules: NonNullable<BriefInput["modules"]>;
};

export type PlanDraft = {
	brief: BriefDraft;
	/** Text; empty means none. */
	templateRef: string;
	templateVersion: string;
};

export type CheckIssue = MissionPlan["check"]["issues"][number];

/**
 * The plan as a draft, or null when the stored brief predates the brief
 * shape: there is nothing typed to edit, and saving would replace it blind.
 */
export function planDraftOf(plan: MissionPlan): PlanDraft | null {
	if (plan.brief === null) return null;
	const { summary, requirements, acceptanceCriteria, modules } = plan.brief;
	return {
		brief: {
			summary,
			requirements: requirements.map((r) => ({ ...r })),
			acceptanceCriteria: acceptanceCriteria.map((ac) => ({ ...ac })),
			modules: modules.map((m) => ({
				...m,
				requirementIds: [...m.requirementIds],
			})),
		},
		templateRef: plan.templateRef ?? "",
		templateVersion: plan.templateVersion ?? "",
	};
}

/** The PUT body: the whole plan. An empty template field is null. */
export function planBodyOf(draft: PlanDraft): MissionPlanBody {
	const ref = draft.templateRef.trim();
	const version = draft.templateVersion.trim();
	return {
		brief: draft.brief,
		templateRef: ref === "" ? null : ref,
		templateVersion: version === "" ? null : version,
	};
}

/**
 * What an approved brief locks: its summary, and its requirements and
 * criteria by id. The plan adds to them; it never edits or removes one
 * (422 plan_changes_approved_brief). Nothing is locked without one.
 */
export type ApprovedLocks = {
	summary: boolean;
	requirements: ReadonlySet<string>;
	criteria: ReadonlySet<string>;
};

export function locksOf(approved: Brief | null): ApprovedLocks {
	return {
		summary: approved !== null,
		requirements: new Set(approved?.requirements.map((r) => r.id)),
		criteria: new Set(approved?.acceptanceCriteria.map((ac) => ac.id)),
	};
}

/** The next free id with this prefix: R4 after R1..R3, M1 when there are none. */
export function nextId(
	prefix: "R" | "AC" | "M",
	ids: readonly string[],
): string {
	const pattern = new RegExp(`^${prefix}([1-9][0-9]*)$`);
	let max = 0;
	for (const id of ids) {
		const n = Number(id.match(pattern)?.[1] ?? 0);
		if (n > max) max = n;
	}
	return `${prefix}${max + 1}`;
}

/**
 * Where an issue belongs in the editor. Paths name positions in the brief
 * they were found in; the editor's rows move, so a position is turned into
 * the item's id at once ("requirement:R3"). A path into a list with no
 * position ("requirements") stays on the list; "summary", "templateRef" and
 * "templateVersion" are fields. Anything else has no place but the list.
 */
export type IssueTarget = string;

const ITEM_PREFIX = {
	requirements: "requirement",
	acceptanceCriteria: "criterion",
	modules: "module",
} as const;

export function issueTarget(
	path: readonly (string | number)[],
	brief: BriefInput | null,
): IssueTarget | null {
	const at = path[0] === "brief" ? path.slice(1) : path;
	const [head, index] = at;
	if (
		head === "summary" ||
		head === "templateRef" ||
		head === "templateVersion"
	)
		return head;
	if (
		head === "requirements" ||
		head === "acceptanceCriteria" ||
		head === "modules"
	) {
		if (typeof index !== "number") return head;
		const items: ReadonlyArray<{ id: string }> = brief?.[head] ?? [];
		const id = items[index]?.id;
		return id === undefined ? head : `${ITEM_PREFIX[head]}:${id}`;
	}
	return null;
}

/** Issues grouped by where they belong, each message as the server gave it. */
export function issuesByTarget(
	issues: readonly CheckIssue[],
	brief: BriefInput | null,
): Map<IssueTarget, string[]> {
	const byTarget = new Map<IssueTarget, string[]>();
	for (const issue of issues) {
		const target = issueTarget(issue.path, brief);
		if (target === null) continue;
		byTarget.set(target, [...(byTarget.get(target) ?? []), issue.message]);
	}
	return byTarget;
}

/** What a refused save changed of the approved brief (422 plan_changes_approved_brief). */
export function approvedChangeIssues(error: unknown): CheckIssue[] {
	if (!(error instanceof ApiError)) return [];
	const { failure } = error;
	if (
		failure.kind === "contract" &&
		failure.code === "PRECONDITION_FAILED" &&
		failure.details.reason === "plan_changes_approved_brief"
	) {
		return failure.details.issues ?? [];
	}
	return [];
}

/** The shape problems a refused save named (400 VALIDATION_FAILED, body). */
export function planValidationIssues(error: unknown): CheckIssue[] {
	if (!(error instanceof ApiError)) return [];
	const { failure } = error;
	if (failure.kind !== "contract" || failure.code !== "VALIDATION_FAILED") {
		return [];
	}
	return (failure.details?.body ?? []).map(({ path, message }) => ({
		path,
		message,
	}));
}

const SHAPE_COPY: Record<string, string> = {
	summary: "Give a summary of 1 to 5,000 characters.",
	requirement: "Give each requirement 1 to 2,000 characters.",
	criterion:
		"Give each criterion 1 to 2,000 characters and the requirement it proves.",
	module: "Give each module a name of 1 to 200 characters.",
};

/**
 * What the contract's own body schema refuses before a request is sent, by
 * target. Only shape: the plan check (modules, placement, citations) is the
 * server's, reported after a save, and never blocks one.
 */
export function planShapeProblems(
	draft: PlanDraft,
): Map<IssueTarget, string[]> {
	const problems = new Map<IssueTarget, string[]>();
	const parsed = updateMissionPlanBody.safeParse(planBodyOf(draft));
	if (parsed.success) return problems;
	for (const issue of parsed.error.issues) {
		const target = issueTarget(issue.path, draft.brief);
		if (target === null || problems.has(target)) continue;
		const kind = target.split(":")[0] ?? target;
		// The template fields' messages are the contract's own words.
		problems.set(target, [SHAPE_COPY[kind] ?? issue.message]);
	}
	return problems;
}
