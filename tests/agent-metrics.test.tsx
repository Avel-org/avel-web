import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { agentMetricsSchema } from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	AgentMeasures,
	firstPassLabel,
	MeasuresView,
} from "@/components/avel/agent-metrics";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiProvider } from "@/lib/api";
import { queryKeys } from "@/lib/api/keys";
import { fakeApi } from "./clients-fixtures";
import { tagOf } from "./render-page";

/*
 * An agent's measures (module 12): client and internal work never combined,
 * discipline across all its work, outcome one row per territory, template
 * and engagement, never summed, and an unrecorded measure never shown as 0.
 */

const AGENT = "00000000-0000-4000-8000-000000000701";

const metrics = (extra: Record<string, unknown> = {}) =>
	agentMetricsSchema.parse({
		agentTemplateId: AGENT,
		name: "Atlas",
		origin: "client",
		discipline: {
			dispatches: 7,
			blockersFiled: 2,
			blockedReports: 1,
			edgeMismatches: 0,
			testFileWritesCaught: 3,
			notRecorded: ["boundary_violations", "blockers_absorbed"],
		},
		outcome: [
			{
				territory: "scheduling",
				templateRef: "template-booking",
				engagementId: null,
				dispatches: 4,
				tokensUsed: 200_000,
				spendUsd: 4,
				wallClockMinutes: 90,
				missionsGated: 3,
				firstPassVerified: 2,
			},
			{
				territory: null,
				templateRef: "template-booking",
				engagementId: null,
				dispatches: 3,
				tokensUsed: 90_000,
				spendUsd: 1.5,
				wallClockMinutes: 40,
				missionsGated: 0,
				firstPassVerified: 0,
			},
		],
		...extra,
	});

function render(node: ReactNode, seed: (qc: QueryClient) => void = () => {}) {
	const qc = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
		},
	});
	seed(qc);
	return renderToString(
		<ApiProvider client={fakeApi().client}>
			<QueryClientProvider client={qc}>
				<TooltipProvider>{node}</TooltipProvider>
			</QueryClientProvider>
		</ApiProvider>,
	);
}

describe("an agent's measures", () => {
	it("reads client work first, with internal work a separate choice", () => {
		const html = render(<AgentMeasures agentId={AGENT} />, (qc) =>
			qc.setQueryData(
				[...queryKeys.dispatches.metrics(AGENT, "client")],
				metrics(),
			),
		);
		expect(tagOf(html, "agent-measures-origin-client")).toContain(
			'aria-pressed="true"',
		);
		expect(tagOf(html, "agent-measures-origin-internal")).toContain(
			'aria-pressed="false"',
		);
		expect(html).toContain('data-testid="agent-measures-view"');
	});

	it("shows a measure nothing records yet as not measured, never 0", () => {
		const html = render(<MeasuresView metrics={metrics()} />);
		for (const id of ["boundary_violations", "blockers_absorbed"]) {
			expect(tagOf(html, `agent-discipline-${id}`)).toContain(
				'data-recorded="false"',
			);
		}
		expect(html).toContain("Not measured");
		expect(html).toMatch(
			/data-testid="agent-discipline-dispatches"[\s\S]*?>7</,
		);
	});

	it("lists each territory and template as its own row, with no total", () => {
		const html = render(<MeasuresView metrics={metrics()} />);
		expect(html.match(/data-testid="agent-outcome-row"/g)).toHaveLength(2);
		expect(html).toContain("scheduling");
		expect(html).toContain("Whole project");
		// 7 runs is the discipline count; no outcome row adds 4 and 3.
		expect(html).not.toContain("7 runs");
	});

	it("says how many gated missions were verified first time, or that none were gated", () => {
		expect(firstPassLabel(3, 2)).toBe("2 of 3 verified first time");
		expect(firstPassLabel(0, 0)).toBe("No mission gated yet");
	});
});
