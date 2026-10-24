import { QueryClient } from "@tanstack/react-query";
import { gateJob } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import { createApiClient } from "@/lib/api/client";
import {
	afterGateRun,
	afterTriage,
	type GateOverride,
	gateAttemptFor,
	runGateRequest,
} from "@/lib/api/gate";
import { queryKeys } from "@/lib/api/keys";

/**
 * The gate's data layer: a resend of the same overrides is a replay (same
 * idempotency key), and each write refreshes exactly what it changed.
 */

const MISSION = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const SHA = "a".repeat(40);
const override = (findingId: string): GateOverride => ({
	findingId,
	commitSha: SHA,
	rationale: "Reviewed by hand",
});

describe("a gate attempt", () => {
	it("keeps its key for the same overrides, so a resend replays", () => {
		let n = 0;
		const fresh = () => `key-${++n}`;
		const first = gateAttemptFor(null, [override("f1")], fresh);
		expect(first.key).toBe("key-1");
		expect(gateAttemptFor(first, [override("f1")], fresh)).toBe(first);
	});

	it("takes a fresh key when the overrides change", () => {
		let n = 0;
		const fresh = () => `key-${++n}`;
		const first = gateAttemptFor(null, [], fresh);
		const second = gateAttemptFor(first, [override("f1")], fresh);
		expect(second.key).not.toBe(first.key);
	});
});

function seeded(...keys: readonly (readonly unknown[])[]) {
	const qc = new QueryClient({
		defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
	});
	for (const key of keys) qc.setQueryData([...key], {});
	return qc;
}
const stale = (qc: QueryClient, key: readonly unknown[]) =>
	qc.getQueryState([...key])?.isInvalidated;

describe("after a gate run", () => {
	it("reads the runs, every findings list and the log again, for that mission only", async () => {
		const runs = queryKeys.gate.runs(MISSION);
		const open = queryKeys.findings.list(MISSION, "open");
		const all = queryKeys.findings.list(MISSION);
		const log = queryKeys.activity.all();
		const otherRuns = queryKeys.gate.runs(OTHER);
		const qc = seeded(runs, open, all, log, otherRuns);
		await afterGateRun(qc, MISSION);
		for (const key of [runs, open, all, log]) expect(stale(qc, key)).toBe(true);
		expect(stale(qc, otherRuns)).toBe(false);
	});

	it("keeps a run's receipt: it never changes", async () => {
		const receipt = queryKeys.gate.run(MISSION, "run-1");
		const qc = seeded(receipt);
		await afterTriage(qc, MISSION);
		expect(stale(qc, receipt)).toBe(false);
		await afterGateRun(qc, MISSION);
		expect(stale(qc, receipt)).toBe(false);
	});

	it("reads the mission's row and the lists again, not what sits under the row", async () => {
		const row = queryKeys.missions.detail(MISSION);
		const list = queryKeys.missions.list({});
		const dispatches = queryKeys.dispatches.list(MISSION);
		const exports = queryKeys.exports.list(MISSION);
		const otherRow = queryKeys.missions.detail(OTHER);
		const qc = seeded(row, list, dispatches, exports, otherRow);
		await afterGateRun(qc, MISSION);
		expect(stale(qc, row)).toBe(true);
		expect(stale(qc, list)).toBe(true);
		// A job changes neither the dispatches nor the exports under it.
		expect(stale(qc, dispatches)).toBe(false);
		expect(stale(qc, exports)).toBe(false);
		expect(stale(qc, otherRow)).toBe(false);
	});
});

describe("after a triage", () => {
	it("reads the findings lists and the log again, not the runs", async () => {
		const runs = queryKeys.gate.runs(MISSION);
		const open = queryKeys.findings.list(MISSION, "open");
		const confirmed = queryKeys.findings.list(MISSION, "confirmed");
		const qc = seeded(runs, open, confirmed, queryKeys.activity.all());
		await afterTriage(qc, MISSION);
		expect(stale(qc, open)).toBe(true);
		expect(stale(qc, confirmed)).toBe(true);
		expect(stale(qc, runs)).toBe(false);
	});
});

describe("queuing a gate run", () => {
	const JOB = gateJob.parse({
		id: "00000000-0000-4000-8000-000000000611",
		missionId: MISSION,
		status: "queued",
		gateRunId: null,
		failure: null,
		progress: null,
		ahead: 1,
		queuedAt: "2026-10-23T10:00:00.000Z",
		startedAt: null,
		finishedAt: null,
	});
	const answering = (status: number, headers: Record<string, string>) =>
		createApiClient({
			baseUrl: "http://avel.test",
			api: async () => ({
				status,
				body: { success: true, data: JOB },
				headers: new Headers(headers),
			}),
		});
	const attempt = { key: "k1", overrides: [override("f1")] };

	it("says when the answer is the mission's existing job, whose overrides stand", async () => {
		const api = answering(200, { "Gate-Job-Existing": "true" });
		const queued = await runGateRequest(api, MISSION, attempt);
		expect(queued).toEqual({ job: JOB, existing: true });
	});

	it("is its own job on a new queue or a replay", async () => {
		for (const [status, headers] of [
			[202, {}],
			[200, { "Idempotency-Replayed": "true" }],
		] as const) {
			const queued = await runGateRequest(
				answering(status, headers),
				MISSION,
				attempt,
			);
			expect(queued.existing).toBe(false);
		}
	});
});
