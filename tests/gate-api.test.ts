import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
	afterGateRun,
	afterTriage,
	type GateOverride,
	gateAttemptFor,
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
