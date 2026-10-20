import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type approveIntakeBody,
	type BriefInput,
	briefSchema,
	contract,
	INTAKE_STATUSES,
	type Intake,
	type IntakeStatus,
	type readRepoBody,
} from "avel-server/contract";
import type { z } from "zod";
import { type ApiClient, call, callPage } from "./client";
import { ApiError } from "./errors";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * Intakes (module 1, audit F7): the brief a client mission starts from. The
 * list route filters by engagement, not client, so a client's intakes are
 * read one engagement at a time and put together here. Every write answers
 * with the intake, which goes straight into the cache; the lists read
 * again, and an approval, which creates the mission, refreshes missions too.
 */

export { INTAKE_STATUSES, type Intake, type IntakeStatus };

export const INTAKES_PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Reads.

export function intakeListQuery(
	api: ApiClient,
	engagementId: string,
	status?: IntakeStatus,
) {
	return queryOptions({
		queryKey: queryKeys.intakes.byEngagement(
			engagementId,
			INTAKES_PAGE_SIZE,
			status,
		),
		queryFn: () =>
			callPage(contract.intakes.list, () =>
				api.intakes.list({
					query: {
						engagementId,
						limit: INTAKES_PAGE_SIZE,
						...(status ? { status } : {}),
					},
				}),
			),
	});
}

/** One status's exact count for one engagement: the meta.total of a one-row read. */
export function intakeCountQuery(
	api: ApiClient,
	engagementId: string,
	status: IntakeStatus,
) {
	return queryOptions({
		queryKey: queryKeys.intakes.byEngagement(engagementId, 1, status),
		queryFn: () =>
			callPage(contract.intakes.list, () =>
				api.intakes.list({ query: { engagementId, limit: 1, status } }),
			),
		select: (page) => page.meta.total,
	});
}

export function intakeQuery(api: ApiClient, id: string) {
	return queryOptions({
		queryKey: queryKeys.intakes.detail(id),
		queryFn: () =>
			call(contract.intakes.get, () => api.intakes.get({ params: { id } })),
	});
}

export function useIntake(id: string) {
	return useQuery(intakeQuery(useApiClient(), id));
}

type ListPage = { data: Intake[]; meta: { total: number } };

/** Several engagements' pages as one list: newest first, the totals summed. */
export function combineIntakePages(pages: readonly ListPage[]): {
	rows: Intake[];
	total: number;
} {
	const rows = pages
		.flatMap((page) => page.data)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	const total = pages.reduce((sum, page) => sum + page.meta.total, 0);
	return { rows, total };
}

/**
 * What a combined read reports: one state for every engagement's read, and
 * always the read-age fields, so a panel footer reads it like any query.
 */
export type CombinedRead<T> = {
	dataUpdatedAt: number;
	refetch: () => unknown;
	isFetching: boolean;
} & (
	| { status: "pending" }
	| { status: "error"; error: ApiError }
	| { status: "success"; data: T }
);

type Result<T> = {
	status: "pending" | "error" | "success";
	data: T | undefined;
	error: ApiError | null;
	dataUpdatedAt: number;
	isFetching: boolean;
	refetch: () => unknown;
};

/**
 * Many reads as one: an error if any failed, pending until every one has
 * read, then their data together, read as old as the oldest of them.
 */
export function combineReads<T, R>(
	results: readonly Result<T>[],
	join: (data: T[]) => R,
): CombinedRead<R> {
	const read = {
		refetch: () => Promise.all(results.map((r) => r.refetch())),
		isFetching: results.some((r) => r.isFetching),
		dataUpdatedAt:
			results.length === 0
				? 0
				: Math.min(...results.map((r) => r.dataUpdatedAt)),
	};
	const failed = results.find((r) => r.status === "error");
	if (failed?.error) return { ...read, status: "error", error: failed.error };
	if (results.some((r) => r.status !== "success")) {
		return { ...read, status: "pending" };
	}
	return {
		...read,
		status: "success",
		data: join(results.map((r) => r.data as T)),
	};
}

