import { describe, expect, it } from "vitest";
import { ancestorPaths, buildCrumbs } from "../src/shell/breadcrumbs";

describe("breadcrumbs", () => {
	it("a top-level page has no ancestors, so no trail", () => {
		expect(ancestorPaths("/missions")).toEqual([]);
		expect(ancestorPaths("/")).toEqual([]);
	});

	it("a nested page's ancestors run outermost first, excluding itself and Home", () => {
		expect(ancestorPaths("/missions/m1/exports/e9")).toEqual([
			"/missions",
			"/missions/m1",
			"/missions/m1/exports",
		]);
	});

	it("ignores a trailing slash", () => {
		expect(ancestorPaths("/missions/m1/")).toEqual(["/missions"]);
	});

	it("labels each ancestor and drops any with no label", () => {
		const labels: Record<string, string> = {
			"/missions": "Missions",
			"/missions/m1": "CounselOS slice 0",
		};
		expect(
			buildCrumbs("/missions/m1/exports/e9", (path) => labels[path]),
		).toEqual([
			{ label: "Missions", to: "/missions" },
			{ label: "CounselOS slice 0", to: "/missions/m1" },
		]);
	});
});

describe("crumbLabel against the real router", async () => {
	const { getRouter } = await import("../src/router");
	const { crumbLabel } = await import("../src/shell/breadcrumbs");
	const router = getRouter();

	it("labels a sidebar path from the sidebar", () => {
		expect(crumbLabel(router, "/missions")).toBe("Missions");
	});

	it("leaves out a path no route covers, despite fuzzy matching", () => {
		// /missions/$id covers one segment; the router would fuzzily match
		// this deeper path to it, and the guard must not.
		expect(crumbLabel(router, "/missions/abc/roster")).toBeUndefined();
		expect(crumbLabel(router, "/nowhere")).toBeUndefined();
	});

	it("labels a mission by its short id, from the route's crumb", () => {
		expect(
			crumbLabel(router, "/missions/0a1b2c3d-0000-4000-8000-000000000001"),
		).toBe("0a1b2c3d");
	});

	it("leaves out a real route that declares no crumb", () => {
		// /dev exists only as a prefix of /dev/primitives; /dev/primitives has no crumb.
		expect(crumbLabel(router, "/dev/primitives")).toBeUndefined();
	});
});

describe("crumbLabel's fuzzy-match guard", async () => {
	const { crumbLabel } = await import("../src/shell/breadcrumbs");
	type Router = Parameters<typeof crumbLabel>[0];
	// The real router resolves /reports/q3 to /reports when no $id route exists.
	// Here /reports declares a crumb, so only the guard stops it labelling /reports/q3.
	const router = {
		matchRoutes: () => [
			{ routeId: "__root__", pathname: "/", params: {}, staticData: {} },
			{
				routeId: "/reports",
				pathname: "/reports",
				params: {},
				staticData: { crumb: "Reports" },
			},
		],
	} as unknown as Router;

	it("labels the path the route covers", () => {
		expect(crumbLabel(router, "/reports")).toBe("Reports");
	});

	it("does not lend that label to a longer path it only fuzzily matched", () => {
		expect(crumbLabel(router, "/reports/q3")).toBeUndefined();
	});
});
