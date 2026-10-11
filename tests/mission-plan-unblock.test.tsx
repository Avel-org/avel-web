import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { CoherenceResult } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UnblockCard, unblockRows } from "@/components/avel/plan-unblock";
import { ApiProvider } from "@/lib/api";
import { queryKeys } from "@/lib/api/keys";
import { planAnchor } from "@/lib/api/mission-plans";
import { fakeApi } from "./clients-fixtures";
import { MISSION_ID, plan } from "./mission-plan-fixtures";

const blocked: CoherenceResult = {
	block: { code: "no_agents_in_first_wave", reason: "for logs", wave: "A" },
	warnings: [
		{
			code: "vertical_cut_roles_unassigned",
			reason: "for logs",
			missing: ["verification"],
		},
	],
};

describe("what unblocks shipping", () => {
	it("lists the block first, then warnings, then plan issues, each counted", () => {
		const rows = unblockRows(plan(), blocked);
		expect(rows.map((r) => [r.to, r.count])).toEqual([
			["playbook", "Clears 1 block"],
			["playbook", "Warning 1 of 1"],
			["plan", "Issue 1 of 1"],
		]);
		expect(rows.some((r) => /\d+%|points|score/i.test(r.count))).toBe(false);
	});

	it("keeps a plan issue's message as the server wrote it, and links its item", () => {
		const [issue] = unblockRows(plan(), null);
		expect(issue?.message).toBe("R2 is in no module");
		expect(issue?.hash).toBe("plan-requirement-R2");
	});

	it("is empty when the check passes and coherence is clear", () => {
		const passing = plan({ check: { passed: true, issues: [] } });
		expect(unblockRows(passing, { warnings: [] })).toEqual([]);
	});

	it("anchors items, lists and fields alike", () => {
		expect(planAnchor("module:M1")).toBe("plan-module-M1");
		expect(planAnchor("modules")).toBe("plan-modules");
	});

	it("renders each row with a Resolve link to the item", async () => {
		const qc = new QueryClient({
			defaultOptions: {
				queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
			},
		});
		qc.setQueryData(queryKeys.missionPlans.detail(MISSION_ID), plan());
		const root = createRootRoute({
			component: () => (
				<UnblockCard
					mission={{
						id: MISSION_ID,
						cut: "vertical",
						playbook: null,
					}}
				/>
			),
		});
		const router = createRouter({
			routeTree: root.addChildren([
				createRoute({ getParentRoute: () => root, path: "/missions/$id/plan" }),
				createRoute({
					getParentRoute: () => root,
					path: "/missions/$id/playbook",
				}),
			]),
			history: createMemoryHistory({ initialEntries: ["/"] }),
		});
		await router.load();
		const html = renderToString(
			<ApiProvider client={fakeApi().client}>
				<QueryClientProvider client={qc}>
					<RouterProvider router={router} />
				</QueryClientProvider>
			</ApiProvider>,
		);
		expect(html).toMatch(
			new RegExp(
				`data-testid="unblock-resolve-issue-0"[^>]*href="/missions/${MISSION_ID}/plan#plan-requirement-R2"|href="/missions/${MISSION_ID}/plan#plan-requirement-R2"[^>]*data-testid="unblock-resolve-issue-0"`,
			),
		);
		expect(html).toContain(">R2 is in no module<");
	});
});