/** A client's intakes across its engagements, optionally one status. */
export function useClientIntakes(
	engagementIds: readonly string[],
	status?: IntakeStatus,
) {
	const api = useApiClient();
	return useQueries({
		queries: engagementIds.map((id) => intakeListQuery(api, id, status)),
		combine: (results) =>
			combineReads(results as Result<ListPage>[], combineIntakePages),
	});
}

export type IntakeCounts = Record<IntakeStatus, number>;

/** How many of a client's intakes are in each status: one count per engagement and status. */
export function useClientIntakeCounts(engagementIds: readonly string[]) {
	const api = useApiClient();
	const pairs = engagementIds.flatMap((id) =>
		INTAKE_STATUSES.map((status) => ({ id, status })),
	);
	return useQueries({
		queries: pairs.map(({ id, status }) => intakeCountQuery(api, id, status)),
		combine: (results) =>
			combineReads(results as Result<number>[], (totals) => {
				const counts = Object.fromEntries(
					INTAKE_STATUSES.map((s) => [s, 0]),
				) as IntakeCounts;
				totals.forEach((total, i) => {
					const pair = pairs[i];
					if (pair) counts[pair.status] += total;
				});
				return counts;
			}),
	});
}

/** One engagement's active connections, for a repository read. */
export function useActiveConnectionsFor(engagementId: string) {
	const api = useApiClient();
	return useQuery({
		queryKey: queryKeys.connections.activeFor(engagementId, INTAKES_PAGE_SIZE),
		queryFn: () =>
			callPage(contract.connections.list, () =>
				api.connections.list({
					query: { engagementId, status: "active", limit: INTAKES_PAGE_SIZE },
				}),
			),
		select: (page) => page.data,
	});
}

// ---------------------------------------------------------------------------
// Writes. Each is an options builder (tested with a MutationObserver) and a
// hook. The answer is the intake: it replaces the cached detail, and every
// intake list reads again; activity logged the write.

