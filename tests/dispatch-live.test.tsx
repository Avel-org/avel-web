import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	type Dispatch,
	type DispatchStatus,
	dispatch as dispatchShape,
} from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DispatchCard } from "@/components/avel/dispatch-board";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiProvider } from "@/lib/api";
import {
	DISPATCH_POLL_MS,
	dispatchQuery,
	useDispatch,
} from "@/lib/api/dispatches";
import { queryKeys } from "@/lib/api/keys";
import { fakeApi } from "./clients-fixtures";
import { tagOf } from "./render-page";

/*
 * One dispatch read alone (GET /api/dispatches/:id), for the card that
 * opens it: seeded from the mission's list so nothing flashes, polled while
 * it waits or runs so the open card stays live by itself, and under the
 * mission's detail key so every dispatch write reads it again.
 */

const MISSION = "3fcd1ce4-5eed-4000-8000-000000000036";
const SHA = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

let n = 0;
function dispatch(status: DispatchStatus, over: Partial<Dispatch> = {}) {
	n += 1;
	const queued = status === "queued";
	const closed = !queued && status !== "running";
	return dispatchShape.parse({
		id: `d15a7c${String(n).padStart(2, "0")}-5eed-4000-8000-0000000000${String(n).padStart(2, "0")}`,
		missionId: MISSION,
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
		agentVersionSha256: queued ? null : SHA,
		agentVersionRef: queued ? null : "atlas@v3",
		skillsSha256: null,
		briefSha256: null,
		model: queued ? null : "claude-opus-5-5",
		harnessVersion: null,
		reportId: null,
		startCommitSha: null,
		startDispatchIds: null,
		startedAt: queued ? null : "2026-10-12T13:48:00.000Z",
		closedAt: closed ? "2026-10-12T13:58:00.000Z" : null,
		createdAt: "2026-10-12T13:40:00.000Z",
		updatedAt: "2026-10-12T13:58:00.000Z",
		...over,
	} satisfies Dispatch);
}

function withData(node: ReactNode, queryClient: QueryClient) {
	return renderToString(
		<ApiProvider client={fakeApi().client}>
			<QueryClientProvider client={queryClient}>
				<TooltipProvider>{node}</TooltipProvider>
			</QueryClientProvider>
		</ApiProvider>,
	);
}

/** What useDispatch answers, as attributes. */
function Probe({ id }: { id: string }) {
	const query = useDispatch(MISSION, id);
	return (
		<p
			data-testid="probe"
			data-state={query.status}
			data-status={query.data?.status ?? "none"}
			data-read-at={query.dataUpdatedAt}
		/>
	);
}

describe("one dispatch, read alone", () => {
	it("reads GET /api/dispatches/:id", async () => {
		const running = dispatch("running");
		const { client, calls } = fakeApi(() => ({
			status: 200,
			body: { success: true, data: running },
		}));
		const data = await new QueryClient().fetchQuery(
			dispatchQuery(client, MISSION, running.id),
		);
		expect(data).toEqual(running);
		expect(calls).toEqual([
			{
				method: "GET",
				path: `http://avel.test/api/dispatches/${running.id}`,
				body: undefined,
			},
		]);
	});

	it("polls while it waits or runs, and stops once it closes", () => {
		const interval = dispatchQuery(fakeApi().client, MISSION, "x")
			.refetchInterval as (query: unknown) => number | false;
		const at = (d: Dispatch | undefined) => interval({ state: { data: d } });
		expect(at(dispatch("queued"))).toBe(DISPATCH_POLL_MS);
		expect(at(dispatch("running"))).toBe(DISPATCH_POLL_MS);
		for (const s of ["blocked", "complete", "failed", "halted"] as const) {
			expect(at(dispatch(s)), s).toBe(false);
		}
		expect(at(undefined)).toBe(false);
	});

	it("sits under the mission's detail key, beside the list", () => {
		const key = queryKeys.dispatches.detail(MISSION, "x");
		expect(key.slice(0, 3)).toEqual(queryKeys.missions.detail(MISSION));
		expect(key).not.toEqual(queryKeys.dispatches.list(MISSION));
	});

	it("opens from the mission's list with no wait, as old as the list's read", () => {
		const running = dispatch("running");
		const qc = new QueryClient();
		qc.setQueryData(queryKeys.dispatches.list(MISSION), [running], {
			updatedAt: 1_234,
		});
		const html = withData(<Probe id={running.id} />, qc);
		const probe = tagOf(html, "probe");
		expect(probe).toContain('data-state="success"');
		expect(probe).toContain('data-status="running"');
		expect(probe).toContain('data-read-at="1234"');
	});

	it("prefers its own read once it has one", () => {
		const queued = dispatch("queued");
		const qc = new QueryClient();
		qc.setQueryData(queryKeys.dispatches.list(MISSION), [queued]);
		qc.setQueryData(queryKeys.dispatches.detail(MISSION, queued.id), {
			...queued,
			status: "running",
		});
		expect(tagOf(withData(<Probe id={queued.id} />, qc), "probe")).toContain(
			'data-status="running"',
		);
	});

	it("waits for its own read when the list does not hold it (a deep link)", () => {
		const qc = new QueryClient();
		qc.setQueryData(queryKeys.dispatches.list(MISSION), []);
		const probe = tagOf(withData(<Probe id="absent" />, qc), "probe");
		expect(probe).toContain('data-state="pending"');
		expect(probe).toContain('data-status="none"');
	});
});

describe("a live card", () => {
	it("needs no data layer while closed, and draws as a plain card", () => {
		const d = dispatch("complete");
		const plain = renderToString(
			<TooltipProvider>
				<DispatchCard dispatch={d} />
			</TooltipProvider>,
		);
		const live = renderToString(
			<TooltipProvider>
				<DispatchCard dispatch={d} live />
			</TooltipProvider>,
		);
		const ids = (html: string) => html.replace(/_R_[a-z0-9]+_/gi, "id");
		expect(ids(live)).toBe(ids(plain));
	});

	it("opens the identity version it ran as, by its hash", () => {
		const d = dispatch("running");
		const html = renderToString(
			<TooltipProvider>
				<DispatchCard dispatch={d} />
			</TooltipProvider>,
		);
		const trigger = tagOf(html, `dispatch-card-version-${d.id}`);
		expect(trigger).toContain('type="button"');
		expect(trigger).toContain('aria-haspopup="dialog"');
		expect(trigger).toContain(`data-lookup="${SHA}"`);
		expect(trigger).toContain('aria-label="Open identity version atlas@v3"');
	});

	it("a queued one has no version to open yet", () => {
		const d = dispatch("queued");
		const html = renderToString(
			<TooltipProvider>
				<DispatchCard dispatch={d} />
			</TooltipProvider>,
		);
		expect(html).not.toContain(`dispatch-card-version-${d.id}`);
		expect(html).toContain("Identity set when it starts");
	});
});
