import { readFileSync } from "node:fs";
import { BotMessageSquare } from "lucide-react";
import { describe, expect, it } from "vitest";
import { getRouter } from "../src/router";
import { ancestorPaths } from "../src/shell/breadcrumbs";
import {
	ALL_LINKS,
	isParent,
	isWithin,
	NAV,
	type NavItem,
	parentFor,
	UNLINKED_ROUTES,
} from "../src/shell/nav";

// Paths the route generator actually produced, read from its own output —
// not re-derived from file names, which would only test this test's guess.
const generated = readFileSync(
	new URL("../src/routeTree.gen.ts", import.meta.url),
	"utf8",
);
const routePaths = new Set(
	[...generated.matchAll(/fullPath: '([^']+)'/g)]
		.map((m) => m[1])
		.filter((p): p is string => p !== undefined),
);

// Each route's crumb, read from the router the app builds, by full path.
const crumbs = new Map(
	Object.entries(getRouter().routesByPath).map(([path, route]) => [
		path,
		route.options.staticData?.crumb,
	]),
);

/**
 * Routes no one can reach: neither a sidebar link nor an unlinked dev route,
 * nor a page under a sidebar link that declares a crumb (so breadcrumbs lead
 * back to the sidebar from it).
 */
function orphans(routes: { path: string; crumb?: unknown }[]): string[] {
	const linked = new Set([...ALL_LINKS.map((l) => l.to), ...UNLINKED_ROUTES]);
	return routes
		.filter(({ path, crumb }) => {
			if (linked.has(path)) return false;
			if (crumb === undefined) return true;
			return !ancestorPaths(path).some((a) => linked.has(a));
		})
		.map(({ path }) => path);
}

describe("Home, where the owner talks to Canon", () => {
	it("is the first link, at /, with its own purpose and icon", () => {
		const canon = ALL_LINKS[0];
		expect(canon?.label).toBe("Home");
		expect(canon?.to).toBe("/");
		expect(canon?.purpose).toBe(
			"Ask Canon about your missions, plan the next one, and see what needs you.",
		);
		expect(canon?.icon).toBe(BotMessageSquare);
	});
});

describe("the sidebar and the route tree agree", () => {
	it("found routes in the generated tree", () => {
		expect(routePaths.size).toBeGreaterThan(0);
	});

	it("every sidebar link has a route", () => {
		const missing = ALL_LINKS.map((l) => l.to).filter(
			(to) => !routePaths.has(to),
		);
		expect(missing).toEqual([]);
	});

	it("every route is reachable from the sidebar", () => {
		const orphaned = orphans(
			[...routePaths].map((path) => ({ path, crumb: crumbs.get(path) })),
		);
		expect(orphaned).toEqual([]);
	});

	it("allows a page under a sidebar link only when it declares a crumb", () => {
		expect(orphans([{ path: "/missions/$id", crumb: "m" }])).toEqual([]);
		// No crumb: breadcrumbs could not label it, so it is an orphan.
		expect(orphans([{ path: "/missions/$id" }])).toEqual(["/missions/$id"]);
		// A crumb is no way in when no ancestor is in the sidebar.
		expect(orphans([{ path: "/nowhere/$id", crumb: "n" }])).toEqual([
			"/nowhere/$id",
		]);
	});

	it("exempts only real /dev/ routes from the sidebar", () => {
		for (const path of UNLINKED_ROUTES) {
			expect(path).toMatch(/^\/dev\//);
			expect(routePaths.has(path)).toBe(true);
		}
	});

	// Ruling 40's twelve and Templates, less Playbooks, which became Teams'
	// second section (operator request, 2026-10-20).
	it("has twelve links in three groups", () => {
		expect(NAV.map((g) => g.label)).toEqual(["Work", "Library", "Control"]);
		expect(ALL_LINKS).toHaveLength(12);
		expect(new Set(ALL_LINKS.map((l) => l.to)).size).toBe(12);
	});
});

/** Each item as "Label" or "Label (Child, Child)", in sidebar order. */
const outline = (items: NavItem[]) =>
	items.map((item) =>
		isParent(item)
			? `${item.label} (${item.children.map((c) => c.label).join(", ")})`
			: item.label,
	);

describe("the sidebar's nesting (ruling 13)", () => {
	it("nests Agents and Settings, and nothing else", () => {
		expect(NAV.map((group) => [group.label, outline(group.items)])).toEqual([
			["Work", ["Home", "Missions", "Clients"]],
			[
				"Library",
				["Agents (All agents, Skills)", "Teams", "Templates", "Drive"],
			],
			[
				"Control",
				["Activity", "Settings (Repositories, Connections, Account)"],
			],
		]);
	});

	it("keeps the twelve leaf links in sidebar order, parents excluded", () => {
		expect(ALL_LINKS.map((l) => l.label)).toEqual([
			"Home",
			"Missions",
			"Clients",
			"All agents",
			"Skills",
			"Teams",
			"Templates",
			"Drive",
			"Activity",
			"Repositories",
			"Connections",
			"Account",
		]);
	});

	it("a parent is not a page: it has no route and no path of its own", () => {
		const parents = NAV.flatMap((g) => g.items).filter(isParent);
		expect(parents.map((p) => p.label)).toEqual(["Agents", "Settings"]);
		for (const parent of parents) {
			expect(parent).not.toHaveProperty("to");
			expect(parent.children.length).toBeGreaterThan(0);
			// The children share a first segment, and nothing is routed there.
			const prefixes = new Set(parent.children.map((c) => c.to.split("/")[1]));
			expect(prefixes.size).toBe(1);
			expect(routePaths.has(`/${[...prefixes][0]}`)).toBe(false);
		}
	});

	it("finds the parent that opens for the current page", () => {
		expect(parentFor("/catalog/skills")?.label).toBe("Agents");
		expect(parentFor("/catalog/skills/some-skill")?.label).toBe("Agents");
		expect(parentFor("/settings/account")?.label).toBe("Settings");
		expect(parentFor("/missions")).toBeUndefined();
		expect(parentFor("/")).toBeUndefined();
		expect(parentFor("/catalogue")).toBeUndefined();
	});

	it("matches a page or the pages under it, and Home only exactly", () => {
		expect(isWithin("/missions", "/missions")).toBe(true);
		expect(isWithin("/missions/m1", "/missions")).toBe(true);
		expect(isWithin("/missionsx", "/missions")).toBe(false);
		expect(isWithin("/missions", "/")).toBe(false);
		expect(isWithin("/", "/")).toBe(true);
	});
});