function afterIntakeWrite(queryClient: QueryClient, intake: Intake) {
	queryClient.setQueryData(queryKeys.intakes.detail(intake.id), intake);
	return Promise.all([
		queryClient.invalidateQueries({ queryKey: queryKeys.intakes.lists() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

export type ReviseIntakeBody = {
	sourceMd?: string;
	proposedBrief?: BriefInput | null;
	openQuestions?: string[];
};

export function reviseIntakeOptions(
	api: ApiClient,
	queryClient: QueryClient,
	id: string,
) {
	return {
		mutationFn: (body: ReviseIntakeBody) =>
			call(contract.intakes.revise, () =>
				api.intakes.revise({ params: { id }, body }),
			),
		onSuccess: (intake: Intake) => afterIntakeWrite(queryClient, intake),
	};
}

export function proposeIntakeOptions(
	api: ApiClient,
	queryClient: QueryClient,
	id: string,
) {
	return {
		mutationFn: () =>
			call(contract.intakes.propose, () =>
				api.intakes.propose({ params: { id } }),
			),
		onSuccess: (intake: Intake) => afterIntakeWrite(queryClient, intake),
	};
}

export type ApproveIntakeBody = z.input<typeof approveIntakeBody>;

/** Approval creates the mission: missions read again, the client's included. */
export function approveIntakeOptions(
	api: ApiClient,
	queryClient: QueryClient,
	id: string,
) {
	return {
		mutationFn: (body: ApproveIntakeBody) =>
			call(contract.intakes.approve, () =>
				api.intakes.approve({ params: { id }, body }),
			),
		// Approval creates the mission: the mission lists and every template's
		// mission count (templates.list counts missions per template) read again.
		onSuccess: (intake: Intake) =>
			Promise.all([
				afterIntakeWrite(queryClient, intake),
				queryClient.invalidateQueries({ queryKey: queryKeys.missions.all() }),
				queryClient.invalidateQueries({ queryKey: queryKeys.templates.all() }),
			]),
	};
}

export type ReadRepoBody = z.input<typeof readRepoBody>;

export function readRepoOptions(
	api: ApiClient,
	queryClient: QueryClient,
	id: string,
) {
	return {
		mutationFn: (body: ReadRepoBody) =>
			call(contract.intakes.readRepo, () =>
				api.intakes.readRepo({ params: { id }, body }),
			),
		onSuccess: (intake: Intake) => afterIntakeWrite(queryClient, intake),
	};
}

export function rejectIntakeOptions(
	api: ApiClient,
	queryClient: QueryClient,
	id: string,
) {
	return {
		mutationFn: (reason: string) =>
			call(contract.intakes.reject, () =>
				api.intakes.reject({ params: { id }, body: { reason } }),
			),
		onSuccess: (intake: Intake) => afterIntakeWrite(queryClient, intake),
	};
}

export function useReviseIntake(id: string) {
	return useMutation(reviseIntakeOptions(useApiClient(), useQueryClient(), id));
}
export function useProposeIntake(id: string) {
	return useMutation(
		proposeIntakeOptions(useApiClient(), useQueryClient(), id),
	);
}
export function useApproveIntake(id: string) {
	return useMutation(
		approveIntakeOptions(useApiClient(), useQueryClient(), id),
	);
}
export function useReadRepo(id: string) {
	return useMutation(readRepoOptions(useApiClient(), useQueryClient(), id));
}
export function useRejectIntake(id: string) {
	return useMutation(rejectIntakeOptions(useApiClient(), useQueryClient(), id));
}

// ---------------------------------------------------------------------------
// Refusals.

export type IntakeRefusal = {
	reason: string;
	issues: { path: (string | number)[]; message: string }[];
};

/** A 422's reason and issues, or null for any other failure. */
export function intakeRefusal(error: unknown): IntakeRefusal | null {
	if (!(error instanceof ApiError)) return null;
	const { failure } = error;
	if (failure.kind !== "contract" || failure.code !== "PRECONDITION_FAILED") {
		return null;
	}
	return {
		reason: failure.details.reason,
		issues: failure.details.issues ?? [],
	};
}

/**
 * Canon's open questions from an intake_questions_open refusal: each issue at
 * ["canonQuestions", id], its message the question's header, in order.
 */
export function openCanonQuestions(
	error: unknown,
): { id: string; header: string }[] {
	const refusal = intakeRefusal(error);
	if (refusal?.reason !== "intake_questions_open") return [];
	return refusal.issues
		.filter((issue) => issue.path[0] === "canonQuestions")
		.map((issue) => ({
			id: String(issue.path[1] ?? ""),
			header: issue.message,
		}));
}

// ---------------------------------------------------------------------------
// The check, pure. Mirrors avel-server's checkIntake (src/lib/intake-check.ts)
// so the brief's state shows before Propose; the server runs it again at
// propose and approve, and its 422 issues are the word that counts.

export type IntakeCheckRule =
	| "brief"
	| "requirements"
	| "criteria"
	| "coverage"
	| "modules";

export type IntakeCheckIssue = {
	rule: IntakeCheckRule;
	path: (string | number)[];
	message: string;
};

/** Each rule by name, in the server's order: a name, not a claim. */
export const INTAKE_CHECK_LABEL = {
	brief: "A brief in the brief's shape",
	requirements: "At least one requirement, each id once",
	criteria: "Every criterion cites a requirement",
	coverage: "Every requirement has a criterion",
	modules: "No modules yet (the plan adds them)",
} as const satisfies Record<IntakeCheckRule, string>;

export const INTAKE_CHECK_RULES = Object.keys(
	INTAKE_CHECK_LABEL,
) as IntakeCheckRule[];

export function checkIntakeBrief(brief: unknown): IntakeCheckIssue[] {
	const issues: IntakeCheckIssue[] = [];
	const add = (
		rule: IntakeCheckRule,
		path: (string | number)[],
		message: string,
	) => issues.push({ rule, path: ["proposedBrief", ...path], message });

	if (brief === null || brief === undefined) {
		add("brief", [], "There is no brief yet");
		return issues;
	}
	const parsed = briefSchema.safeParse(brief);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			add("brief", [...issue.path], issue.message);
		}
		return issues;
	}
	const { requirements, acceptanceCriteria, modules } = parsed.data;
	if (requirements.length === 0) {
		add("requirements", ["requirements"], "The brief has no requirements");
	}
	const seen = new Set<string>();
	requirements.forEach((r, i) => {
		if (seen.has(r.id)) {
			add(
				"requirements",
				["requirements", i, "id"],
				`Requirement id ${r.id} is used more than once`,
			);
		}
		seen.add(r.id);
	});
	const seenCriteria = new Set<string>();
	acceptanceCriteria.forEach((ac, i) => {
		if (seenCriteria.has(ac.id)) {
			add(
				"requirements",
				["acceptanceCriteria", i, "id"],
				`Criterion id ${ac.id} is used more than once`,
			);
		}
		seenCriteria.add(ac.id);
	});
	acceptanceCriteria.forEach((ac, i) => {
		if (!seen.has(ac.requirementId)) {
			add(
				"criteria",
				["acceptanceCriteria", i, "requirementId"],
				`${ac.id} cites ${ac.requirementId}, which is not a requirement`,
			);
		}
	});
	const covered = new Set(acceptanceCriteria.map((ac) => ac.requirementId));
	requirements.forEach((r, i) => {
		if (!covered.has(r.id)) {
			add(
				"coverage",
				["requirements", i, "acceptanceCriteria"],
				`${r.id} has no acceptance criterion`,
			);
		}
	});
	if (modules.length > 0) {
		add(
			"modules",
			["modules"],
			"An intake's brief has no modules; the mission's plan adds them",
		);
	}
	return issues;
}

// ---------------------------------------------------------------------------
// The brief as lines, for Revise: what the operator types, and back.

/** "R1 The booking holds a slot", one requirement per line. */
export function requirementLines(brief: BriefInput | null): string {
	return (brief?.requirements ?? []).map((r) => `${r.id} ${r.text}`).join("\n");
}

/** "AC1 R1 A held slot frees after ten minutes", one criterion per line. */
export function criterionLines(brief: BriefInput | null): string {
	return (brief?.acceptanceCriteria ?? [])
		.map((ac) => `${ac.id} ${ac.requirementId} ${ac.text}`)
		.join("\n");
}

export type LineIssue = {
	field: "requirements" | "criteria";
	line: number;
	message: string;
};

/**
 * The typed lines as a brief, and each line that is not in the form. Blank
 * lines are skipped. The brief keeps the intake's checks (and has no
 * modules: the plan adds them).
 */
export function briefFromLines(input: {
	summary: string;
	requirements: string;
	criteria: string;
	checks?: BriefInput["checks"];
}): { brief: BriefInput; issues: LineIssue[] } {
	const issues: LineIssue[] = [];
	const lines = (text: string) =>
		text
			.split("\n")
			.map((line, i) => ({ line: line.trim(), at: i + 1 }))
			.filter(({ line }) => line !== "");
	const requirements = lines(input.requirements).flatMap(({ line, at }) => {
		const match = line.match(/^(R[1-9][0-9]*)\s+(.+)$/);
		if (!match?.[1] || !match[2]) {
			issues.push({
				field: "requirements",
				line: at,
				message: `Line ${at}: start with an id such as R1, then the requirement`,
			});
			return [];
		}
		return [{ id: match[1], text: match[2] }];
	});
	const acceptanceCriteria = lines(input.criteria).flatMap(({ line, at }) => {
		const match = line.match(/^(AC[1-9][0-9]*)\s+(R[1-9][0-9]*)\s+(.+)$/);
		if (!match?.[1] || !match[2] || !match[3]) {
			issues.push({
				field: "criteria",
				line: at,
				message: `Line ${at}: start with a criterion id and the requirement it cites, such as AC1 R1`,
			});
			return [];
		}
		return [{ id: match[1], requirementId: match[2], text: match[3] }];
	});
	return {
		brief: {
			summary: input.summary.trim(),
			requirements,
			acceptanceCriteria,
			...(input.checks ? { checks: input.checks } : {}),
		},
		issues,
	};
}

/** Open questions, one per line, blank lines and repeats dropped. */
export function questionsFromLines(text: string): string[] {
	return [
		...new Set(
			text
				.split("\n")
				.map((q) => q.trim())
				.filter((q) => q !== ""),
		),
	];
}
