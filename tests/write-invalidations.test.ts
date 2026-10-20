import { MutationObserver, QueryClient } from "@tanstack/react-query";
import type { Intake, MissionSkill } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import type { ApiClient } from "@/lib/api/client";
import { afterEngagementClosed } from "@/lib/api/clients";
import { ApiError } from "@/lib/api/errors";
import {
	approveIntakeOptions,
	proposeIntakeOptions,
	readRepoOptions,
	rejectIntakeOptions,
	reviseIntakeOptions,
} from "@/lib/api/intakes";
import { queryKeys } from "@/lib/api/keys";
import {
	attachSkillOptions,
	detachSkillOptions,
} from "@/lib/api/mission-skills";

/**
 * Two writes change what other screens show (design and data flow audit,
 * F2). Permissions are the one thing AVEL must never misstate, so each write
 * marks the other screen's query stale.
 */

const MISSION = "00000000-0000-4000-8000-000000000001";
const ENTRY = "00000000-0000-4000-8000-000000000002";
const NO_API = {} as ApiClient;

function seeded(...keys: readonly (readonly unknown[])[]) {
	const qc = new QueryClient({
		defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
	});
	for (const key of keys) qc.setQueryData([...key], []);
	return qc;
}
const isStale = (qc: QueryClient, key: readonly unknown[]) =>
	qc.getQueryState([...key])?.isInvalidated;

describe("closing an engagement", () => {
	it("reads the connections list again, since the close revoked them", async () => {
		const connections = queryKeys.connections.list(50);
		const qc = seeded(connections);
		await afterEngagementClosed(qc);
		expect(isStale(qc, connections)).toBe(true);
	});

	it("reads the engagement's live connection count again", async () => {
		const count = queryKeys.connections.activeCount(ENTRY);
		const qc = seeded(count);
		await afterEngagementClosed(qc);
		expect(isStale(qc, count)).toBe(true);
	});
});

describe("a mission skill write", () => {
	const access = queryKeys.roster.access(MISSION, ENTRY);

	it("attach reads every entry's access again", async () => {
		const qc = seeded(access, queryKeys.missionSkills.list(MISSION));
		await new MutationObserver(qc, {
			...attachSkillOptions(NO_API, qc, MISSION),
			mutationFn: async (_skillId: string) => ({}) as MissionSkill,
		}).mutate("skill");
		expect(isStale(qc, access)).toBe(true);
	});

	it("detach reads every entry's access again", async () => {
		const qc = seeded(access, queryKeys.missionSkills.list(MISSION));
		await new MutationObserver(qc, {
			...detachSkillOptions(NO_API, qc, MISSION),
			mutationFn: async (_skillId: string) => ({}),
		}).mutate("skill");
		expect(isStale(qc, access)).toBe(true);
	});

	it("reads access again when the server says someone else changed the list", async () => {
		const fail = (code: "CONFLICT" | "NOT_FOUND", status: number) =>
			new ApiError({
				method: "POST",
				path: `/api/missions/${MISSION}/skills`,
				kind: "contract",
				status,
				code,
				message: "for logs only",
				requestId: "req-1",
			});
		for (const [options, error, label] of [
			[attachSkillOptions, fail("CONFLICT", 409), "attach 409"],
			[detachSkillOptions, fail("NOT_FOUND", 404), "detach 404"],
		] as const) {
			const qc = seeded(access, queryKeys.missionSkills.list(MISSION));
			await new MutationObserver(qc, {
				...options(NO_API, qc, MISSION),
				mutationFn: (_skillId: string): Promise<never> => Promise.reject(error),
			})
				.mutate("skill")
				.catch(() => {});
			expect(isStale(qc, access), label).toBe(true);
		}
	});

	it("leaves another mission's access alone", async () => {
		const other = queryKeys.roster.access(
			"00000000-0000-4000-8000-000000000003",
			ENTRY,
		);
		const qc = seeded(other, queryKeys.missionSkills.list(MISSION));
		await new MutationObserver(qc, {
			...detachSkillOptions(NO_API, qc, MISSION),
			mutationFn: async (_skillId: string) => ({}),
		}).mutate("skill");
		expect(isStale(qc, other)).toBe(false);
	});
});

describe("an intake write (audit F7)", () => {
	const INTAKE = "00000000-0000-4000-8000-000000000010";
	const ENGAGEMENT = "00000000-0000-4000-8000-000000000011";
	const list = queryKeys.intakes.byEngagement(ENGAGEMENT, 50);
	const count = queryKeys.intakes.byEngagement(ENGAGEMENT, 1, "draft");
	const activity = queryKeys.activity.all();
	const missions = queryKeys.missions.all();
	const templates = queryKeys.templates.list();
	const answer = { id: INTAKE, status: "proposed" } as Intake;

	const run = async <V>(
		options: (
			api: ApiClient,
			qc: QueryClient,
			id: string,
		) => { onSuccess: (intake: Intake) => unknown },
		variables: V,
	) => {
		const qc = seeded(list, count, activity, missions, templates);
		await new MutationObserver(qc, {
			...options(NO_API, qc, INTAKE),
			mutationFn: async (_: V) => answer,
		}).mutate(variables);
		return qc;
	};

	for (const [name, options, variables] of [
		["revise", reviseIntakeOptions, { sourceMd: "x" }],
		["propose", proposeIntakeOptions, undefined],
		["read repo", readRepoOptions, { connectionId: "c", repoUrl: "r" }],
		["reject", rejectIntakeOptions, "Not now"],
		["approve", approveIntakeOptions, { missionType: "t", repoUrl: "r" }],
	] as const) {
		it(`${name} reads every intake list and the activity log again, and caches the answer`, async () => {
			const qc = await run(options as never, variables);
			expect(isStale(qc, list)).toBe(true);
			expect(isStale(qc, count)).toBe(true);
			expect(isStale(qc, activity)).toBe(true);
			expect(qc.getQueryData(queryKeys.intakes.detail(INTAKE))).toBe(answer);
		});
	}

	it("approve alone reads missions and the templates' mission counts again: it created one", async () => {
		const approved = await run(approveIntakeOptions as never, {});
		expect(isStale(approved, missions)).toBe(true);
		expect(isStale(approved, templates)).toBe(true);
		const proposed = await run(proposeIntakeOptions as never, undefined);
		expect(isStale(proposed, missions)).toBe(false);
		expect(isStale(proposed, templates)).toBe(false);
	});
});
