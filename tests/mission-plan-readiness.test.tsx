import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MissionPlan } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { countsLine, PlanReadiness } from "@/components/avel/plan-readiness";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiProvider } from "@/lib/api";
import { queryKeys } from "@/lib/api/keys";
import { readinessOf } from "@/lib/api/mission-plans";
import { fakeApi } from "./clients-fixtures";
import { MISSION_ID, plan } from "./mission-plan-fixtures";
import { tagOf } from "./render-page";

/** A plan with this brief and these check issues, nothing approved. */
function withIssues(
	issues: MissionPlan["check"]["issues"],
	brief: Partial<NonNullable<MissionPlan["brief"]>> = {},
): MissionPlan {
	const base = plan({ approvedBrief: null });
	return {
		...base,
		brief: base.brief && { ...base.brief, ...brief },
		check: { passed: issues.length === 0, issues },
	};
}

const states = (p: MissionPlan) =>
	readinessOf(p)?.segments.map((s) => `${s.id}:${s.state}`);

describe("each requirement's segment, resolved by path through the saved brief", () => {
	it("is solid in one module with no issue, empty in none", () => {
		// The fixture: M1 owns R1; R2 is in no module, which is its issue.
		expect(states(plan())).toEqual(["R1:solid", "R2:empty"]);
		expect(readinessOf(plan())?.segments[1]?.issues).toEqual([
			"R2 is in no module",
		]);
	});

	it("is hatched for an issue on a criterion that cites it", () => {
		const p = withIssues([
			{
				path: ["brief", "acceptanceCriteria", 0, "id"],
				message: "Criterion id AC1 is used more than once",
			},
		]);
		expect(states(p)).toEqual(["R1:hatched", "R2:empty"]);
	});

	it("is hatched for an issue on a module that lists it, and the module keeps it", () => {
		const p = withIssues([
			{
				path: ["brief", "modules", 0, "id"],
				message: "Module id M1 is used more than once",
			},
		]);
		expect(states(p)).toEqual(["R1:hatched", "R2:empty"]);
		expect(readinessOf(p)?.modules[0]?.issues).toEqual([
			"Module id M1 is used more than once",
		]);
	});

	it("is hatched when placed in two modules", () => {
		const p = withIssues(
			[
				{
					path: ["brief", "requirements", 0],
					message: "R1 is in more than one module: M1, M2",
				},
			],
			{
				modules: [
					{ id: "M1", name: "A", requirementIds: ["R1"] },
					{ id: "M2", name: "B", requirementIds: ["R1", "R2"] },
				],
			},
		);
		expect(states(p)).toEqual(["R1:hatched", "R2:solid"]);
	});

	it("is solid only in exactly one module, even when the check names nothing", () => {
		// Solid means exactly one module with no issue: two is never solid,
		// whatever the check said.
		const p = withIssues([], {
			modules: [
				{ id: "M1", name: "A", requirementIds: ["R1", "R2"] },
				{ id: "M2", name: "B", requirementIds: ["R1"] },
			],
		});
		expect(states(p)).toEqual(["R1:hatched", "R2:solid"]);
	});

	it("marks a repeated id by position, not by id", () => {
		const p = withIssues(
			[
				{
					path: ["brief", "requirements", 1, "id"],
					message: "Requirement id R1 is used more than once",
				},
			],
			{
				requirements: [
					{ id: "R1", text: "a" },
					{ id: "R1", text: "b" },
				],
				acceptanceCriteria: [],
				modules: [{ id: "M1", name: "A", requirementIds: ["R1"] }],
			},
		);
		expect(states(p)).toEqual(["R1:solid", "R1:hatched"]);
	});
});

describe("the plan-wide row", () => {
	it("holds every issue that touches no requirement", () => {
		const p = withIssues(
			[
				{ path: ["brief", "modules"], message: "The plan has no modules" },
				{
					path: ["brief", "acceptanceCriteria", 0, "requirementId"],
					message: "AC9 cites R9, which is not a requirement",
				},
				{ path: ["brief"], message: "The brief is missing" },
			],
			{
				acceptanceCriteria: [{ id: "AC9", requirementId: "R9", text: "x" }],
			},
		);
		expect(readinessOf(p)?.planWide).toEqual([
			"The plan has no modules",
			"AC9 cites R9, which is not a requirement",
			"The brief is missing",
		]);
		expect(states(p)).toEqual(["R1:solid", "R2:empty"]);
	});
});

