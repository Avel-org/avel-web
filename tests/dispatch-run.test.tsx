import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	type Dispatch,
	type DispatchStatus,
	dispatch as dispatchShape,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DispatchRun, dispatchRunNote } from "@/components/avel/dispatch-run";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiProvider } from "@/lib/api";
import {
	DISPATCH_STEP_POLL_MS,
	dispatchStepsQuery,
} from "@/lib/api/dispatches";
import { queryKeys } from "@/lib/api/keys";
import { step } from "./canon-fixtures";
import { fakeApi } from "./clients-fixtures";
import { tagOf } from "./render-page";

/*
 * A dispatch's run trace (GET /api/dispatches/:id/steps, avel-server
 * 63fe464): read after the last seq held, polled while the dispatch runs,
 * and drawn with the run trace Canon's turns use.
 */

const ID = "d15a7c01-5eed-4000-8000-000000000001";

function dispatch(status: DispatchStatus): Dispatch {
	const queued = status === "queued";
	return dispatchShape.parse({
		id: ID,
		missionId: "3fcd1ce4-5eed-4000-8000-000000000036",
		rosterEntryId: "e0e0e001-5eed-4000-8000-000000000001",
		agent: {
			templateId: "a7a5a7a5-5eed-4000-8000-000000000001",
			slug: "atlas",
			name: "Atlas",
			title: null,
		},
		territory: null,
		briefRef: null,
		status,
		haltReason: status === "halted" ? "operator" : null,
		estimatedTokens: 40_000,
		tokenSoftCeiling: 60_000,
		tokenHardCeiling: 120_000,
		softCeilingCrossed: false,
		tokensUsed: 0,
		tokensIn: 0,
		tokensOut: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		spendUsd: 0,
		wallClockMinutes: 45,
		agentVersionSha256: null,
		agentVersionRef: null,
		skillsSha256: null,
		briefSha256: null,
		model: queued ? null : "claude-opus-5-5",
		harnessVersion: null,
		reportId: null,
		wave: "A",
		startCommitSha: null,
		startDispatchIds: null,
		startedAt: queued ? null : "2026-10-12T13:48:00.000Z",
		closedAt:
			queued || status === "running" ? null : "2026-10-12T13:58:00.000Z",
		createdAt: "2026-10-12T13:40:00.000Z",
		updatedAt: "2026-10-12T13:58:00.000Z",
	} satisfies Dispatch);
}

/** A dispatch's turn is always null. */
const STEPS = [
	step(1, {
		turn: null,
		kind: "tool_call",
		label: "Calling room_read",
		detail: { tool: "room_read", toolUseId: "t1", input: { path: "src" } },
	}),
	step(2, {
		turn: null,
		kind: "tool_result",
		label: "room_read answered",
		detail: {
			tool: "room_read",
			toolUseId: "t1",
			callSeq: 1,
			isError: false,
			text: "3 files",
		},
	}),
	step(3, {
		turn: null,
		kind: "tool_call",
		label: "Calling report",
		detail: { tool: "report", toolUseId: "t2", input: {} },
	}),
];

function render(d: Dispatch, steps?: typeof STEPS) {
	const qc = new QueryClient({
		defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
	});
	if (steps) qc.setQueryData([...queryKeys.dispatches.steps(d.id)], steps);
	return renderToString(
		<ApiProvider client={fakeApi().client}>
			<QueryClientProvider client={qc}>
				<TooltipProvider>
					<DispatchRun dispatch={d} />
				</TooltipProvider>
			</QueryClientProvider>
		</ApiProvider>,
	);
}

describe("a dispatch's steps", () => {
	it("reads GET /api/dispatches/:id/steps after the last seq held", async () => {
		const { client, calls } = fakeApi(() => ({
			status: 200,
			body: { success: true, data: [STEPS[2]], meta: { lastSeq: 3 } },
		}));
		const qc = new QueryClient();
		qc.setQueryData([...queryKeys.dispatches.steps(ID)], STEPS.slice(0, 2));
		const rows = await qc.fetchQuery(dispatchStepsQuery(client, ID, qc));
		expect(rows.map((s) => s.seq)).toEqual([1, 2, 3]);
		expect(calls.map((c) => c.path)).toEqual([
			`http://avel.test/api/dispatches/${ID}/steps?afterSeq=2&limit=500`,
		]);
	});

	it("reads more than once per runner tick (5s), so a burst shows within seconds", () => {
		expect(DISPATCH_STEP_POLL_MS).toBeLessThan(5_000);
	});
});

describe("the Run section", () => {
	it("draws a running dispatch's trace live, a call paired with its answer", () => {
		const html = render(dispatch("running"), STEPS);
		expect(html).toContain(`data-testid="dispatch-trace-toggle-${ID}"`);
		expect(html).toContain("Working");
		expect(html).toContain(`data-testid="dispatch-trace-steps-${ID}"`);
	});

	it("folds a finished run's trace, ending on Calling report", () => {
		const html = render(dispatch("complete"), STEPS);
		expect(tagOf(html, `dispatch-trace-toggle-${ID}`)).toContain(
			'aria-expanded="false"',
		);
		expect(html).toContain("Worked");
	});

	it("says why there is no trace", () => {
		expect(dispatchRunNote(dispatch("queued"), undefined)).toMatch(
			/starts when the dispatch does/,
		);
		expect(dispatchRunNote(dispatch("running"), [])).toMatch(
			/Waiting for its first steps/,
		);
		expect(dispatchRunNote(dispatch("complete"), [])).toBe(
			"This run recorded no steps.",
		);
		expect(dispatchRunNote(dispatch("running"), STEPS)).toBeNull();
		expect(render(dispatch("queued"))).toContain(`dispatch-run-note-${ID}`);
	});
});
