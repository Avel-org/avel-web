import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type Brief,
	type BriefInput,
	briefSchema,
	contract,
	type MissionPlan,
	type MissionStatus,
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
/**
 * A brief being edited: modules and checks always present, so a save sends
 * back every check it loaded (an omitted list would be stored as none).
 */
export type BriefDraft = BriefInput & {
	modules: NonNullable<BriefInput["modules"]>;
	checks: NonNullable<BriefInput["checks"]>;
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
	const { summary, requirements, acceptanceCriteria, modules, checks } =
		plan.brief;
	return {
		brief: {
			summary,
			requirements: requirements.map((r) => ({ ...r })),
			acceptanceCriteria: acceptanceCriteria.map((ac) => ({ ...ac })),
			modules: modules.map((m) => ({
				...m,
				reads: [...m.reads],
				requirementIds: [...m.requirementIds],
			})),
			checks: checks.map((c) => ({ ...c })),
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

// ---------------------------------------------------------------------------
// Readiness.

/**
 * One requirement's state in the readiness bar. Solid: in exactly one
 * module, with no issue on it. Hatched: placed, but carrying an issue.
 * Empty: in no module. No score: the bar shows where things are, not a grade.
 */
export type SegmentState = "solid" | "hatched" | "empty";

export type ReadinessSegment = {
	/** Its position in the saved brief: ids may repeat until the check passes. */
	index: number;
	id: string;
	text: string;
	state: SegmentState;
	/** The modules that list it, in brief order. */
	modules: string[];
	/** The check's messages that touch it, as the server wrote them. */
	issues: string[];
};

export type Readiness = {
	segments: ReadinessSegment[];
	modules: Array<{
		id: string;
		name: string;
		requirementIds: string[];
		/** Issues on the module itself, by path. */
		issues: string[];
	}>;
	/** Issues that touch no requirement: the plan-wide row. */
	planWide: string[];
};

/**
 * The plan's readiness, from the saved plan and its check. Every issue is
 * resolved by its path against the saved brief, never by its message: on
 * requirements[i] it is requirement i's; on acceptanceCriteria[j] it is the
 * cited requirement's; on modules[k] it is every requirement module k
 * lists. An issue that reaches no requirement is plan-wide. Null when the
 * stored brief predates the shape: there are no requirements to show.
 */
export function readinessOf(plan: MissionPlan): Readiness | null {
	const brief = plan.brief;
	if (brief === null) return null;
	const { requirements, acceptanceCriteria, modules } = brief;
	const issuesAt = requirements.map(() => [] as string[]);
	const moduleIssues = modules.map(() => [] as string[]);
	const planWide: string[] = [];
	// Every position holding this id: a repeated id is each of them.
	const positionsOf = (id: string) =>
		requirements.flatMap((r, i) => (r.id === id ? [i] : []));

	for (const { path, message } of plan.check.issues) {
		const at = path[0] === "brief" ? path.slice(1) : path;
		const [head, index] = at;
		let touched: number[] = [];
		if (head === "requirements" && typeof index === "number") {
			touched = index < requirements.length ? [index] : [];
		} else if (head === "acceptanceCriteria" && typeof index === "number") {
			const cited = acceptanceCriteria[index]?.requirementId;
			touched = cited === undefined ? [] : positionsOf(cited);
		} else if (head === "checks" && typeof index === "number") {
			// A check's issue is its requirement's; one citing no requirement
			// reaches none and stays plan-wide.
			const cited = brief.checks[index]?.requirementId;
			touched = cited === undefined ? [] : positionsOf(cited);
		} else if (head === "modules" && typeof index === "number") {
			const listed = modules[index];
			touched = listed
				? [...new Set(listed.requirementIds)].flatMap(positionsOf)
				: [];
			// Placed once: on the module and its requirements when it reaches
			// any, otherwise in the plan-wide row, never both.
			if (touched.length > 0) moduleIssues[index]?.push(message);
		}
		if (touched.length === 0) planWide.push(message);
		for (const i of new Set(touched)) issuesAt[i]?.push(message);
	}

	const segments = requirements.map((r, i): ReadinessSegment => {
		const placed = modules
			.filter((m) => m.requirementIds.includes(r.id))
			.map((m) => m.id);
		const issues = issuesAt[i] ?? [];
		const state: SegmentState =
			placed.length === 0
				? "empty"
				: placed.length === 1 && issues.length === 0
					? "solid"
					: "hatched";
		return { index: i, id: r.id, text: r.text, state, modules: placed, issues };
	});

	return {
		segments,
		modules: modules.map((m, k) => ({
			id: m.id,
			name: m.name,
			requirementIds: m.requirementIds,
			issues: moduleIssues[k] ?? [],
		})),
		planWide,
	};
}

/**
 * React keys from values that should be unique but may repeat (R1, then
 * R1#2), as mission-details.tsx keys a brief: uniqueness is the plan
 * check's rule, and the editor shows a draft as it is.
 */
export function occurrenceKeys<T>(
	items: readonly T[],
	idOf: (item: T) => string,
): string[] {
	const seen = new Map<string, number>();
	return items.map((item) => {
		const id = idOf(item);
		const n = (seen.get(id) ?? 0) + 1;
		seen.set(id, n);
		return n === 1 ? id : `${id}#${n}`;
	});
}

// ---------------------------------------------------------------------------
// Starting a plan over a brief that predates the shape.

/**
 * Whether "Start a plan" is offered: the stored brief does not parse, the
 * mission is a draft, and no intake approved a brief (one that did would
 * have parsed, and the plan may only add to it).
 */
export function canStartPlan(
	plan: MissionPlan,
	status: MissionStatus,
): boolean {
	return (
		plan.brief === null && plan.approvedBrief === null && status === "draft"
	);
}

export type StartPlan = {
	/** The PUT body. With `needsSummary`, its summary is empty until the operator writes one. */
	body: MissionPlanBody;
	/** The old brief's keys the new plan keeps: "summary", or none. */
	carried: string[];
	/** Every other key the old brief has, which the save replaces. */
	dropped: string[];
	/** The old brief has no summary the contract accepts, so one must be written. */
	needsSummary: boolean;
};

/**
 * A fresh plan over the stored brief: its summary kept when the contract
 * accepts it as one, every list empty, no template. Nothing else carries
 * over, and every key that does not is named, so the confirmation can show
 * exactly what the save replaces.
 */
export function startPlanBody(rawBrief: unknown): StartPlan {
	const record =
		rawBrief !== null &&
		typeof rawBrief === "object" &&
		!Array.isArray(rawBrief)
			? (rawBrief as Record<string, unknown>)
			: {};
	const summary = briefSchema.shape.summary.safeParse(record.summary);
	const keys = Object.keys(record);
	return {
		body: {
			brief: {
				summary: summary.success ? summary.data : "",
				requirements: [],
				acceptanceCriteria: [],
				modules: [],
			},
			templateRef: null,
			templateVersion: null,
		},
		carried: summary.success ? ["summary"] : [],
		dropped: keys.filter((key) => !(summary.success && key === "summary")),
		needsSummary: !summary.success,
	};
}

/**
 * The editor's element id for an issue target, and so the plan page's hash:
 * "requirement:R2" is plan-requirement-R2, "modules" is plan-modules.
 */
export function planAnchor(target: IssueTarget): string {
	return `plan-${target.replace(":", "-")}`;
}