describe("a module issue that reaches no requirement", () => {
	it("shows once, in the plan-wide row, for an empty or unknown module", () => {
		for (const requirementIds of [[], ["R9"]]) {
			const p = withIssues(
				[
					{
						path: ["brief", "modules", 0, "requirementIds", 0],
						message: "M1 lists R9, which is not a requirement",
					},
				],
				{ modules: [{ id: "M1", name: "A", requirementIds }] },
			);
			const readiness = readinessOf(p);
			expect(readiness?.planWide).toEqual([
				"M1 lists R9, which is not a requirement",
			]);
			expect(readiness?.modules[0]?.issues).toEqual([]);
		}
	});
});

describe("readiness with nothing to place", () => {
	it("is null for a brief that predates the shape", () => {
		expect(readinessOf(plan({ brief: null }))).toBeNull();
	});
});

describe("the counts line", () => {
	it("names only the states that occur, in words, never a score", () => {
		const line = countsLine(readinessOf(plan())?.segments ?? []);
		expect(line).toBe("1 placed · 1 in no module");
		expect(line).not.toMatch(/%|\//);
	});
});

/** PlanReadiness inside the real ApiProvider; the seed is the whole world. */
function render(
	compact: boolean,
	seed: { plan?: MissionPlan; error?: true } = {},
) {
	const qc = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				retryOnMount: false,
				staleTime: Number.POSITIVE_INFINITY,
			},
		},
	});
	const key = queryKeys.missionPlans.detail(MISSION_ID);
	if (seed.plan) qc.setQueryData(key, seed.plan);
	if (seed.error) {
		qc.getQueryCache()
			.build(qc, { queryKey: key })
			.setState({
				status: "error",
				fetchStatus: "idle",
				error: new Error("down") as never,
			});
	}
	return renderToString(
		<ApiProvider client={fakeApi().client}>
			<QueryClientProvider client={qc}>
				<TooltipProvider>
					<PlanReadiness missionId={MISSION_ID} compact={compact} />
				</TooltipProvider>
			</QueryClientProvider>
		</ApiProvider>,
	);
}

describe("the full readiness card (plan page)", () => {
	it("shows a segment per requirement, the modules, and what is in no module", () => {
		const html = render(false, { plan: plan() });
		expect(tagOf(html, "plan-readiness-segment-0")).toContain(
			'data-state="solid"',
		);
		expect(tagOf(html, "plan-readiness-segment-1")).toContain(
			'data-state="empty"',
		);
		expect(html).toContain('data-testid="plan-readiness-module-M1"');
		expect(html).toContain('data-testid="plan-readiness-unplaced"');
		expect(html).not.toContain('data-testid="plan-readiness-plan-wide"');
	});

	it("puts a hatched segment on the hatch utility", () => {
		const p = withIssues([
			{ path: ["brief", "requirements", 0], message: "R1 has no criterion" },
		]);
		expect(
			tagOf(render(false, { plan: p }), "plan-readiness-segment-0"),
		).toMatch(/\bbg-hatch-warn\b/);
	});
});

describe("the compact readiness (mission page's Brief panel)", () => {
	it("is the bar and one counts line", () => {
		const html = render(true, { plan: plan() });
		expect(html).toContain('data-testid="plan-readiness-bar"');
		expect(html).toMatch(
			/data-testid="plan-readiness-counts"[^>]*>1 placed · 1 in no module</,
		);
		expect(html).not.toContain('data-testid="plan-readiness-modules"');
	});

	it("loads as a skeleton at its final shape: a bar and a line", () => {
		const html = render(true);
		expect(tagOf(html, "plan-readiness-compact")).toContain(
			'data-state="loading"',
		);
		const skeleton = html.slice(
			html.indexOf('data-testid="plan-readiness-skeleton"'),
		);
		expect(
			skeleton.match(/data-slot="skeleton"/g)?.length,
		).toBeGreaterThanOrEqual(2);
		expect(skeleton).toMatch(/\bh-3\b/);
	});

	it("fails as one muted line, never an error card", () => {
		const html = render(true, { error: true });
		expect(html).toContain('data-testid="plan-readiness-unavailable"');
		expect(html).not.toContain('data-testid="surface-error"');
	});

	it("says No plan yet for a brief that predates the shape, with no empty bar", () => {
		const html = render(true, { plan: plan({ brief: null }) });
		expect(html).toMatch(/data-testid="plan-readiness-none"[^>]*>No plan yet</);
		expect(html).not.toContain('data-testid="plan-readiness-bar"');
	});
});
